-- ============================================================================
-- Wave Checkout — migration 1 : COMMANDES WAVE « À PAYER » (même mécanique qu'Orange Money)
--
-- Ce que fait cette migration : les commandes Wave créées quand Wave est ACTIVÉ (ou pour un compte testeur Wave)
-- suivent exactement les règles déjà en production pour Orange Money :
--   * orders.payment_required = true, avec délai de paiement et délai de grâce ;
--   * aucune notification (vendeur, client, administrateur, WhatsApp, événements) avant la confirmation du paiement ;
--   * part vendeur créée une seule fois au paiement, avec les mêmes commissions qu'avant ;
--   * annulation prudente : seulement quand TOUTES les tentatives sont closes chez Wave, puis stock restitué une fois ;
--   * l'ancienne tentative remplacée reste « superseded » et surveillée (jamais annulée à l'aveugle) ;
--   * Wave n'expire JAMAIS sur la seule horloge locale : seule une vérification auprès de Wave clôt une tentative.
--
-- Ce qui ne change PAS : Orange Money (comportement strictement identique), commissions, soldes vendeurs,
-- notifications et restitution du stock (déjà pilotés par orders.payment_required), règles d'accès (RLS),
-- décaissements Wave, commandes existantes (les commandes Wave créées avant l'activation restent telles quelles :
-- payment_required = false, aucune tentative de paiement en ligne possible).
--
-- ORDRE D'EXÉCUTION
--   1. Exécuter ce script dans l'éditeur SQL de Supabase. Il peut passer AVANT le déploiement des fonctions Edge et
--      du site : tout reste inactif tant que payment_settings.wave_enabled est à false (valeur par défaut) et qu'aucun
--      compte n'est inscrit comme testeur Wave.
--   2. La fonction Edge « payments-reconcile » déjà déployée continue de fonctionner sans changement : elle appelle
--      payments_reconcile_candidates sans le nouveau paramètre p_provider, qui vaut 'orange_money' par défaut
--      (elle ne reçoit donc toujours que des tentatives Orange Money).
--   3. Déployer ensuite les fonctions Edge et le site Wave.
--   4. Tester en conditions réelles avec un compte testeur (interrupteur général éteint) :
--        insert into public.payment_testers (user_id, providers, note) values ('<uuid du compte>', array['wave'], 'test Wave')
--          on conflict (user_id) do update set providers = array['orange_money', 'wave'];   -- garde aussi Orange Money
--   5. Activer pour tous (seulement après validation) :  update public.payment_settings set wave_enabled = true;
--
-- Prérequis : migrations orange-money-1 à 6. Sûre à relancer (idempotente). Une seule transaction.
-- Retour arrière : wave-retour-arriere.sql
-- ============================================================================
begin;

-- Contrôle préalable : la migration s'arrête (sans rien modifier) si les migrations Orange Money manquent.
do $$
begin
  if to_regclass('public.payment_testers') is null or to_regprocedure('public.payments_internal_secret(text)') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'payment_settings' and column_name = 'orange_money_enabled') then
    raise exception 'Les migrations orange-money-1 à 6 doivent être exécutées avant celle-ci.';
  end if;
end $$;

