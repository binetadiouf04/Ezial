-- ============================================================================
-- Abonnement Ezial Plus : paiement par WAVE ou ORANGE MONEY (au choix) + retrait du plan de test « test_25 »
--
-- Ce que fait cette migration :
--   * le vendeur choisit Wave ou Orange Money pour payer son abonnement, comme pour une commande ; chaque moyen a son
--     interrupteur : Orange Money = orange_money_enabled, Wave = wave_enabled (colonne de la migration Wave) ou compte
--     testeur du moyen. Tant que Wave n'est pas activé, rien ne change pour Orange Money ;
--   * retire le plan de test (25 FCFA, 1 jour) : suppression de la tentative de test déjà exécutée et validée, contrainte
--     de périodicité réduite à trimestriel / annuel, fonction de test supprimée ;
--   * le rapprochement périodique accepte un moyen à la fois (Wave : référence = identifiant de la session de paiement) ;
--   * seller_subscription_attempt_state renvoie aussi le moyen de paiement de la tentative.
-- Prérequis : abonnement-om.sql. Sûre à relancer. Une seule transaction. Retour arrière : abonnement-wave-retour.sql.
-- ============================================================================
begin;

do $$
begin
  if to_regclass('public.subscription_payment_attempts') is null then
    raise exception 'abonnement-om.sql doit être exécuté avant cette migration : rien n''a été modifié.';
  end if;
  if exists (select 1 from public.subscription_payment_attempts where billing_period = 'test_25' and (amount <> 25 or provider <> 'orange_money')) then
    raise exception 'Une tentative « test_25 » n''est pas un paiement de test de 25 FCFA : migration arrêtée, rien n''a été modifié.';
  end if;
end $$;

-- 1. Retrait du plan de test : la tentative de test confirmée n'a créé aucune ligne dans subscription_payments.
delete from public.subscription_payment_attempts where billing_period = 'test_25' and amount = 25;
alter table public.subscription_payment_attempts drop constraint if exists subscription_payment_attempts_billing_period_check;
alter table public.subscription_payment_attempts add constraint subscription_payment_attempts_billing_period_check
  check (billing_period in ('quarterly', 'annual'));
drop function if exists public.subscription_test_plan_available();
create or replace function ezial_private.subscription_attempt_price(p_billing_period text)
returns integer language sql immutable set search_path = '' as
$fn$ select public.subscription_plan_price(p_billing_period) $fn$;
revoke all on function ezial_private.subscription_attempt_price(text) from public, anon, authenticated;

-- 2. Fonctions (Wave ou Orange Money ; plus de test_25)
create or replace function public.subscription_payments_create_attempt(p_shop_id uuid, p_billing_period text, p_provider text, p_user_id uuid)
returns public.subscription_payment_attempts
language plpgsql security definer set search_path = '' as $fn$
declare
  s public.payment_settings; v_enabled boolean; v_shop public.shops; v_amount integer; t public.subscription_payment_attempts;
