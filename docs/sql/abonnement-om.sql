-- ============================================================================
-- Ezial — Abonnement Ezial Plus payé EN LIGNE avec Orange Money (QR « QR CODE – OM »), activé tout seul
--
-- QUOI
--   Avant : le vendeur « demandait » un abonnement, payait hors du site, l'administratrice confirmait à la main
--   (confirm_subscription_payment). Après : le vendeur paie le QR Orange Money depuis Ezial Pro ; à la confirmation
--   d'Orange (callback ou rapprochement, après vérification du statut réel et du montant auprès d'Orange), la base
--   active l'abonnement toute seule, une seule fois. Wave suivra avec la même structure (colonne provider déjà prête).
--
--   1. Table public.subscription_payment_attempts : une ligne par tentative de paiement d'abonnement (statuts,
--      idempotence, QR, vérification chez Orange), sur le MÊME modèle que payment_transactions. Table DÉDIÉE :
--      payment_transactions (order_id obligatoire) et toutes les fonctions payments_* des COMMANDES ne sont ni
--      modifiées ni utilisées. Aucun accès direct pour anon / authenticated (RLS activée, aucune politique).
--   2. subscription_payments : deux colonnes (attempt_id, source). Une ligne « confirmed » est créée à l'activation
--      (historique du vendeur, comme avant). Le moyen reste 'wave' | 'orange_money' (contrainte existante) : AUCUN
--      paiement en espèces n'existe ni ne peut exister pour un abonnement.
--   3. payment_anomalies : colonne subscription_attempt_id (double paiement, montant différent d'un abonnement).
--   4. Fonctions réservées au serveur (service_role uniquement, jamais anon / authenticated) :
--        subscription_payments_create_attempt   montant RECALCULÉ ici (subscription_plan_price), boutique de l'appelant,
--                                               interrupteur Orange Money ou compte testeur, réutilisation d'un QR encore valable ;
--        subscription_payments_set_pending / _fail / _record_verification / _reconcile_candidates / _confirm ;
--        ezial_private.subscription_confirm_attempt : active l'abonnement par le même chemin que
--        confirm_subscription_payment (plan, pro_until, période, premium_paid_ever, notifications vendeur et administratrice) ;
--        idempotente (webhook rejoué, rapprochement qui repasse : une seule activation), verrouillée par boutique
--        (deux paiements simultanés : une seule activation), renouvellement prolongé depuis la fin en cours si encore
--        active sinon depuis maintenant, paiement tardif activé quand même (l'argent est reçu), double paiement =
--        une seule activation + anomalie, montant différent = aucune activation + anomalie.
--      Lecture publique par uuid non devinable (page de retour sans connexion) : subscription_payment_return_status.
--      Vendeur : seller_subscription_attempt_state (état de SA dernière tentative).
--      Administration : admin_subscription_payments (liste, moyen et état), admin_confirm_subscription_attempt /
--      admin_reject_subscription_attempt (cas d'exception seulement : paiement reçu mais non rapproché).
--   4 bis. PLAN DE TEST « test_25 » (demande de la propriétaire) : 25 FCFA, réservé aux comptes listés dans payment_testers
--      (refusé à tout autre compte, par la base ET par l'Edge Function ; interrupteur Orange Money sans effet sur cette règle).
--      Même chemin d'activation, même idempotence, mêmes notifications que les vrais plans, pour prouver la chaîne complète. Effet :
--      Ezial Plus pendant 1 JOUR seulement (jamais raccourci si la boutique a déjà plus), puis expiration par le mécanisme normal.
--      Ne touche PAS à premium_paid_ever (une boutique qui n'a fait qu'un test n'est pas comptée « abonnée payante ») ni à
--      trial_used (l'essai gratuit reste disponible), et n'écrit PAS dans subscription_payments (le test ne fausse ni l'historique
--      ni les statistiques de revenus) : il reste visible dans la liste admin « Abonnements » (tentatives). Retrait après le lancement :
--      voir la ligne SQL en fin de fichier.
--      BOUTIQUE OFFICIELLE (is_official = true, jamais modifié) : le test_25 d'un testeur y est accepté (les plans 3 mois / annuel restent refusés :
--      « La boutique officielle Ezial est déjà toujours Ezial Plus. »). Seule la ligne seller_subscriptions est mise à jour (pro_until +1 jour).
--      Aucun effet de bord, relu en production : commission 0 % décidée par shops.is_official dans create_order (pas par l'abonnement) ; limite de
--      produits ignorée pour une boutique officielle (enforce_product_limit) ; active_premium_shop_ids / interface = « Ezial Plus » par is_official.
--      Après 1 jour la tâche d'expiration remet la ligne à « free » SANS notification à la boutique officielle (ajout ci-dessous) ; l'interface
--      ignore cette ligne pour une boutique officielle.
--   5. Fonctions de production modifiées (texte relu en production le 25 nov. 2026, empreintes md5 contrôlées : si une
--      fonction a changé depuis, la migration s'arrête SANS RIEN MODIFIER) :
--        - notify_admin_new_subscription_payment : n'alerte « Nouvelle demande » que pour une ligne « pending_review »
--          (l'activation en ligne crée directement une ligne « confirmed » et envoie sa propre alerte) ;
--        - process_subscription_expirations : même logique, mais le rappel « 7 jours avant la fin » mène au PAIEMENT
--          (bouton « Renouveler ») et précise qu'aucun prélèvement automatique n'a lieu ;
--        - admin_mark_refunded + contrainte order_shop_cancellations_refund_method_check : « Espèces » retiré des moyens de
--          remboursement (aucune ligne ne l'utilise : vérifié avant de modifier ; sinon la migration s'arrête).
--   6. Politique subscription_payments_insert_own SUPPRIMÉE : le vendeur ne peut plus « déclarer » un paiement fait hors
--      du site. Les lignes existantes (1 confirmée en production) sont conservées telles quelles.
--
--   Rien d'autre : paiement des COMMANDES (payment-initiate, payments_create_transaction / _confirm / _record_verification,
--   create_order), commissions, versements et livraison ne sont pas modifiés.
--
-- PRÉREQUIS : migrations Orange Money 1 à 6, vendeur-annulation (order_shop_cancellations), retour-paiement.
-- INTERRUPTEUR : le paiement d'abonnement suit payment_settings.orange_money_enabled OU payment_testers (comme les commandes).
--   Tant qu'il est éteint (et hors testeurs), personne ne peut payer : comportement actuel (« paiement en cours d'activation »).
-- RELANÇABLE : oui. RETOUR ARRIÈRE : docs/sql/abonnement-om-retour.sql
-- ============================================================================
begin;

-- 0. Contrôles : objets attendus, fonctions de production inchangées. Rien n'est modifié si un contrôle échoue.
do $$
declare
  r record;
  v_def text;
begin
  if to_regclass('public.subscription_payments') is null or to_regclass('public.seller_subscriptions') is null
     or to_regclass('public.payment_events') is null or to_regclass('public.payment_anomalies') is null
     or to_regclass('public.payment_testers') is null or to_regclass('public.order_shop_cancellations') is null
     or to_regclass('public.shops') is null then
    raise exception 'Tables attendues absentes (migrations Orange Money 1 à 6 et vendeur-annulation) : rien n''a été modifié.';
  end if;
  if to_regprocedure('public.payments_record_verification(uuid,text,integer,text)') is null
     or to_regprocedure('ezial_private.is_payment_tester(uuid)') is null
     or to_regprocedure('ezial_private.audit(text,text,text,uuid,jsonb)') is null
     or to_regprocedure('ezial_private.emit_event(text,uuid,text,jsonb)') is null
     or to_regprocedure('public.notify_user(uuid,text,text,text,text,uuid,uuid,uuid,uuid)') is null
     or to_regprocedure('public.notify_admins(text,text,text,uuid,uuid,uuid,uuid)') is null
     or to_regprocedure('public.subscription_plan_price(text)') is null
     or to_regprocedure('public.subscription_plan_interval(text)') is null then
    raise exception 'Fonctions attendues absentes : rien n''a été modifié.';
  end if;
  if exists (select 1 from public.order_shop_cancellations where refund_method = 'especes') then
    raise exception 'Un remboursement « espèces » existe déjà : migration arrêtée, rien n''a été modifié.';
  end if;
  for r in
    select * from (values
      ('public.notify_admin_new_subscription_payment()',  '725faad4748f92a6adf6073f287e5945'),
      ('public.process_subscription_expirations()',       '917c069cc4e1c31fcedbe40425755928'),
      ('public.admin_mark_refunded(uuid,text,text,text)', 'd40b118f734b8977633181f5b8cd5dcb')
    ) t(sig, h)
  loop
    if to_regprocedure(r.sig) is null then raise exception 'Fonction % absente : rien n''a été modifié.', r.sig; end if;
    v_def := pg_get_functiondef(to_regprocedure(r.sig));
    -- déjà migrée (relance) : contient notre repère ; sinon doit être EXACTEMENT la définition de production
    if position('abonnement-om' in v_def) = 0 and md5(replace(v_def, chr(13), '')) <> r.h then
      raise exception 'La fonction % a changé depuis la lecture de production du 25 nov. 2026 : migration arrêtée, rien n''a été modifié.', r.sig;
    end if;
  end loop;
end $$;

-- 1. Copie des définitions d'origine (retour arrière). Seule la PREMIÈRE exécution enregistre.
create table if not exists ezial_private.abonnement_om_saved_functions (
  sig text primary key, def text not null, saved_at timestamptz not null default now());
revoke all on ezial_private.abonnement_om_saved_functions from public, anon, authenticated;
insert into ezial_private.abonnement_om_saved_functions (sig, def)
select v.sig, pg_get_functiondef(v.sig::regprocedure)
  from (values ('public.notify_admin_new_subscription_payment()'), ('public.process_subscription_expirations()'),
               ('public.admin_mark_refunded(uuid,text,text,text)')) v(sig)
 where position('abonnement-om' in pg_get_functiondef(v.sig::regprocedure)) = 0
on conflict (sig) do nothing;

-- 2. Tentatives de paiement d'abonnement (même modèle que payment_transactions, sans order_id).
create table if not exists public.subscription_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  provider text not null check (provider in ('wave', 'orange_money')),
  billing_period text not null check (billing_period in ('quarterly', 'annual', 'test_25')),   -- test_25 : plan de test, comptes testeurs seulement
  status text not null default 'initiated'
    check (status in ('initiated', 'pending', 'confirmed', 'failed', 'cancelled', 'expired', 'superseded', 'duplicate')),
  amount integer not null check (amount > 0),
  currency text not null default 'XOF' check (currency = 'XOF'),
  idempotency_key text not null unique,
  provider_reference text,
  checkout_url text,
  checkout_data jsonb,                      -- QR, liens d'ouverture de l'appli (aucun secret)
  failure_reason text,
  expires_at timestamptz,
  provider_transaction_id text,             -- identifiant de la transaction chez Orange (connu après paiement)
  verified_status text,
  last_checked_at timestamptz,
  check_count integer not null default 0,
  provider_closed_at timestamptz,           -- Orange a confirmé que cette tentative est terminée
  superseded_at timestamptz,
  confirmed_at timestamptz,
  admin_note text,                          -- cas d'exception : note de l'administratrice
  period_end timestamptz,                   -- fin d'abonnement accordée par ce paiement
  manual boolean not null default false,    -- confirmé à la main par l'administratrice (cas d'exception)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subscription_payment_attempts_shop_idx on public.subscription_payment_attempts (shop_id, created_at desc);
create unique index if not exists subscription_payment_attempts_provider_txid_key
  on public.subscription_payment_attempts (provider, provider_transaction_id) where provider_transaction_id is not null;
create index if not exists subscription_payment_attempts_to_verify_idx
  on public.subscription_payment_attempts (last_checked_at nulls first)
  where provider_closed_at is null and status in ('initiated', 'pending', 'superseded');

alter table public.subscription_payment_attempts enable row level security;
revoke all on public.subscription_payment_attempts from anon, authenticated;   -- aucun accès direct : fonctions serveur uniquement
grant all on public.subscription_payment_attempts to service_role;

-- 3. Historique des abonnements : lien vers la tentative et origine de la confirmation.
alter table public.subscription_payments
  add column if not exists attempt_id uuid references public.subscription_payment_attempts(id) on delete set null,
  add column if not exists source text not null default 'legacy';
alter table public.subscription_payments drop constraint if exists subscription_payments_source_check;
alter table public.subscription_payments add constraint subscription_payments_source_check
  check (source in ('online', 'admin', 'legacy'));     -- online = confirmé par Orange ; admin = cas d'exception ; legacy = avant ce changement
create unique index if not exists subscription_payments_attempt_key on public.subscription_payments (attempt_id) where attempt_id is not null;

-- 4. Anomalies : une anomalie d'abonnement n'est enregistrée qu'une fois par tentative.
alter table public.payment_anomalies
  add column if not exists subscription_attempt_id uuid references public.subscription_payment_attempts(id) on delete set null;
create unique index if not exists payment_anomalies_once_per_sub_attempt
  on public.payment_anomalies (subscription_attempt_id, kind) where subscription_attempt_id is not null;

-- 5. Plus de « demande » déclarée par le vendeur (paiement hors du site).
drop policy if exists subscription_payments_insert_own on public.subscription_payments;

-- ---------------------------------------------------------------------------
-- 6. Fonctions serveur
-- ---------------------------------------------------------------------------

-- 6.0 Prix serveur : prix du plan (subscription_plan_price, inchangée) ; « test_25 » = 25 FCFA (comptes testeurs seulement).
create or replace function ezial_private.subscription_attempt_price(p_billing_period text)
returns integer language sql immutable set search_path = '' as
$fn$ select case when p_billing_period = 'test_25' then 25 else public.subscription_plan_price(p_billing_period) end $fn$;
revoke all on function ezial_private.subscription_attempt_price(text) from public, anon, authenticated;

-- Le vendeur connecté est-il un compte testeur ? (affiche l'option « Test 25 FCFA » ; la base refuse de toute façon les autres)
create or replace function public.subscription_test_plan_available()
returns boolean language sql stable security definer set search_path = '' as
$fn$ select ezial_private.is_payment_tester((select auth.uid())) $fn$;
revoke all on function public.subscription_test_plan_available() from public, anon;
grant execute on function public.subscription_test_plan_available() to authenticated;

-- 6.1 Création (ou réutilisation) d'une tentative. Le montant n'est JAMAIS lu de la requête.
create or replace function public.subscription_payments_create_attempt(p_shop_id uuid, p_billing_period text, p_provider text, p_user_id uuid)
returns public.subscription_payment_attempts
language plpgsql security definer set search_path = '' as $fn$
declare
  s public.payment_settings; v_enabled boolean; v_shop public.shops; v_amount integer; t public.subscription_payment_attempts;
begin
  select * into s from public.payment_settings where id;
  if p_provider is null or p_provider not in ('wave', 'orange_money') then raise exception 'Moyen de paiement inconnu.' using errcode = 'P0001'; end if;
  v_enabled := case when p_provider = 'orange_money'
                    then coalesce(s.orange_money_enabled, false) or ezial_private.is_payment_tester(p_user_id)
                    else coalesce(s.collections_enabled, false) end;
  if not v_enabled then raise exception 'Le paiement en ligne est en cours d''activation.' using errcode = 'P0001'; end if;
  v_amount := ezial_private.subscription_attempt_price(p_billing_period);
  if v_amount is null then raise exception 'Périodicité d''abonnement invalide.' using errcode = 'P0001'; end if;
  if p_billing_period = 'test_25' and not ezial_private.is_payment_tester(p_user_id) then
    raise exception 'Ce paiement de test est réservé aux comptes testeurs.' using errcode = 'P0001';
  end if;

  select * into v_shop from public.shops where id = p_shop_id for update;     -- sérialise les initiations d'une même boutique
  if v_shop.id is null or v_shop.owner_id is distinct from p_user_id then raise exception 'Boutique introuvable.' using errcode = 'P0001'; end if;
  -- Boutique officielle (toujours Ezial Plus) : rien à payer, SAUF le plan de test « test_25 » d'un compte testeur (déjà vérifié plus haut).
  if coalesce(v_shop.is_official, false) and p_billing_period <> 'test_25' then raise exception 'La boutique officielle Ezial est déjà toujours Ezial Plus.' using errcode = 'P0001'; end if;

  -- Tentative encore utilisable : réutilisée (jamais de second QR inutile).
  select * into t from public.subscription_payment_attempts
   where shop_id = v_shop.id and provider = p_provider and billing_period = p_billing_period and amount = v_amount
     and ((status = 'pending' and expires_at > now() + interval '60 seconds')
          or (status = 'initiated' and created_at > now() - interval '10 minutes'))
   order by created_at desc limit 1;
  if t.id is not null then return t; end if;

  if p_provider = 'orange_money' then
    -- L'ancien QR reste surveillé : un paiement tardif sur ce QR serait quand même pris en compte.
    update public.subscription_payment_attempts set status = 'superseded', superseded_at = now(),
           failure_reason = 'remplacée par une nouvelle tentative', updated_at = now()
     where shop_id = v_shop.id and status in ('initiated', 'pending');
  else
    update public.subscription_payment_attempts set status = 'cancelled', failure_reason = 'remplacée par une nouvelle tentative', updated_at = now()
     where shop_id = v_shop.id and status in ('initiated', 'pending');
  end if;

  -- clock_timestamp() : l'ordre « créée avant / confirmée après » (double paiement) reste exact même dans une seule transaction.
  insert into public.subscription_payment_attempts (shop_id, requested_by, provider, billing_period, amount, idempotency_key, created_at, updated_at)
  values (v_shop.id, p_user_id, p_provider, p_billing_period, v_amount, 'sub_' || replace(gen_random_uuid()::text, '-', ''), clock_timestamp(), clock_timestamp())
  returning * into t;
  perform ezial_private.audit('service', 'subscription_payment_initiated', 'subscription_payment_attempt', t.id,
    jsonb_build_object('shop_id', v_shop.id, 'provider', p_provider, 'billing_period', p_billing_period, 'amount', v_amount));
  return t;
end;
$fn$;

create or replace function public.subscription_payments_set_pending(p_attempt_id uuid, p_provider_reference text, p_checkout_url text, p_expires_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $fn$
begin
  update public.subscription_payment_attempts
     set status = 'pending', provider_reference = coalesce(p_provider_reference, provider_reference),
         checkout_url = p_checkout_url, expires_at = p_expires_at, updated_at = now()
   where id = p_attempt_id and status in ('initiated', 'pending');
end;
$fn$;

create or replace function public.subscription_payments_fail(p_attempt_id uuid, p_status text, p_reason text)
returns text language plpgsql security definer set search_path = '' as $fn$
declare t public.subscription_payment_attempts;
begin
  if p_status not in ('failed', 'cancelled', 'expired') then raise exception 'Statut invalide.'; end if;
  select * into t from public.subscription_payment_attempts where id = p_attempt_id for update;
  if t.id is null then return 'not_found'; end if;
  if t.status not in ('initiated', 'pending', 'superseded') then return t.status; end if;
  update public.subscription_payment_attempts set status = p_status, failure_reason = left(p_reason, 300),
         provider_closed_at = coalesce(provider_closed_at, now()), updated_at = now() where id = t.id;
  perform ezial_private.audit('service', 'subscription_payment_' || p_status, 'subscription_payment_attempt', t.id, jsonb_build_object('reason', left(p_reason, 300)));
  return p_status;
end;
$fn$;

-- 6.2 Activation (cœur). Appelée par la confirmation Orange (service) ou, pour un cas d'exception, par l'administratrice.
create or replace function ezial_private.subscription_confirm_attempt(p_attempt_id uuid, p_provider_reference text, p_confirmed_amount integer, p_manual_by uuid default null)
returns text language plpgsql security definer set search_path = '' as $fn$
declare
  a public.subscription_payment_attempts; v_shop public.shops; v_sub public.seller_subscriptions;
  v_shop_id uuid; v_is_fresh boolean; v_start timestamptz; v_end timestamptz; v_late boolean; v_formula text; v_ref text;
  v_other uuid; v_label text; v_provider_label text; v_n integer; v_test boolean;
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
  v_test := a.billing_period = 'test_25';
  select * into v_sub from public.seller_subscriptions where shop_id = a.shop_id for update;
  v_is_fresh := not (v_sub.id is not null and v_sub.plan = 'pro' and v_sub.pro_until is not null and v_sub.pro_until > now());
  if v_test then
    -- Plan de test : 1 jour à partir de maintenant, jamais raccourci si la boutique a déjà plus ; aucune ligne d'historique,
    -- premium_paid_ever et trial_used inchangés ; pas de rappel « 7 jours » pour un accès d'un jour.
    v_start := now();
    v_end := greatest(now() + interval '1 day', coalesce(v_sub.pro_until, now()));
    v_formula := 'de test (25 FCFA, 1 jour)';
  else
    v_start := case when v_is_fresh then now() else v_sub.pro_until end;
    v_end := v_start + public.subscription_plan_interval(a.billing_period);
    v_formula := case a.billing_period when 'annual' then 'annuel (12 mois)' else 'trimestriel (3 mois)' end;
  end if;
  v_ref := coalesce(nullif(btrim(coalesce(p_provider_reference, '')), ''), a.provider_transaction_id, a.id::text);

  if not v_test then
    insert into public.subscription_payments (shop_id, amount, payment_method, reference, status, requested_by, requested_at,
                                              reviewed_at, reviewed_by, period_start, period_end, billing_period, attempt_id, source)
    values (a.shop_id, a.amount, a.provider, left(v_ref, 120), 'confirmed', a.requested_by, a.created_at,
            now(), p_manual_by, v_start, v_end, a.billing_period, a.id, case when p_manual_by is null then 'online' else 'admin' end);
  end if;

  if v_sub.id is null then
    if v_test then
      insert into public.seller_subscriptions (shop_id, plan, pro_until, trial_used, pro_started_at, premium_paid_ever, plan_chosen, expiry_warned_at)
      values (a.shop_id, 'pro', v_end, false, v_start, false, true, now());
    else
      insert into public.seller_subscriptions (shop_id, plan, pro_until, trial_used, pro_started_at, premium_paid_ever, plan_chosen, billing_period)
      values (a.shop_id, 'pro', v_end, true, v_start, true, true, a.billing_period);
    end if;
  elsif v_test then
    update public.seller_subscriptions
       set plan = 'pro', pro_until = v_end, expiry_warned_at = now(), updated_at = now(), plan_chosen = true,
           pro_started_at = case when v_is_fresh then v_start else pro_started_at end
     where shop_id = a.shop_id;
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
    || coalesce(v_shop.name, 'boutique') || ' (' || a.amount || ' FCFA, ' || case a.billing_period when 'annual' then 'annuel' when 'test_25' then 'TEST, 1 jour' else 'trimestriel' end
    || ', via ' || v_provider_label || case when v_late then ', paiement reçu après la fin du QR' else '' end || ')';
  perform public.notify_admins('subscription_payment_confirmed', v_label, '/pro/admin/abonnements', null, null, null, a.shop_id);
  return case when v_late then 'confirmed_late' else 'confirmed' end;
end;
$fn$;

create or replace function public.subscription_payments_confirm(p_attempt_id uuid, p_provider_reference text, p_confirmed_amount integer)
returns text language sql security definer set search_path = '' as
$fn$ select ezial_private.subscription_confirm_attempt(p_attempt_id, p_provider_reference, p_confirmed_amount, null) $fn$;

-- 6.3 Statut constaté chez Orange (webhook ou rapprochement) : mêmes règles que payments_record_verification.
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
    return 'fail:' || public.subscription_payments_fail(t.id, p_provider_status, 'Statut Orange Money : ' || p_provider_status);
  elsif p_provider_status = 'not_found' then
    v_valid_end := coalesce(t.expires_at, t.created_at + interval '1 hour');
    if now() > v_valid_end + interval '5 minutes' then
      return 'closed:' || public.subscription_payments_fail(t.id, 'expired', 'Aucune transaction Orange Money après la fin de validité du QR');
    end if;
    return 'waiting';
  end if;
  return 'waiting';
end;
$fn$;

-- 6.4 Rapprochement : mêmes colonnes que payments_reconcile_candidates (order_id vide).
create or replace function public.subscription_payments_reconcile_candidates(p_limit integer default 50)
returns table (transaction_id uuid, order_id uuid, reference text, status text, expires_at timestamptz, created_at timestamptz, check_count integer)
language sql stable security definer set search_path = '' as $fn$
  select t.id, null::uuid, t.id::text, t.status, t.expires_at, t.created_at, t.check_count
    from public.subscription_payment_attempts t
   where t.provider = 'orange_money' and t.provider_closed_at is null and t.status in ('initiated', 'pending', 'superseded')
     and t.created_at > now() - interval '72 hours'
     and (t.last_checked_at is null or t.last_checked_at < now() - interval '45 seconds')
   order by t.last_checked_at nulls first, t.created_at
   limit greatest(1, least(coalesce(p_limit, 50), 200));
$fn$;

-- 6.5 Page de retour SANS connexion : état à partir de l'uuid (non devinable) de la tentative. Aucun montant, nom ni numéro.
create or replace function public.subscription_payment_return_status(p_ref uuid)
returns table (payment_state text, billing_period text, period_end timestamptz)
language sql stable security definer set search_path = '' as $fn$
  select case when t.status in ('confirmed', 'duplicate') then 'paid'
              when t.status in ('failed', 'cancelled') then 'failed'
              when t.status = 'expired' then 'expired'
              else 'pending' end,
         t.billing_period,
         case when t.status = 'confirmed' then t.period_end end
    from public.subscription_payment_attempts t
   where t.id = p_ref
   limit 1;
$fn$;

-- 6.6 État de la dernière tentative de MA boutique (3 derniers jours) : le vendeur retrouve son paiement en cours.
create or replace function public.seller_subscription_attempt_state(p_shop_id uuid)
returns table (attempt_id uuid, status text, payment_state text, billing_period text, expires_at timestamptz, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $fn$
begin
  if not exists (select 1 from public.shops s where s.id = p_shop_id and s.owner_id = (select auth.uid())) then
    raise exception 'Boutique introuvable.' using errcode = 'P0001';
  end if;
  return query
    select t.id, t.status,
           case when t.status in ('confirmed', 'duplicate') then 'paid' when t.status in ('failed', 'cancelled') then 'failed'
                when t.status = 'expired' then 'expired' else 'pending' end,
           t.billing_period, t.expires_at, t.created_at
      from public.subscription_payment_attempts t
     where t.shop_id = p_shop_id and t.created_at > now() - interval '3 days'
     order by t.created_at desc limit 1;
end;
$fn$;

-- 6.7 Administration : liste des paiements d'abonnement (moyen, état) et cas d'exception.
create or replace function public.admin_subscription_payments(p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path = '' as $fn$
declare v_rows jsonb;
begin
  if not (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin' and not is_suspended)
          or exists (select 1 from public.admins where user_id = (select auth.uid()))) then
    raise exception 'Accès réservé aux administrateurs.' using errcode = 'P0001';
  end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb) into v_rows from (
    select * from (
      select t.id, 'online'::text as kind, t.shop_id, s.name as shop_name, t.provider, t.billing_period, t.amount, t.status,
             case when t.status = 'confirmed' then 'confirmed'
                  when t.status = 'duplicate' then 'duplicate'
                  when exists (select 1 from public.payment_anomalies a where a.subscription_attempt_id = t.id and a.status = 'open') then 'review'
                  when t.status in ('failed', 'cancelled') then 'failed'
                  when t.status = 'expired' then 'expired'
                  when t.status = 'superseded' then 'replaced'
                  when t.expires_at is not null and t.expires_at < now() then 'expired'
                  else 'pending' end as state,
             t.created_at, t.confirmed_at, t.period_end,
             coalesce(p.reference, t.provider_transaction_id, t.provider_reference) as reference,
             t.failure_reason, t.manual,
             (t.status not in ('confirmed', 'duplicate')) as can_confirm,
             t.admin_note
        from public.subscription_payment_attempts t
        join public.shops s on s.id = t.shop_id
        left join public.subscription_payments p on p.attempt_id = t.id
      union all
      select p.id, 'legacy', p.shop_id, s.name, p.payment_method, p.billing_period, p.amount, p.status,
             case p.status when 'confirmed' then 'confirmed' when 'rejected' then 'failed' else 'review' end,
             p.requested_at, p.reviewed_at, p.period_end, p.reference, null::text, true,
             false, null::text
        from public.subscription_payments p join public.shops s on s.id = p.shop_id
       where p.attempt_id is null
    ) u order by u.created_at desc limit greatest(1, least(coalesce(p_limit, 100), 500))
  ) x;
  return v_rows;
end;
$fn$;

-- Cas d'exception : paiement reçu chez Orange / Wave mais non rapproché. Jamais d'espèces ; référence de la transaction obligatoire.
create or replace function public.admin_confirm_subscription_attempt(p_attempt_id uuid, p_reference text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare a public.subscription_payment_attempts; r text; v_ref text := nullif(btrim(coalesce(p_reference, '')), '');
begin
  if not (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin' and not is_suspended)
          or exists (select 1 from public.admins where user_id = (select auth.uid()))) then
    raise exception 'Accès réservé aux administrateurs.' using errcode = 'P0001';
  end if;
  if v_ref is null or char_length(v_ref) < 4 then
    raise exception 'Indiquez la référence de la transaction reçue dans Orange Money ou Wave.' using errcode = 'P0001';
  end if;
  select * into a from public.subscription_payment_attempts where id = p_attempt_id;
  if a.id is null then raise exception 'Paiement d''abonnement introuvable.' using errcode = 'P0001'; end if;
  update public.subscription_payment_attempts set admin_note = nullif(left(btrim(coalesce(p_note, '')), 300), '') where id = a.id and status not in ('confirmed', 'duplicate');
  r := ezial_private.subscription_confirm_attempt(a.id, v_ref, a.amount, (select auth.uid()));
  if r = 'duplicate_payment' then raise exception 'Cette boutique a déjà été activée par un autre paiement : aucun second abonnement n''est ajouté.' using errcode = 'P0001'; end if;
  return jsonb_build_object('success', r in ('confirmed', 'confirmed_late'), 'already', r = 'already_confirmed', 'result', r);
end;
$fn$;

create or replace function public.admin_reject_subscription_attempt(p_attempt_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare a public.subscription_payment_attempts; v_owner uuid;
begin
  if not (exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin' and not is_suspended)
          or exists (select 1 from public.admins where user_id = (select auth.uid()))) then
    raise exception 'Accès réservé aux administrateurs.' using errcode = 'P0001';
  end if;
  select * into a from public.subscription_payment_attempts where id = p_attempt_id for update;
  if a.id is null then raise exception 'Paiement d''abonnement introuvable.' using errcode = 'P0001'; end if;
  if a.status in ('confirmed', 'duplicate', 'cancelled') then
    return jsonb_build_object('alreadyProcessed', true, 'status', a.status);
  end if;
  update public.subscription_payment_attempts
     set status = 'cancelled', provider_closed_at = coalesce(provider_closed_at, now()), updated_at = now(),
         failure_reason = 'Refusé par l''administration' || coalesce(' : ' || nullif(left(btrim(coalesce(p_reason, '')), 200), ''), '')
   where id = a.id;
  perform ezial_private.audit('admin', 'subscription_payment_rejected', 'subscription_payment_attempt', a.id, jsonb_build_object('reason', left(coalesce(p_reason, ''), 200)));
  select owner_id into v_owner from public.shops where id = a.shop_id;
  if v_owner is not null then
    perform public.notify_user(v_owner, 'subscription_rejected', 'Paiement d''abonnement non confirmé',
      case when nullif(btrim(coalesce(p_reason, '')), '') is not null then 'Votre paiement n''a pas pu être confirmé : ' || left(btrim(p_reason), 200)
           else 'Votre paiement d''abonnement n''a pas pu être confirmé. Réessayez depuis « Mon abonnement » ou contactez le support.' end,
      '/pro/seller/abonnement', null, null, null, a.shop_id);
  end if;
  return jsonb_build_object('alreadyProcessed', false);
end;
$fn$;

-- Droits : fonctions serveur = service_role uniquement ; jamais anon / authenticated.
revoke all on function public.subscription_payments_create_attempt(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.subscription_payments_set_pending(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.subscription_payments_fail(uuid, text, text) from public, anon, authenticated;
revoke all on function ezial_private.subscription_confirm_attempt(uuid, text, integer, uuid) from public, anon, authenticated;
revoke all on function public.subscription_payments_confirm(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.subscription_payments_record_verification(uuid, text, integer, text) from public, anon, authenticated;
revoke all on function public.subscription_payments_reconcile_candidates(integer) from public, anon, authenticated;
grant execute on function public.subscription_payments_create_attempt(uuid, text, text, uuid) to service_role;
grant execute on function public.subscription_payments_set_pending(uuid, text, text, timestamptz) to service_role;
grant execute on function public.subscription_payments_fail(uuid, text, text) to service_role;
grant execute on function public.subscription_payments_confirm(uuid, text, integer) to service_role;
grant execute on function public.subscription_payments_record_verification(uuid, text, integer, text) to service_role;
grant execute on function public.subscription_payments_reconcile_candidates(integer) to service_role;
-- Lecture publique (uuid non devinable) ; vendeur ; administration (contrôle d'identité dans chaque fonction).
revoke all on function public.subscription_payment_return_status(uuid) from public;
grant execute on function public.subscription_payment_return_status(uuid) to anon, authenticated, service_role;
revoke all on function public.seller_subscription_attempt_state(uuid) from public, anon;
grant execute on function public.seller_subscription_attempt_state(uuid) to authenticated;
revoke all on function public.admin_subscription_payments(integer) from public, anon;
grant execute on function public.admin_subscription_payments(integer) to authenticated;
revoke all on function public.admin_confirm_subscription_attempt(uuid, text, text) from public, anon;
grant execute on function public.admin_confirm_subscription_attempt(uuid, text, text) to authenticated;
revoke all on function public.admin_reject_subscription_attempt(uuid, text) from public, anon;
grant execute on function public.admin_reject_subscription_attempt(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Fonctions de production modifiées (empreintes contrôlées plus haut)
-- ---------------------------------------------------------------------------

-- 7.1 « Nouvelle demande » seulement pour une ligne à vérifier ; l'activation en ligne a sa propre alerte.
create or replace function public.notify_admin_new_subscription_payment()
returns trigger language plpgsql security definer set search_path to 'public' as $fn$
declare v_shop_name text;
begin
  -- abonnement-om : une ligne déjà confirmée (activation en ligne) ne crée pas de « demande ».
  if new.status is distinct from 'pending_review' then return new; end if;
  select name into v_shop_name from public.shops where id = new.shop_id;
  perform public.notify_admins('subscription_payment_pending',
    'Nouvelle demande d''activation Ezial Plus : ' || coalesce(v_shop_name, 'boutique')
      || ' (' || new.amount || ' FCFA, ' || case new.billing_period when 'annual' then 'annuel' else 'trimestriel' end
      || ', via ' || new.payment_method || ')',
    '/pro/admin/abonnements', null, null, null, new.shop_id);
  return new;
end;
$fn$;

-- 7.2 Expirations et rappels : identique, sauf le lien (paiement) et le texte du rappel de renouvellement.
create or replace function public.process_subscription_expirations()
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare v_row record; v_unpublished integer; v_gift record; v_pay text;
begin
  -- abonnement-om : le rappel « 7 jours avant la fin » ouvre directement la page de paiement (bouton « Renouveler »).
  for v_gift in
    select g.id as grant_id, g.shop_id, g.ends_at, s.owner_id, s.name as shop_name, coalesce(s.is_official, false) as is_official,
           ss.pro_until, ss.billing_period
      from public.premium_grants g
      join public.shops s on s.id = g.shop_id
      left join public.seller_subscriptions ss on ss.shop_id = g.shop_id
     where g.status = 'active' and g.ends_at <= now()
  loop
    if v_gift.pro_until is not null and v_gift.pro_until > now() then
      update public.premium_grants set status = 'expired', ended_at = v_gift.ends_at, updated_at = now() where id = v_gift.grant_id;
      perform ezial_private.audit('system', 'premium_grant_expired', 'premium_grant', v_gift.grant_id,
        jsonb_build_object('shop_id', v_gift.shop_id, 'back_to_free', false, 'paid_subscription', v_gift.billing_period is not null));
    else
      update public.seller_subscriptions set plan = 'free', billing_period = null, expiry_warned_at = null, downgraded_at = now(), updated_at = now() where shop_id = v_gift.shop_id;
      v_unpublished := case when v_gift.is_official then 0 else ezial_private.unpublish_products_over_limit(v_gift.shop_id, 10) end;
      update public.premium_grants set status = 'expired', ended_at = v_gift.ends_at, updated_at = now() where id = v_gift.grant_id;
      perform ezial_private.audit('system', 'premium_grant_expired', 'premium_grant', v_gift.grant_id,
        jsonb_build_object('shop_id', v_gift.shop_id, 'back_to_free', true, 'unpublished', v_unpublished));
      if v_gift.owner_id is not null then
        perform public.notify_user(v_gift.owner_id, 'subscription_expired', 'Votre accès Ezial Plus offert est terminé',
          'Votre boutique "' || coalesce(v_gift.shop_name, '') || '" est repassée au forfait Free : 10 produits publiés maximum et commission de 10 % sur les nouvelles ventes. Aucun prélèvement n''a été effectué.'
            || case when v_unpublished > 0 then ' ' || v_unpublished || case when v_unpublished > 1 then ' produits ont été mis hors ligne' else ' produit a été mis hors ligne' end
                 || ' (rien n''est supprimé) : choisissez à tout moment lesquels garder en ligne, dans « Produits ».' else '' end
            || ' Vous pouvez vous abonner à Ezial Plus à tout moment.',
          case when v_unpublished > 0 then '/pro/seller/produits/selection' else '/pro/seller/abonnement' end,
          null, null, null, v_gift.shop_id);
      end if;
    end if;
  end loop;

  for v_row in
    select ss.id, ss.shop_id, ss.pro_until, ss.billing_period, s.owner_id, s.name as shop_name,
           exists (select 1 from public.premium_grants g where g.shop_id = ss.shop_id and g.status = 'active') as has_gift
      from public.seller_subscriptions ss join public.shops s on s.id = ss.shop_id
     where ss.plan = 'pro' and ss.pro_until is not null and ss.pro_until > now()
       and ss.pro_until <= now() + interval '7 days' and ss.expiry_warned_at is null and ss.cancel_requested_at is null
  loop
    v_pay := '/pro/seller/abonnement/paiement?periode=' || case when v_row.billing_period = 'annual' then 'annuel' else 'trimestriel' end;
    if v_row.has_gift and v_row.billing_period is null then
      perform public.notify_user(v_row.owner_id, 'subscription_expiring_soon', 'Votre accès Ezial Plus offert se termine bientôt',
        'Votre accès Ezial Plus offert pour "' || coalesce(v_row.shop_name, 'votre boutique') || '" se termine le '
          || to_char(v_row.pro_until, 'DD/MM/YYYY') || '. Ensuite, la boutique repasse à Ezial Free (10 produits publiés, commission de 10 %), sans aucun prélèvement. Abonnez-vous avec Orange Money pour conserver vos 30 produits et vos avantages.',
        v_pay, null, null, null, v_row.shop_id);
    elsif v_row.billing_period is null then
      perform public.notify_user(v_row.owner_id, 'subscription_expiring_soon', 'Votre essai Ezial Plus se termine bientôt',
        'Votre essai Ezial Plus pour "' || coalesce(v_row.shop_name, 'votre boutique') || '" se termine le '
          || to_char(v_row.pro_until, 'DD/MM/YYYY') || '. Abonnez-vous avec Orange Money (tous les 3 mois ou à l''année) pour conserver vos 30 produits et vos avantages. Sans abonnement, seuls 10 produits resteront en ligne.',
        v_pay, null, null, null, v_row.shop_id);
    else
      perform public.notify_user(v_row.owner_id, 'subscription_expiring_soon', 'Votre abonnement Ezial Plus expire bientôt',
        'Votre abonnement Ezial Plus ' || case v_row.billing_period when 'annual' then 'annuel' else 'trimestriel' end
          || ' pour "' || coalesce(v_row.shop_name, 'votre boutique') || '" expire le '
          || to_char(v_row.pro_until, 'DD/MM/YYYY') || '. Appuyez sur « Renouveler » pour payer avec Orange Money et conserver vos 30 produits et vos avantages. Aucun prélèvement automatique : sans paiement, l''abonnement n''est pas prolongé.',
        v_pay, null, null, null, v_row.shop_id);
    end if;
    update public.seller_subscriptions set expiry_warned_at = now() where id = v_row.id;
  end loop;

  for v_row in
    select ss.id, ss.shop_id, ss.pro_until, ss.premium_paid_ever, ss.billing_period, s.owner_id, s.name as shop_name,
           coalesce(s.is_official, false) as is_official
      from public.seller_subscriptions ss join public.shops s on s.id = ss.shop_id
     where ss.plan = 'pro' and ss.pro_until is not null and ss.pro_until <= now()
       and (ss.downgraded_at is null or ss.downgraded_at < ss.pro_until)
  loop
    v_unpublished := case when v_row.is_official then 0 else ezial_private.unpublish_products_over_limit(v_row.shop_id, 10) end;

    if v_row.premium_paid_ever then
      update public.seller_subscriptions set expiry_warned_at = null, downgraded_at = now(), updated_at = now() where id = v_row.id;
    else
      update public.seller_subscriptions set plan = 'free', expiry_warned_at = null, downgraded_at = now(), updated_at = now() where id = v_row.id;
    end if;

    -- abonnement-om : la boutique officielle (toujours Ezial Plus) n'est jamais prévenue d'un « retour au plan gratuit » après un test.
    if not v_row.is_official then
    perform public.notify_user(v_row.owner_id, 'subscription_expired',
      case when v_row.billing_period is null and not v_row.premium_paid_ever then 'Votre essai Ezial Plus est terminé' else 'Votre abonnement Ezial Plus a expiré' end,
      'Votre boutique "' || coalesce(v_row.shop_name, '') || '" est repassée au forfait Free : 10 produits publiés maximum et commission de 10 % sur les nouvelles ventes.'
        || case when v_unpublished > 0 then ' ' || v_unpublished || case when v_unpublished > 1 then ' produits ont été mis hors ligne' else ' produit a été mis hors ligne' end
             || ' (rien n''est supprimé) : choisissez à tout moment lesquels garder en ligne, dans « Produits ».' else '' end
        || ' Vous pouvez vous abonner à Ezial Plus à tout moment.',
      case when v_unpublished > 0 then '/pro/seller/produits/selection' else '/pro/seller/abonnement' end,
      null, null, null, v_row.shop_id);
    end if;
  end loop;
end;
$fn$;

-- 7.3 Remboursements : « Espèces » retiré (règle permanente : aucun paiement ni remboursement en espèces).
alter table public.order_shop_cancellations drop constraint if exists order_shop_cancellations_refund_method_check;
alter table public.order_shop_cancellations add constraint order_shop_cancellations_refund_method_check
  check (refund_method is null or refund_method in ('orange_money', 'wave', 'virement', 'autre'));

create or replace function public.admin_mark_refunded(p_id uuid, p_method text, p_reference text default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path to '' as $fn$
declare c public.order_shop_cancellations;
begin
  -- abonnement-om : « especes » n'est plus un moyen de remboursement accepté.
  if not exists (select 1 from public.admins a where a.user_id = (select auth.uid())) then
    raise exception 'Accès réservé aux administrateurs.' using errcode = 'P0001';
  end if;
  if p_method is null or p_method not in ('orange_money', 'wave', 'virement', 'autre') then
    raise exception 'Choisissez le moyen utilisé pour le remboursement.' using errcode = 'P0001';
  end if;
  select * into c from public.order_shop_cancellations where id = p_id for update;
  if c.id is null or c.refund_status = 'none' then raise exception 'Remboursement introuvable.' using errcode = 'P0001'; end if;
  if c.refund_status = 'refunded' then
    return jsonb_build_object('success', true, 'already', true, 'refunded_at', c.refunded_at);
  end if;
  update public.order_shop_cancellations
     set refund_status = 'refunded', refunded_at = now(), refund_method = p_method,
         refund_reference = nullif(left(btrim(coalesce(p_reference, '')), 120), ''),
         refund_note = nullif(left(btrim(coalesce(p_note, '')), 300), ''), refunded_by = (select auth.uid())
   where id = c.id returning * into c;
  update public.admin_notifications set is_read = true
   where type = 'refund_to_make' and order_id = c.order_id and shop_id is not distinct from c.shop_id and not is_read;
  perform ezial_private.audit('admin', 'refund_marked_done', 'order_shop_cancellation', c.id,
    jsonb_build_object('order_id', c.order_id, 'amount', c.part_amount, 'method', p_method));
  return jsonb_build_object('success', true, 'already', false, 'refunded_at', c.refunded_at);
end;
$fn$;

commit;

-- Vérification (doit afficher « ok » sur chaque ligne)
select 'table des tentatives, fermée à anon / authenticated' as element,
       case when to_regclass('public.subscription_payment_attempts') is not null
             and not has_table_privilege('anon', 'public.subscription_payment_attempts', 'select')
             and not has_table_privilege('authenticated', 'public.subscription_payment_attempts', 'select') then 'ok' else 'À VÉRIFIER' end as etat
union all
select 'activation : appelable par service_role seulement',
       case when has_function_privilege('service_role', 'public.subscription_payments_confirm(uuid,text,integer)', 'execute')
             and not has_function_privilege('anon', 'public.subscription_payments_confirm(uuid,text,integer)', 'execute')
             and not has_function_privilege('authenticated', 'public.subscription_payments_confirm(uuid,text,integer)', 'execute')
             and not has_function_privilege('authenticated', 'public.subscription_payments_create_attempt(uuid,text,text,uuid)', 'execute')
             and not has_function_privilege('authenticated', 'public.subscription_payments_record_verification(uuid,text,integer,text)', 'execute') then 'ok' else 'À VÉRIFIER' end
union all
select 'le vendeur ne peut plus déclarer un paiement hors du site',
       case when not exists (select 1 from pg_policy where polrelid = 'public.subscription_payments'::regclass and polname = 'subscription_payments_insert_own') then 'ok' else 'À VÉRIFIER' end
union all
select 'remboursement en espèces retiré',
       case when pg_get_constraintdef((select oid from pg_constraint where conname = 'order_shop_cancellations_refund_method_check')) not like '%especes%' then 'ok' else 'À VÉRIFIER' end
union all
select 'rappel de renouvellement mène au paiement',
       case when position('abonnement/paiement' in pg_get_functiondef('public.process_subscription_expirations()'::regprocedure)) > 0 then 'ok' else 'À VÉRIFIER' end;

-- RETIRER LE PLAN DE TEST « test_25 » après le lancement (une ligne ; les paiements de test déjà enregistrés restent lisibles) :
--   create or replace function ezial_private.subscription_attempt_price(p_billing_period text) returns integer language sql immutable set search_path = '' as $f$ select public.subscription_plan_price(p_billing_period) $f$;
-- (le prix de « test_25 » devient inconnu : la base refuse alors toute nouvelle tentative de test, même d'un compte testeur.)
