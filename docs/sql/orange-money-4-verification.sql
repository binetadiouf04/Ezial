-- ============================================================================
-- Orange Money (QR Code – OM) — migration 4/4 : VÉRIFICATION, ANNULATION PRUDENTE, ADMINISTRATION
--   * l'ancien QR remplacé est conservé (« superseded ») et reste surveillé ;
--   * une tentative Orange n'est jamais déclarée expirée sur la seule horloge locale :
--     seule une vérification auprès d'Orange la clôt (provider_closed_at) ;
--   * une commande n'est annulée (et le stock restitué) que si TOUTES ses tentatives sont closes
--     chez Orange et que le délai de grâce est dépassé ; statut incertain : jamais d'annulation ;
--   * paiement tardif sur commande annulée : jamais de réactivation automatique, anomalie pour l'administrateur ;
--   * Wave : comportement inchangé (mêmes règles qu'avant pour les transactions Wave).
-- Prérequis : migrations 1, 2 et 3. Sûre à relancer. Retour arrière : orange-money-retour-arriere.sql
-- ============================================================================
begin;

-- ── Création d'une tentative : Orange Money = interrupteur propre, délai, historique conservé ─
create or replace function public.payments_create_transaction(p_order_id uuid, p_provider text, p_user_id uuid)
returns public.payment_transactions language plpgsql security definer set search_path = '' as $function$
declare o public.orders; t public.payment_transactions; s public.payment_settings; v_enabled boolean;
begin
  select * into s from public.payment_settings where id;
  if p_provider not in ('wave', 'orange_money') then raise exception 'Moyen de paiement inconnu.' using errcode = 'P0001'; end if;
  v_enabled := case when p_provider = 'orange_money' then coalesce(s.orange_money_enabled, false) else coalesce(s.collections_enabled, false) end;
  if not v_enabled then
    raise exception 'Le paiement en ligne est en cours d''activation.' using errcode = 'P0001';
  end if;
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null or o.customer_id is distinct from p_user_id then raise exception 'Commande introuvable.' using errcode = 'P0001'; end if;
  if o.status = 'cancelled' then raise exception 'Cette commande est annulée.' using errcode = 'P0001'; end if;
  if o.payment_status = 'paid' then raise exception 'Cette commande est déjà payée.' using errcode = 'P0001'; end if;
  if coalesce(o.total_amount, 0) <= 0 then raise exception 'Montant de commande invalide.' using errcode = 'P0001'; end if;
  if p_provider = 'orange_money' and not o.payment_required then
    raise exception 'Cette commande ne peut pas être payée avec Orange Money.' using errcode = 'P0001';
  end if;
  if o.payment_required and p_provider <> 'orange_money' then
    raise exception 'Cette commande doit être payée avec Orange Money.' using errcode = 'P0001';
  end if;
  if o.payment_required and o.payment_deadline - now() < interval '60 seconds' then
    raise exception 'Le délai de paiement est dépassé.' using errcode = 'P0001';
  end if;

  select * into t from public.payment_transactions
   where order_id = o.id and status in ('initiated', 'pending') and provider = p_provider and amount = o.total_amount
     and (expires_at is null or expires_at > now());
  if t.id is not null then return t; end if;

  if p_provider = 'orange_money' then
    -- L'ancien QR peut encore être payé chez Orange : il est conservé et reste surveillé.
    update public.payment_transactions set status = 'superseded', superseded_at = now(), failure_reason = 'remplacée par une nouvelle tentative', updated_at = now()
     where order_id = o.id and status in ('initiated', 'pending');
  else
    update public.payment_transactions set status = 'cancelled', failure_reason = 'remplacée par une nouvelle tentative', updated_at = now()
     where order_id = o.id and status in ('initiated', 'pending');
  end if;

  insert into public.payment_transactions (order_id, provider, amount, idempotency_key)
  values (o.id, p_provider, o.total_amount, 'pay_' || replace(gen_random_uuid()::text, '-', ''))
  returning * into t;
  update public.orders set payment_method = p_provider where id = o.id and payment_method is distinct from p_provider;
  perform ezial_private.audit('service', 'payment_initiated', 'payment_transaction', t.id, jsonb_build_object('order_id', o.id, 'provider', p_provider, 'amount', t.amount));
  return t;
end;
$function$;

-- ── Échec / expiration : clôture chez le fournisseur enregistrée ─────────────
create or replace function public.payments_fail(p_transaction_id uuid, p_status text, p_reason text) returns text
language plpgsql security definer set search_path = '' as $function$
declare t public.payment_transactions;
begin
  if p_status not in ('failed', 'cancelled', 'expired') then raise exception 'Statut invalide.'; end if;
  select * into t from public.payment_transactions where id = p_transaction_id for update;
  if t.id is null then return 'not_found'; end if;
  if t.status not in ('initiated', 'pending', 'superseded') then return t.status; end if;   -- jamais une transaction confirmée
  update public.payment_transactions set status = p_status, failure_reason = left(p_reason, 300),
    provider_closed_at = coalesce(provider_closed_at, now()), updated_at = now() where id = t.id;
  perform ezial_private.audit('service', 'payment_' || p_status, 'payment_transaction', t.id, jsonb_build_object('reason', left(p_reason, 300)));
  return p_status;
end;
$function$;

-- ── Confirmation : mêmes règles qu'avant + anomalies enregistrées, jamais de réactivation automatique ─
create or replace function public.payments_confirm(p_transaction_id uuid, p_provider_reference text, p_confirmed_amount integer) returns text
language plpgsql security definer set search_path = '' as $function$
declare t public.payment_transactions; o public.orders;
begin
  select * into t from public.payment_transactions where id = p_transaction_id for update;
  if t.id is null then return 'not_found'; end if;
  if t.status = 'confirmed' then return 'already_confirmed'; end if;
  if t.status = 'duplicate' then return 'duplicate_payment'; end if;
  select * into o from public.orders where id = t.order_id for update;

  if p_confirmed_amount is distinct from t.amount or t.amount is distinct from o.total_amount then
    perform ezial_private.emit_event('finance.anomaly', t.id, 'amount_mismatch', jsonb_build_object('reason', 'Montant confirmé différent du montant attendu.',
      'expected', t.amount, 'order_total', o.total_amount, 'confirmed', p_confirmed_amount));
    perform ezial_private.audit('service', 'payment_amount_mismatch', 'payment_transaction', t.id, jsonb_build_object('expected', t.amount, 'confirmed', p_confirmed_amount));
    insert into public.payment_anomalies (order_id, transaction_id, kind, details)
    values (o.id, t.id, 'amount_mismatch', jsonb_build_object('order_number', o.order_number, 'provider', t.provider, 'expected', t.amount, 'order_total', o.total_amount, 'confirmed', p_confirmed_amount))
    on conflict do nothing;
    return 'amount_mismatch';
  end if;

  if exists (select 1 from public.payment_transactions x where x.order_id = t.order_id and x.status = 'confirmed') then
    update public.payment_transactions set status = 'duplicate', failure_reason = 'paiement en double',
      provider_closed_at = coalesce(provider_closed_at, now()), updated_at = now() where id = t.id;
    perform ezial_private.emit_event('finance.anomaly', t.id, 'double_payment', jsonb_build_object('reason', 'Deuxième paiement confirmé pour la même commande : remboursement à prévoir.'));
    insert into public.payment_anomalies (order_id, transaction_id, kind, details)
    values (o.id, t.id, 'double_payment', jsonb_build_object('order_number', o.order_number, 'provider', t.provider, 'amount', t.amount))
    on conflict do nothing;
    return 'duplicate_payment';
  end if;

  update public.payment_transactions set status = 'confirmed', confirmed_at = now(), updated_at = now(),
    provider_closed_at = coalesce(provider_closed_at, now()),
    provider_reference = coalesce(p_provider_reference, provider_reference), failure_reason = null where id = t.id;
  perform ezial_private.audit('service', 'payment_confirmed', 'payment_transaction', t.id, jsonb_build_object('order_id', o.id, 'amount', t.amount, 'provider', t.provider));
  perform ezial_private.emit_event('payment.confirmed', o.id, null, jsonb_build_object('provider', t.provider, 'amount', t.amount));

  if o.status = 'cancelled' then
    -- Paiement tardif : la commande reste annulée, le stock reste restitué. Traitement manuel par l'administrateur.
    perform ezial_private.emit_event('finance.anomaly', o.id, 'paid_but_cancelled', jsonb_build_object('reason', 'Paiement confirmé sur une commande annulée : remboursement à prévoir.'));
    insert into public.payment_anomalies (order_id, transaction_id, kind, details)
    values (o.id, t.id, 'late_payment_on_cancelled_order', jsonb_build_object('order_number', o.order_number, 'provider', t.provider, 'amount', t.amount))
    on conflict do nothing;
    return 'confirmed_on_cancelled_order';
  end if;
  update public.orders set payment_status = 'paid' where id = o.id and payment_status is distinct from 'paid';
  return 'confirmed';
end;
$function$;

-- ── Maintenance : Orange Money n'expire JAMAIS sur l'horloge locale ──────────
create or replace function public.payments_maintenance() returns void language plpgsql security definer set search_path = '' as $function$
begin
  update public.payment_transactions set status = 'expired', failure_reason = 'délai dépassé', updated_at = now()
   where status in ('initiated', 'pending') and provider is distinct from 'orange_money'
     and coalesce(expires_at, created_at + interval '2 hours') < now();
end;
$function$;

-- ── Vérification auprès d'Orange (appelée par une fonction Edge, jamais par le navigateur) ─
create or replace function public.payments_reconcile_candidates(p_limit integer default 50)
returns table (transaction_id uuid, order_id uuid, reference text, status text, expires_at timestamptz, created_at timestamptz, check_count integer)
language sql stable security definer set search_path = '' as $$
  select t.id, t.order_id, t.id::text, t.status, t.expires_at, t.created_at, t.check_count
    from public.payment_transactions t
   where t.provider = 'orange_money' and t.provider_closed_at is null and t.status in ('initiated', 'pending', 'superseded')
     and t.created_at > now() - interval '72 hours'
     and (t.last_checked_at is null or t.last_checked_at < now() - interval '45 seconds')
   order by t.last_checked_at nulls first, t.created_at
   limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

-- p_provider_status : confirmed | pending | failed | cancelled | expired | not_found | unknown
create or replace function public.payments_record_verification(p_transaction_id uuid, p_provider_status text, p_amount integer default null, p_provider_transaction_id text default null)
returns text language plpgsql security definer set search_path = '' as $function$
declare t public.payment_transactions; v_valid_end timestamptz;
begin
  if p_provider_status not in ('confirmed', 'pending', 'failed', 'cancelled', 'expired', 'not_found', 'unknown') then raise exception 'Statut invalide.'; end if;
  select * into t from public.payment_transactions where id = p_transaction_id for update;
  if t.id is null then return 'not_found'; end if;
  update public.payment_transactions set last_checked_at = now(), check_count = check_count + 1, verified_status = p_provider_status,
    provider_transaction_id = coalesce(provider_transaction_id, p_provider_transaction_id), updated_at = now() where id = t.id;

  if p_provider_status = 'confirmed' then
    if p_amount is null then return 'amount_missing'; end if;
    return 'confirm:' || public.payments_confirm(t.id, null, p_amount);
  elsif p_provider_status in ('failed', 'cancelled', 'expired') then
    return 'fail:' || public.payments_fail(t.id, p_provider_status, 'Statut Orange Money : ' || p_provider_status);
  elsif p_provider_status = 'not_found' then
    -- Aucune transaction chez Orange : le QR n'a pas été payé. On ne conclut qu'après la fin de validité du QR + 5 minutes.
    v_valid_end := coalesce(t.expires_at, t.created_at + interval '1 hour');
    if now() > v_valid_end + interval '5 minutes' then
      return 'closed:' || public.payments_fail(t.id, 'expired', 'Aucune transaction Orange Money après la fin de validité du QR');
    end if;
    return 'waiting';
  end if;
  return 'waiting';   -- pending / unknown : rien ne change
end;
$function$;

-- ── Annulation prudente des commandes jamais payées (tâche planifiée toutes les minutes) ─
create or replace function ezial_private.orders_finalize_unpaid() returns integer
language plpgsql security definer set search_path = '' as $function$
declare o public.orders; v_count integer := 0;
begin
  for o in select * from public.orders
            where payment_required and paid_processed_at is null and payment_status = 'pending' and status <> 'cancelled'
              and payment_grace_until < now()
            order by payment_grace_until limit 100 for update skip locked loop
    -- 1. Une tentative pas encore close chez Orange : on attend (jamais d'annulation sur statut incertain).
    if exists (select 1 from public.payment_transactions t
                where t.order_id = o.id and t.status in ('initiated', 'pending', 'superseded') and t.provider_closed_at is null) then
      if now() > o.payment_grace_until + interval '24 hours' then
        insert into public.payment_anomalies (order_id, kind, details)
        values (o.id, 'payment_uncertain', jsonb_build_object('order_number', o.order_number, 'reason', 'Statut Orange Money toujours incertain 24 h après le délai de grâce.'))
        on conflict do nothing;
        perform ezial_private.emit_event('finance.anomaly', o.id, 'payment_uncertain', jsonb_build_object('reason', 'Statut Orange Money incertain depuis plus de 24 h.'));
      end if;
      continue;
    end if;
    if exists (select 1 from public.payment_transactions t where t.order_id = o.id and t.status = 'confirmed') then continue; end if;

    -- 2. Toutes les tentatives sont closes chez Orange et aucun paiement : annulation définitive.
    update public.orders set status = 'cancelled', payment_status = 'failed', payment_cancel_reason = 'unpaid_after_grace', updated_at = now() where id = o.id;
    update public.order_shops set status = 'cancelled', updated_at = now() where order_id = o.id and status <> 'cancelled';
    perform ezial_private.restock_order(o.id);
    perform ezial_private.audit('system', 'order_cancelled_unpaid', 'order', o.id, jsonb_build_object('order_number', o.order_number));
    if o.customer_id is not null then
      perform public.notify_user(o.customer_id, 'order_cancelled', 'Commande annulée',
        'Votre commande ' || coalesce(o.order_number, '') || ' a été annulée : le paiement n''a pas été reçu dans le délai.',
        '/compte/commande/' || coalesce(o.order_number, ''), o.id);
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$function$;
revoke execute on function ezial_private.orders_finalize_unpaid() from public, anon, authenticated;

-- ── Administration : consulter les tentatives et traiter les anomalies ──────
create or replace function public.admin_payment_attempts(p_statuses text[] default null, p_limit integer default 100)
returns table (id uuid, order_id uuid, order_number text, customer_name text, provider text, status text, amount integer, created_at timestamptz,
  expires_at timestamptz, last_checked_at timestamptz, check_count integer, verified_status text, provider_closed_at timestamptz,
  superseded_at timestamptz, failure_reason text, order_status text, order_payment_status text, payment_deadline timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = (select auth.uid())) then
    raise exception 'Accès réservé aux administrateurs.' using errcode = 'P0001';
  end if;
  return query
    select t.id, t.order_id, o.order_number, trim(coalesce(o.first_name, '') || ' ' || coalesce(o.last_name, '')), t.provider, t.status, t.amount, t.created_at,
           t.expires_at, t.last_checked_at, t.check_count, t.verified_status, t.provider_closed_at, t.superseded_at, t.failure_reason,
           o.status, o.payment_status, o.payment_deadline
      from public.payment_transactions t join public.orders o on o.id = t.order_id
     where p_statuses is null or t.status = any (p_statuses)
     order by t.created_at desc limit least(greatest(coalesce(p_limit, 100), 1), 500);
end; $$;

create or replace function public.admin_payment_anomalies(p_status text default null)
returns setof public.payment_anomalies language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = (select auth.uid())) then
    raise exception 'Accès réservé aux administrateurs.' using errcode = 'P0001';
  end if;
  return query select * from public.payment_anomalies a where p_status is null or a.status = p_status order by a.created_at desc limit 500;
end; $$;

-- Remboursement manuel : à marquer « refunded » seulement APRÈS l'avoir effectué chez Orange et vérifié le paiement.
create or replace function public.admin_update_payment_anomaly(p_id uuid, p_status text, p_note text default null)
returns public.payment_anomalies language plpgsql security definer set search_path = '' as $$
declare a public.payment_anomalies;
begin
  if not exists (select 1 from public.admins x where x.user_id = (select auth.uid())) then
    raise exception 'Accès réservé aux administrateurs.' using errcode = 'P0001';
  end if;
  if p_status not in ('open', 'in_review', 'refund_pending', 'refunded', 'resolved') then
    raise exception 'Statut invalide.' using errcode = 'P0001';
  end if;
  update public.payment_anomalies
     set status = p_status, note = coalesce(nullif(trim(p_note), ''), note), updated_at = now(),
         resolved_at = case when p_status in ('refunded', 'resolved') then now() else null end,
         resolved_by = case when p_status in ('refunded', 'resolved') then (select auth.uid()) else null end
   where id = p_id returning * into a;
  if a.id is null then raise exception 'Anomalie introuvable.' using errcode = 'P0001'; end if;
  perform ezial_private.audit('admin', 'payment_anomaly_' || p_status, 'payment_anomaly', a.id, jsonb_build_object('note', left(coalesce(p_note, ''), 300)));
  return a;
end; $$;

revoke execute on function public.admin_payment_attempts(text[], integer), public.admin_payment_anomalies(text),
  public.admin_update_payment_anomaly(uuid, text, text) from public, anon;
grant execute on function public.admin_payment_attempts(text[], integer), public.admin_payment_anomalies(text),
  public.admin_update_payment_anomaly(uuid, text, text) to authenticated;
revoke execute on function public.payments_reconcile_candidates(integer), public.payments_record_verification(uuid, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.payments_reconcile_candidates(integer), public.payments_record_verification(uuid, text, integer, text) to service_role;

-- ── Tâche planifiée (si pg_cron est présent) : annulation prudente, chaque minute ─
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'orders-finalize-unpaid';
    perform cron.schedule('orders-finalize-unpaid', '* * * * *', 'select ezial_private.orders_finalize_unpaid();');
  end if;
end $$;

commit;