-- ── 1. Interrupteur Wave (collections_enabled n'est pas modifié) ─────────────
alter table public.payment_settings
  add column if not exists wave_enabled boolean not null default false;

-- ── 2. Testeurs : par moyen de paiement (les testeurs existants restent Orange Money seulement) ─
alter table public.payment_testers
  add column if not exists providers text[] not null default array['orange_money'];
alter table public.payment_testers drop constraint if exists payment_testers_providers_check;
alter table public.payment_testers add constraint payment_testers_providers_check
  check (providers <@ array['orange_money', 'wave']::text[]);

create or replace function ezial_private.is_payment_tester(p_user uuid, p_provider text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user is not null and exists (select 1 from public.payment_testers t where t.user_id = p_user and p_provider = any (t.providers));
$$;
revoke execute on function ezial_private.is_payment_tester(uuid, text) from public, anon, authenticated;

-- Version à un argument conservée : toujours « testeur Orange Money ».
create or replace function ezial_private.is_payment_tester(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select ezial_private.is_payment_tester(p_user, 'orange_money');
$$;

-- ── Nom du moyen de paiement dans les messages (aide) ────────────────────────
create or replace function ezial_private.payment_provider_label(p_provider text) returns text
language sql immutable set search_path = '' as $$
  select case p_provider when 'wave' then 'Wave' when 'orange_money' then 'Orange Money' end;
$$;
revoke execute on function ezial_private.payment_provider_label(text) from public, anon, authenticated;

-- ── 3. Création de commande : « à payer » si le moyen est activé OU si le client est testeur de ce moyen ─
create or replace function ezial_private.trg_orders_set_payment_required() returns trigger
language plpgsql security definer set search_path = '' as $$
declare s public.payment_settings; v_on boolean := false;
begin
  select * into s from public.payment_settings where id;
  if new.payment_method = 'orange_money'
     and (coalesce(s.orange_money_enabled, false) or ezial_private.is_payment_tester(new.customer_id)) then
    v_on := true;
  elsif new.payment_method = 'wave'
     and (coalesce(s.wave_enabled, false) or ezial_private.is_payment_tester(new.customer_id, 'wave')) then
    v_on := true;
  end if;
  if v_on then
    new.payment_required := true;
    new.payment_deadline := now() + make_interval(mins => s.payment_window_minutes);
    new.payment_grace_until := new.payment_deadline + make_interval(mins => s.payment_grace_minutes);
  end if;
  return new;
end; $$;

-- ── 4. Lancement d'un paiement : interrupteur propre à chaque moyen, règles neutres ─
create or replace function public.payments_create_transaction(p_order_id uuid, p_provider text, p_user_id uuid)
returns public.payment_transactions language plpgsql security definer set search_path = '' as $function$
declare o public.orders; t public.payment_transactions; s public.payment_settings; v_enabled boolean;
begin
  select * into s from public.payment_settings where id;
  if p_provider not in ('wave', 'orange_money') then raise exception 'Moyen de paiement inconnu.' using errcode = 'P0001'; end if;
  v_enabled := case p_provider
                 when 'orange_money' then coalesce(s.orange_money_enabled, false) or ezial_private.is_payment_tester(p_user_id, 'orange_money')
                 else coalesce(s.wave_enabled, false) or ezial_private.is_payment_tester(p_user_id, 'wave') end;
  if not v_enabled then
    raise exception 'Le paiement en ligne est en cours d''activation.' using errcode = 'P0001';
  end if;
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null or o.customer_id is distinct from p_user_id then raise exception 'Commande introuvable.' using errcode = 'P0001'; end if;
  if o.status = 'cancelled' then raise exception 'Cette commande est annulée.' using errcode = 'P0001'; end if;
  if o.payment_status = 'paid' then raise exception 'Cette commande est déjà payée.' using errcode = 'P0001'; end if;
  if coalesce(o.total_amount, 0) <= 0 then raise exception 'Montant de commande invalide.' using errcode = 'P0001'; end if;
  -- Seules les commandes « à payer » (créées quand le moyen était activé) se paient en ligne ; les autres restent comme avant.
  if not o.payment_required then
    raise exception 'Cette commande ne peut pas être payée avec %.', ezial_private.payment_provider_label(p_provider) using errcode = 'P0001';
  end if;
  -- Une commande à payer ne se règle qu'avec le moyen choisi à la commande (pas de changement de fournisseur).
  if p_provider is distinct from o.payment_method then
    raise exception 'Cette commande doit être payée avec %.', coalesce(ezial_private.payment_provider_label(o.payment_method), 'le moyen de paiement choisi') using errcode = 'P0001';
  end if;
  if o.payment_deadline - now() < interval '60 seconds' then
    raise exception 'Le délai de paiement est dépassé.' using errcode = 'P0001';
  end if;

  select * into t from public.payment_transactions
   where order_id = o.id and status in ('initiated', 'pending') and provider = p_provider and amount = o.total_amount
     and (expires_at is null or expires_at > now());
  if t.id is not null then return t; end if;

  -- L'ancienne tentative peut encore être payée chez le fournisseur : elle est conservée et reste surveillée.
  update public.payment_transactions set status = 'superseded', superseded_at = now(), failure_reason = 'remplacée par une nouvelle tentative', updated_at = now()
   where order_id = o.id and status in ('initiated', 'pending');

  insert into public.payment_transactions (order_id, provider, amount, idempotency_key)
  values (o.id, p_provider, o.total_amount, 'pay_' || replace(gen_random_uuid()::text, '-', ''))
  returning * into t;
  update public.orders set payment_method = p_provider where id = o.id and payment_method is distinct from p_provider;
  perform ezial_private.audit('service', 'payment_initiated', 'payment_transaction', t.id, jsonb_build_object('order_id', o.id, 'provider', p_provider, 'amount', t.amount));
  return t;
end;
$function$;

-- ── 5. Maintenance : Wave (comme Orange Money) n'expire JAMAIS sur l'horloge locale ─
create or replace function public.payments_maintenance() returns void language plpgsql security definer set search_path = '' as $function$
begin
  update public.payment_transactions set status = 'expired', failure_reason = 'délai dépassé', updated_at = now()
   where status in ('initiated', 'pending') and provider not in ('orange_money', 'wave')
     and coalesce(expires_at, created_at + interval '2 hours') < now();
end;
$function$;

-- ── 6. Vérification périodique : un moyen de paiement à la fois ──────────────
-- Le type de retour change (colonne « provider » ajoutée) : l'ancienne signature est supprimée puis recréée.
-- Sans le paramètre p_provider (fonction Edge déjà déployée), seules les tentatives Orange Money sont renvoyées.
drop function if exists public.payments_reconcile_candidates(integer);
create or replace function public.payments_reconcile_candidates(p_limit integer default 50, p_provider text default 'orange_money')
returns table (transaction_id uuid, order_id uuid, reference text, status text, expires_at timestamptz, created_at timestamptz, check_count integer, provider text)
language sql stable security definer set search_path = '' as $$
  select t.id, t.order_id,
         case when t.provider = 'wave' then coalesce(t.provider_reference, t.id::text) else t.id::text end,   -- Wave : identifiant de la session de paiement
         t.status, t.expires_at, t.created_at, t.check_count, t.provider
    from public.payment_transactions t
   where t.provider = p_provider and t.provider_closed_at is null and t.status in ('initiated', 'pending', 'superseded')
     and t.created_at > now() - interval '72 hours'
     and (t.last_checked_at is null or t.last_checked_at < now() - interval '45 seconds')
   order by t.last_checked_at nulls first, t.created_at
   limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;
revoke execute on function public.payments_reconcile_candidates(integer, text) from public, anon, authenticated;
grant execute on function public.payments_reconcile_candidates(integer, text) to service_role;

-- p_provider_status : confirmed | pending | failed | cancelled | expired | not_found | unknown
create or replace function public.payments_record_verification(p_transaction_id uuid, p_provider_status text, p_amount integer default null, p_provider_transaction_id text default null)
returns text language plpgsql security definer set search_path = '' as $function$
declare t public.payment_transactions; v_valid_end timestamptz; v_label text;
begin
  if p_provider_status not in ('confirmed', 'pending', 'failed', 'cancelled', 'expired', 'not_found', 'unknown') then raise exception 'Statut invalide.'; end if;
  select * into t from public.payment_transactions where id = p_transaction_id for update;
  if t.id is null then return 'not_found'; end if;
  v_label := coalesce(ezial_private.payment_provider_label(t.provider), 'paiement en ligne');
  update public.payment_transactions set last_checked_at = now(), check_count = check_count + 1, verified_status = p_provider_status,
    provider_transaction_id = coalesce(provider_transaction_id, p_provider_transaction_id), updated_at = now() where id = t.id;

  if p_provider_status = 'confirmed' then
    if p_amount is null then return 'amount_missing'; end if;
    return 'confirm:' || public.payments_confirm(t.id, null, p_amount);
  elsif p_provider_status in ('failed', 'cancelled', 'expired') then
    return 'fail:' || public.payments_fail(t.id, p_provider_status, 'Statut ' || v_label || ' : ' || p_provider_status);
  elsif p_provider_status = 'not_found' then
    -- Aucune transaction chez le fournisseur : le paiement n'a pas eu lieu. On ne conclut qu'après la fin de validité + 5 minutes.
    v_valid_end := coalesce(t.expires_at, t.created_at + interval '1 hour');
    if now() > v_valid_end + interval '5 minutes' then
      return 'closed:' || public.payments_fail(t.id, 'expired',
        'Aucune transaction ' || v_label || ' après la fin de validité ' || case when t.provider = 'wave' then 'de la session de paiement' else 'du QR' end);
    end if;
    return 'waiting';
  end if;
  return 'waiting';   -- pending / unknown : rien ne change
end;
$function$;
revoke execute on function public.payments_record_verification(uuid, text, integer, text) from public, anon, authenticated;
grant execute on function public.payments_record_verification(uuid, text, integer, text) to service_role;

-- ── 7. Annulation prudente des commandes jamais payées : messages neutres, règles inchangées ─
create or replace function ezial_private.orders_finalize_unpaid() returns integer
language plpgsql security definer set search_path = '' as $function$
declare o public.orders; v_count integer := 0; v_label text;
begin
  for o in select * from public.orders
            where payment_required and paid_processed_at is null and payment_status = 'pending' and status <> 'cancelled'
              and payment_grace_until < now()
            order by payment_grace_until limit 100 for update skip locked loop
    v_label := coalesce(ezial_private.payment_provider_label(o.payment_method), 'paiement en ligne');
    -- 1. Une tentative pas encore close chez le fournisseur : on attend (jamais d'annulation sur statut incertain).
    if exists (select 1 from public.payment_transactions t
                where t.order_id = o.id and t.status in ('initiated', 'pending', 'superseded') and t.provider_closed_at is null) then
      if now() > o.payment_grace_until + interval '24 hours' then
        insert into public.payment_anomalies (order_id, kind, details)
        values (o.id, 'payment_uncertain', jsonb_build_object('order_number', o.order_number, 'reason', 'Statut ' || v_label || ' toujours incertain 24 h après le délai de grâce.'))
        on conflict do nothing;
        perform ezial_private.emit_event('finance.anomaly', o.id, 'payment_uncertain', jsonb_build_object('reason', 'Statut ' || v_label || ' incertain depuis plus de 24 h.'));
      end if;
      continue;
    end if;
    if exists (select 1 from public.payment_transactions t where t.order_id = o.id and t.status = 'confirmed') then continue; end if;

    -- 2. Toutes les tentatives sont closes chez le fournisseur et aucun paiement : annulation définitive.
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

-- ── 8. Coffre : la fonction Edge Wave lit elle-même son secret de webhook ─────
-- Même définition et mêmes droits qu'en production (serveur seulement) ; seul un nom de clé s'ajoute à la liste autorisée.
create or replace function public.payments_internal_secret(p_name text) returns text
language sql stable security definer set search_path = '' as $$
  select s.decrypted_secret from vault.decrypted_secrets s
  where s.name = p_name and p_name in ('payments_reconcile_secret', 'orange_money_callback_api_key', 'wave_webhook_secret');
$$;
revoke execute on function public.payments_internal_secret(text) from public, anon, authenticated;
grant execute on function public.payments_internal_secret(text) to service_role;

-- Demande à l'API de rafraîchir sa connaissance des fonctions (nouvelle signature de payments_reconcile_candidates).
notify pgrst, 'reload schema';

commit;