begin
  select * into s from public.payment_settings where id;
  if p_provider is null or p_provider not in ('wave', 'orange_money') then raise exception 'Moyen de paiement inconnu.' using errcode = 'P0001'; end if;
  -- Interrupteur propre à chaque moyen : Orange Money = orange_money_enabled, Wave = wave_enabled (colonne ajoutée par la
  -- migration Wave ; absente, Wave reste fermé) ; ou compte testeur de ce moyen.
  if p_provider = 'orange_money' then
    v_enabled := coalesce(s.orange_money_enabled, false) or ezial_private.is_payment_tester(p_user_id);
  else
    v_enabled := coalesce((to_jsonb(s) ->> 'wave_enabled')::boolean, false);
    if not v_enabled and to_regprocedure('ezial_private.is_payment_tester(uuid,text)') is not null then
      execute 'select ezial_private.is_payment_tester($1, ''wave'')' into v_enabled using p_user_id;
    end if;
  end if;
  if not v_enabled then raise exception 'Le paiement en ligne est en cours d''activation.' using errcode = 'P0001'; end if;
  v_amount := ezial_private.subscription_attempt_price(p_billing_period);
  if v_amount is null then raise exception 'Périodicité d''abonnement invalide.' using errcode = 'P0001'; end if;

  select * into v_shop from public.shops where id = p_shop_id for update;     -- sérialise les initiations d'une même boutique
  if v_shop.id is null or v_shop.owner_id is distinct from p_user_id then raise exception 'Boutique introuvable.' using errcode = 'P0001'; end if;
  -- Boutique officielle (toujours Ezial Plus) : rien à payer.
  if coalesce(v_shop.is_official, false) then raise exception 'La boutique officielle Ezial est déjà toujours Ezial Plus.' using errcode = 'P0001'; end if;

  -- Tentative encore utilisable : réutilisée (jamais de second QR inutile).
  select * into t from public.subscription_payment_attempts
   where shop_id = v_shop.id and provider = p_provider and billing_period = p_billing_period and amount = v_amount
     and ((status = 'pending' and expires_at > now() + interval '60 seconds')
          or (status = 'initiated' and created_at > now() - interval '10 minutes'))
   order by created_at desc limit 1;
  if t.id is not null then return t; end if;

  -- L'ancien QR / l'ancienne page de paiement reste surveillé : un paiement tardif serait quand même pris en compte
  -- (Wave comme Orange Money : jamais annulé à l'aveugle).
  update public.subscription_payment_attempts set status = 'superseded', superseded_at = now(),
         failure_reason = 'remplacée par une nouvelle tentative', updated_at = now()
   where shop_id = v_shop.id and status in ('initiated', 'pending');

  -- clock_timestamp() : l'ordre « créée avant / confirmée après » (double paiement) reste exact même dans une seule transaction.
  insert into public.subscription_payment_attempts (shop_id, requested_by, provider, billing_period, amount, idempotency_key, created_at, updated_at)
  values (v_shop.id, p_user_id, p_provider, p_billing_period, v_amount, 'sub_' || replace(gen_random_uuid()::text, '-', ''), clock_timestamp(), clock_timestamp())
  returning * into t;
  perform ezial_private.audit('service', 'subscription_payment_initiated', 'subscription_payment_attempt', t.id,
    jsonb_build_object('shop_id', v_shop.id, 'provider', p_provider, 'billing_period', p_billing_period, 'amount', v_amount));
  return t;
end;
$fn$;

create or replace function ezial_private.subscription_confirm_attempt(p_attempt_id uuid, p_provider_reference text, p_confirmed_amount integer, p_manual_by uuid default null)
returns text language plpgsql security definer set search_path = '' as $fn$
declare
  a public.subscription_payment_attempts; v_shop public.shops; v_sub public.seller_subscriptions;
  v_shop_id uuid; v_is_fresh boolean; v_start timestamptz; v_end timestamptz; v_late boolean; v_formula text; v_ref text;
  v_other uuid; v_label text; v_provider_label text; v_n integer;
begin
  select shop_id into v_shop_id from public.subscription_payment_attempts where id = p_attempt_id;
  if v_shop_id is null then return 'not_found'; end if;
  -- Ordre des verrous : boutique d'abord, puis tentative (même ordre que la création) : jamais d'interblocage.
  select * into v_shop from public.shops where id = v_shop_id for update;
  select * into a from public.subscription_payment_attempts where id = p_attempt_id for update;
  if a.status = 'confirmed' then return 'already_confirmed'; end if;
  if a.status = 'duplicate' then return 'duplicate_payment'; end if;
  v_provider_label := case a.provider when 'wave' then 'Wave' else 'Orange Money' end;

  -- Montant : exactement le prix du plan, jamais moins ni plus (vérifié auprès d'Orange avant d'arriver ici).
  if p_manual_by is null and (p_confirmed_amount is distinct from a.amount or a.amount is distinct from ezial_private.subscription_attempt_price(a.billing_period)) then
    update public.subscription_payment_attempts set provider_closed_at = coalesce(provider_closed_at, now()), verified_status = 'confirmed',
           failure_reason = 'Montant confirmé différent du montant attendu', updated_at = now() where id = a.id;   -- plus de sondage : à traiter par l'administratrice
    perform ezial_private.emit_event('finance.anomaly', a.id, 'subscription_amount_mismatch', jsonb_build_object(
      'reason', 'Abonnement : montant confirmé différent du montant attendu.', 'expected', a.amount, 'confirmed', p_confirmed_amount));
    perform ezial_private.audit('service', 'subscription_payment_amount_mismatch', 'subscription_payment_attempt', a.id,
      jsonb_build_object('expected', a.amount, 'confirmed', p_confirmed_amount));
    insert into public.payment_anomalies (subscription_attempt_id, kind, details)
    values (a.id, 'amount_mismatch', jsonb_build_object('shop_id', a.shop_id, 'provider', a.provider, 'expected', a.amount, 'confirmed', p_confirmed_amount, 'kind', 'subscription'))
    on conflict do nothing;
    get diagnostics v_n = row_count;
    if v_n > 0 then   -- une seule alerte par anomalie, même si Orange renvoie la notification
      perform public.notify_admins('subscription_payment_anomaly',
        'Abonnement Ezial Plus : montant reçu différent du montant attendu (' || coalesce(v_shop.name, 'boutique') || ', attendu ' || a.amount || ' FCFA). Aucune activation : à vérifier.',
        '/pro/admin/abonnements', null, null, null, a.shop_id);
    end if;
    return 'amount_mismatch';
  end if;

  -- Double paiement : un autre paiement de la MÊME boutique a été confirmé alors que ce QR existait déjà
  -- (deux QR payés pour une même intention). Un renouvellement voulu plus tard n'est jamais un doublon.
  select o.id into v_other from public.subscription_payment_attempts o
   where o.shop_id = a.shop_id and o.id <> a.id and o.status = 'confirmed' and o.confirmed_at >= a.created_at limit 1;
  if v_other is not null then
    update public.subscription_payment_attempts set status = 'duplicate', failure_reason = 'paiement en double',
           provider_closed_at = coalesce(provider_closed_at, now()), verified_status = 'confirmed', updated_at = now() where id = a.id;
    perform ezial_private.emit_event('finance.anomaly', a.id, 'subscription_double_payment',
      jsonb_build_object('reason', 'Abonnement : deuxième paiement confirmé pour la même boutique, une seule activation : remboursement à prévoir.'));
    perform ezial_private.audit('service', 'subscription_double_payment', 'subscription_payment_attempt', a.id, jsonb_build_object('other_attempt', v_other, 'amount', a.amount));
    insert into public.payment_anomalies (subscription_attempt_id, kind, details)
    values (a.id, 'double_payment', jsonb_build_object('shop_id', a.shop_id, 'provider', a.provider, 'amount', a.amount, 'other_attempt', v_other, 'kind', 'subscription'))
    on conflict do nothing;
    get diagnostics v_n = row_count;
    if v_n > 0 then
    perform public.notify_admins('subscription_payment_anomaly',
      'Abonnement Ezial Plus : double paiement de ' || a.amount || ' FCFA (' || coalesce(v_shop.name, 'boutique') || '). Une seule activation : remboursement du second paiement à prévoir.',
      '/pro/admin/abonnements', null, null, null, a.shop_id);
    end if;
    return 'duplicate_payment';
  end if;

  -- Paiement reçu après la fin du QR (ou sur un QR remplacé / refusé) : l'argent est reçu, on active quand même.
  v_late := a.status in ('failed', 'cancelled', 'expired') or (a.expires_at is not null and a.expires_at < now());

  -- Même chemin que confirm_subscription_payment : prolongation depuis la fin en cours si l'accès est encore actif, sinon depuis maintenant.
  select * into v_sub from public.seller_subscriptions where shop_id = a.shop_id for update;
  v_is_fresh := not (v_sub.id is not null and v_sub.plan = 'pro' and v_sub.pro_until is not null and v_sub.pro_until > now());
  v_start := case when v_is_fresh then now() else v_sub.pro_until end;
  v_end := v_start + public.subscription_plan_interval(a.billing_period);
  v_formula := case a.billing_period when 'annual' then 'annuel (12 mois)' else 'trimestriel (3 mois)' end;
  v_ref := coalesce(nullif(btrim(coalesce(p_provider_reference, '')), ''), a.provider_transaction_id, a.id::text);

  insert into public.subscription_payments (shop_id, amount, payment_method, reference, status, requested_by, requested_at,
                                            reviewed_at, reviewed_by, period_start, period_end, billing_period, attempt_id, source)
  values (a.shop_id, a.amount, a.provider, left(v_ref, 120), 'confirmed', a.requested_by, a.created_at,
          now(), p_manual_by, v_start, v_end, a.billing_period, a.id, case when p_manual_by is null then 'online' else 'admin' end);

  if v_sub.id is null then
    insert into public.seller_subscriptions (shop_id, plan, pro_until, trial_used, pro_started_at, premium_paid_ever, plan_chosen, billing_period)
    values (a.shop_id, 'pro', v_end, true, v_start, true, true, a.billing_period);
  else
    update public.seller_subscriptions
       set plan = 'pro', pro_until = v_end, expiry_warned_at = null, updated_at = now(),
           pro_started_at = case when v_is_fresh then v_start else pro_started_at end,
           premium_paid_ever = true, plan_chosen = true, billing_period = a.billing_period
     where shop_id = a.shop_id;
  end if;

  update public.subscription_payment_attempts
     set status = 'confirmed', confirmed_at = clock_timestamp(), updated_at = now(), provider_closed_at = coalesce(provider_closed_at, now()),
         verified_status = coalesce(verified_status, 'confirmed'), provider_reference = coalesce(nullif(btrim(coalesce(p_provider_reference, '')), ''), provider_reference),
         failure_reason = null, period_end = v_end, manual = p_manual_by is not null
   where id = a.id;

  perform ezial_private.audit(case when p_manual_by is null then 'service' else 'admin' end, 'subscription_payment_confirmed', 'subscription_payment_attempt', a.id,
    jsonb_build_object('shop_id', a.shop_id, 'amount', a.amount, 'provider', a.provider, 'billing_period', a.billing_period,
                       'period_end', v_end, 'late', v_late, 'manual', p_manual_by is not null, 'renewal', not v_is_fresh));

  if v_shop.owner_id is not null then
    perform public.notify_user(v_shop.owner_id, 'subscription_confirmed', 'Abonnement Ezial Plus activé',
      'Votre paiement a été confirmé. Votre abonnement Ezial Plus ' || v_formula || ' est valide jusqu''au ' || to_char(v_end, 'DD/MM/YYYY') || '.',
      '/pro/seller/abonnement', null, null, null, a.shop_id);
  end if;
  v_label := 'Abonnement Ezial Plus ' || case when p_manual_by is null then 'payé en ligne' else 'confirmé manuellement' end || ' : '
    || coalesce(v_shop.name, 'boutique') || ' (' || a.amount || ' FCFA, ' || case a.billing_period when 'annual' then 'annuel' else 'trimestriel' end
    || ', via ' || v_provider_label || case when v_late then ', paiement reçu après la fin du QR' else '' end || ')';
  perform public.notify_admins('subscription_payment_confirmed', v_label, '/pro/admin/abonnements', null, null, null, a.shop_id);
  return case when v_late then 'confirmed_late' else 'confirmed' end;
end;
$fn$;

create or replace function public.subscription_payments_record_verification(p_attempt_id uuid, p_provider_status text, p_amount integer default null, p_provider_transaction_id text default null)
returns text language plpgsql security definer set search_path = '' as $fn$
declare t public.subscription_payment_attempts; v_valid_end timestamptz;
begin
  if p_provider_status not in ('confirmed', 'pending', 'failed', 'cancelled', 'expired', 'not_found', 'unknown') then raise exception 'Statut invalide.'; end if;
  select * into t from public.subscription_payment_attempts where id = p_attempt_id for update;
  if t.id is null then return 'not_found'; end if;
  update public.subscription_payment_attempts set last_checked_at = now(), check_count = check_count + 1, verified_status = p_provider_status,
         provider_transaction_id = coalesce(provider_transaction_id, p_provider_transaction_id), updated_at = now() where id = t.id;
  if p_provider_status = 'confirmed' then
    if p_amount is null then return 'amount_missing'; end if;
    return 'confirm:' || ezial_private.subscription_confirm_attempt(t.id, null, p_amount, null);
  elsif p_provider_status in ('failed', 'cancelled', 'expired') then
    return 'fail:' || public.subscription_payments_fail(t.id, p_provider_status, 'Statut ' || case t.provider when 'wave' then 'Wave' else 'Orange Money' end || ' : ' || p_provider_status);
  elsif p_provider_status = 'not_found' then
    v_valid_end := coalesce(t.expires_at, t.created_at + interval '1 hour');
    if now() > v_valid_end + interval '5 minutes' then
      return 'closed:' || public.subscription_payments_fail(t.id, 'expired', 'Aucune transaction ' || case t.provider when 'wave' then 'Wave' else 'Orange Money' end || ' après la fin de validité du paiement');
    end if;
    return 'waiting';
  end if;
  return 'waiting';
end;
$fn$;

-- 3. Rapprochement : un moyen à la fois (Wave : identifiant de la session de paiement ; Orange Money : identifiant de la tentative).
-- Sans le paramètre p_provider (fonction Edge déjà déployée), seules les tentatives Orange Money sont renvoyées.
drop function if exists public.subscription_payments_reconcile_candidates(integer);
create or replace function public.subscription_payments_reconcile_candidates(p_limit integer default 50, p_provider text default 'orange_money')
returns table (transaction_id uuid, order_id uuid, reference text, status text, expires_at timestamptz, created_at timestamptz, check_count integer, provider text)
language sql stable security definer set search_path = '' as $fn$
  select t.id, null::uuid,
         case when t.provider = 'wave' then t.provider_reference else t.id::text end,
         t.status, t.expires_at, t.created_at, t.check_count, t.provider
    from public.subscription_payment_attempts t
   where t.provider = p_provider and t.provider_closed_at is null and t.status in ('initiated', 'pending', 'superseded')
     and (t.provider <> 'wave' or t.provider_reference is not null)
     and t.created_at > now() - interval '72 hours'
     and (t.last_checked_at is null or t.last_checked_at < now() - interval '45 seconds')
   order by t.last_checked_at nulls first, t.created_at
   limit greatest(1, least(coalesce(p_limit, 50), 200));
$fn$;
revoke all on function public.subscription_payments_reconcile_candidates(integer, text) from public, anon, authenticated;
grant execute on function public.subscription_payments_reconcile_candidates(integer, text) to service_role;

-- 4. État de la dernière tentative : renvoie aussi le moyen de paiement.
drop function if exists public.seller_subscription_attempt_state(uuid);
create or replace function public.seller_subscription_attempt_state(p_shop_id uuid)
returns table (attempt_id uuid, status text, payment_state text, billing_period text, expires_at timestamptz, created_at timestamptz, provider text)
language plpgsql stable security definer set search_path = '' as $fn$
begin
  if not exists (select 1 from public.shops s where s.id = p_shop_id and s.owner_id = (select auth.uid())) then
    raise exception 'Boutique introuvable.' using errcode = 'P0001';
  end if;
  return query
    select t.id, t.status,
           case when t.status in ('confirmed', 'duplicate') then 'paid' when t.status in ('failed', 'cancelled') then 'failed'
                when t.status = 'expired' then 'expired' else 'pending' end,
           t.billing_period, t.expires_at, t.created_at, t.provider
      from public.subscription_payment_attempts t
     where t.shop_id = p_shop_id and t.created_at > now() - interval '3 days'
     order by t.created_at desc limit 1;
end;
$fn$;
revoke all on function public.seller_subscription_attempt_state(uuid) from public, anon;
grant execute on function public.seller_subscription_attempt_state(uuid) to authenticated;

commit;

-- Vérification (doit renvoyer 5 lignes « ok » à true) :
select 'plus de test_25' as controle, (select count(*) = 0 from public.subscription_payment_attempts where billing_period = 'test_25') as ok
union all select 'fonction de test supprimée', to_regprocedure('public.subscription_test_plan_available()') is null
union all select 'rapprochement par moyen', to_regprocedure('public.subscription_payments_reconcile_candidates(integer,text)') is not null
union all select 'état avec moyen', exists (select 1 from pg_proc p where p.proname = 'seller_subscription_attempt_state' and pg_get_function_result(p.oid) like '%provider%')
union all select 'confirmation sans test', position('test_25' in pg_get_functiondef('ezial_private.subscription_confirm_attempt(uuid,text,integer,uuid)'::regprocedure)) = 0;
