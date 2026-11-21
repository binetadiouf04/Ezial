-- ============================================================================
-- Wave Checkout — RETOUR ARRIÈRE de wave-1-commandes.sql
-- Rétablit exactement les fonctions de production d'avant Wave (Orange Money inchangé).
-- AVANT de l'exécuter :
--   1. éteindre l'interrupteur :  update public.payment_settings set wave_enabled = false;
--   2. retirer les testeurs Wave :  update public.payment_testers set providers = array_remove(providers, 'wave');
--      puis supprimer les comptes restés sans aucun moyen :  delete from public.payment_testers where cardinality(providers) = 0;
--   3. aucune commande Wave « à payer » ni tentative Wave ouverte ne doit rester (le script le vérifie et s'arrête sinon).
-- La colonne payment_settings.wave_enabled et la colonne payment_testers.providers sont CONSERVÉES (aucune donnée perdue) :
-- voir la fin du script pour les supprimer, ce qui est irréversible.
-- ============================================================================
begin;

do $$
begin
  if exists (select 1 from public.payment_settings where wave_enabled) then
    raise exception 'wave_enabled est encore à true : l''éteindre avant le retour arrière.';
  end if;
  if exists (select 1 from public.payment_testers where not ('orange_money' = any (providers))) then
    raise exception 'Des testeurs Wave sont encore inscrits : les retirer avant le retour arrière.';
  end if;
  if exists (select 1 from public.orders where payment_method = 'wave' and payment_required and paid_processed_at is null and status <> 'cancelled') then
    raise exception 'Des commandes Wave attendent encore un paiement : retour arrière refusé.';
  end if;
  if exists (select 1 from public.payment_transactions where provider = 'wave' and provider_closed_at is null and status in ('initiated', 'pending', 'superseded')) then
    raise exception 'Des tentatives Wave ne sont pas encore closes : retour arrière refusé.';
  end if;
end $$;

-- 1. Nouvelle signature de la vérification périodique supprimée (l'ancienne est restaurée plus bas)
drop function if exists public.payments_reconcile_candidates(integer, text);

-- 2. Fonctions de production restaurées
CREATE OR REPLACE FUNCTION ezial_private.is_payment_tester(p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p_user is not null and exists (select 1 from public.payment_testers t where t.user_id = p_user);
$function$;

CREATE OR REPLACE FUNCTION ezial_private.trg_orders_set_payment_required()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s public.payment_settings;
begin
  select * into s from public.payment_settings where id;
  if new.payment_method = 'orange_money'
     and (coalesce(s.orange_money_enabled, false) or ezial_private.is_payment_tester(new.customer_id)) then
    new.payment_required := true;
    new.payment_deadline := now() + make_interval(mins => s.payment_window_minutes);
    new.payment_grace_until := new.payment_deadline + make_interval(mins => s.payment_grace_minutes);
  end if;
  return new;
end; $function$;

CREATE OR REPLACE FUNCTION public.payments_create_transaction(p_order_id uuid, p_provider text, p_user_id uuid)
 RETURNS payment_transactions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o public.orders; t public.payment_transactions; s public.payment_settings; v_enabled boolean;
begin
  select * into s from public.payment_settings where id;
  if p_provider not in ('wave', 'orange_money') then raise exception 'Moyen de paiement inconnu.' using errcode = 'P0001'; end if;
  v_enabled := case when p_provider = 'orange_money'
                    then coalesce(s.orange_money_enabled, false) or ezial_private.is_payment_tester(p_user_id)
                    else coalesce(s.collections_enabled, false) end;
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

CREATE OR REPLACE FUNCTION public.payments_maintenance()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  update public.payment_transactions set status = 'expired', failure_reason = 'délai dépassé', updated_at = now()
   where status in ('initiated', 'pending') and provider is distinct from 'orange_money'
     and coalesce(expires_at, created_at + interval '2 hours') < now();
end;
$function$;

CREATE OR REPLACE FUNCTION public.payments_reconcile_candidates(p_limit integer DEFAULT 50)
 RETURNS TABLE(transaction_id uuid, order_id uuid, reference text, status text, expires_at timestamp with time zone, created_at timestamp with time zone, check_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select t.id, t.order_id, t.id::text, t.status, t.expires_at, t.created_at, t.check_count
    from public.payment_transactions t
   where t.provider = 'orange_money' and t.provider_closed_at is null and t.status in ('initiated', 'pending', 'superseded')
     and t.created_at > now() - interval '72 hours'
     and (t.last_checked_at is null or t.last_checked_at < now() - interval '45 seconds')
   order by t.last_checked_at nulls first, t.created_at
   limit greatest(1, least(coalesce(p_limit, 50), 200));
$function$;

CREATE OR REPLACE FUNCTION public.payments_record_verification(p_transaction_id uuid, p_provider_status text, p_amount integer DEFAULT NULL::integer, p_provider_transaction_id text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

CREATE OR REPLACE FUNCTION ezial_private.orders_finalize_unpaid()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

CREATE OR REPLACE FUNCTION public.payments_internal_secret(p_name text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select s.decrypted_secret from vault.decrypted_secrets s
  where s.name = p_name and p_name in ('payments_reconcile_secret', 'orange_money_callback_api_key');
$function$;


-- 3. Droits d'exécution d'origine de la fonction de vérification périodique (réservée au serveur)
revoke execute on function public.payments_reconcile_candidates(integer) from public, anon, authenticated;
grant execute on function public.payments_reconcile_candidates(integer) to service_role;

-- 4. Fonctions ajoutées, supprimées en dernier (plus aucune fonction restaurée ne s'en sert)
drop function if exists ezial_private.is_payment_tester(uuid, text);
drop function if exists ezial_private.payment_provider_label(text);
alter table public.payment_testers drop constraint if exists payment_testers_providers_check;

notify pgrst, 'reload schema';

commit;

-- ============================================================================
-- OPTIONNEL ET IRRÉVERSIBLE : supprimer aussi les colonnes ajoutées (perte de leurs données).
-- ============================================================================
-- begin;
-- alter table public.payment_settings drop column if exists wave_enabled;
-- alter table public.payment_testers drop column if exists providers;
-- commit;
