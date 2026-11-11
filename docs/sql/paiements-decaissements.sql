-- Ezial — paiements Wave / Orange Money, registre vendeurs, décaissements.
-- Architecture prête, TOUT DÉSACTIVÉ : aucun encaissement ni versement ne
-- peut avoir lieu tant que payment_settings.collections_enabled et
-- payouts_enabled restent à false et que les API officielles ne sont pas
-- branchées. Aucune donnée existante n'est modifiée ni supprimée ; les 17
-- ventes déjà enregistrées gardent leur statut. Rejouable, une transaction.
begin;

create schema if not exists ezial_private;

-- =====================================================================
-- 1. Réglages (une ligne, aucun secret)
-- =====================================================================
create table if not exists public.payment_settings (
  id boolean primary key default true check (id),
  collections_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  payout_frequency text not null default 'daily' check (payout_frequency in ('daily', 'weekly')),
  payout_weekday integer not null default 1 check (payout_weekday between 1 and 7),  -- 1 = lundi (si hebdomadaire)
  fees_paid_by text not null default 'ezial' check (fees_paid_by in ('ezial')),       -- décision du 11/11/2026
  -- Retrait en boutique : c'est le vendeur qui le déclare. Tant que ce n'est
  -- pas vérifié par le code du client côté serveur, un administrateur
  -- confirme le retrait avant que la part devienne versable.
  pickup_auto_eligible boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.payment_settings (id) values (true) on conflict (id) do nothing;

-- État réel des API, écrit uniquement par les services serveur.
create table if not exists public.payment_provider_status (
  provider text not null check (provider in ('wave', 'orange_money')),
  capability text not null check (capability in ('collection', 'disbursement')),
  configured boolean not null default false,
  ready boolean not null default false,
  last_balance integer,             -- solde du compte de décaissement, si l'API le fournit
  last_checked_at timestamptz,
  last_error text,
  primary key (provider, capability)
);
insert into public.payment_provider_status (provider, capability) values
  ('wave', 'collection'), ('wave', 'disbursement'), ('orange_money', 'collection'), ('orange_money', 'disbursement')
on conflict do nothing;

-- =====================================================================
-- 2. Journal d'audit et événements internes (idempotents)
-- =====================================================================
create table if not exists public.finance_audit_log (
  id bigserial primary key,
  occurred_at timestamptz not null default now(),
  actor_id uuid,
  actor_kind text not null check (actor_kind in ('system', 'service', 'admin', 'seller', 'customer', 'driver')),
  action text not null,
  entity text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb
);
create index if not exists finance_audit_log_entity_idx on public.finance_audit_log (entity, entity_id);
create index if not exists finance_audit_log_time_idx on public.finance_audit_log (occurred_at desc);

create table if not exists public.ezial_events (
  id bigserial primary key,
  event_type text not null check (event_type in ('payment.confirmed', 'order.confirmed', 'order.delivery_started', 'seller_order.created',
    'seller_order.unhandled_24h', 'seller_order.delivered', 'payout.completed', 'payout.failed', 'finance.anomaly')),
  entity_id uuid not null,
  dedupe_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ezial_events_type_idx on public.ezial_events (event_type, created_at desc);

create or replace function ezial_private.audit(p_actor_kind text, p_action text, p_entity text, p_entity_id uuid, p_details jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.finance_audit_log (actor_id, actor_kind, action, entity, entity_id, details)
  values ((select auth.uid()), p_actor_kind, p_action, p_entity, p_entity_id, coalesce(p_details, '{}'::jsonb));
$$;

create or replace function ezial_private.emit_event(p_type text, p_entity_id uuid, p_dedupe_suffix text default null, p_payload jsonb default '{}'::jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_rows integer;
begin
  insert into public.ezial_events (event_type, entity_id, dedupe_key, payload)
  values (p_type, p_entity_id, p_type || ':' || p_entity_id || coalesce(':' || p_dedupe_suffix, ''), coalesce(p_payload, '{}'::jsonb))
  on conflict (dedupe_key) do nothing;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

-- =====================================================================
-- 3. Encaissements (un paiement unique par commande, multiboutique inclus)
-- =====================================================================
create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  provider text not null check (provider in ('wave', 'orange_money')),
  status text not null default 'initiated' check (status in ('initiated', 'pending', 'confirmed', 'failed', 'cancelled', 'expired')),
  amount integer not null check (amount > 0),          -- recalculé côté serveur (orders.total_amount), jamais par le navigateur
  currency text not null default 'XOF' check (currency = 'XOF'),
  idempotency_key text not null unique,
  provider_reference text,
  checkout_url text,
  failure_reason text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz
);
create unique index if not exists payment_transactions_provider_ref_key on public.payment_transactions (provider, provider_reference) where provider_reference is not null;
create unique index if not exists payment_transactions_one_open_per_order on public.payment_transactions (order_id) where status in ('initiated', 'pending');
create unique index if not exists payment_transactions_one_confirmed_per_order on public.payment_transactions (order_id) where status = 'confirmed';
create index if not exists payment_transactions_status_idx on public.payment_transactions (status, created_at desc);

-- Notifications reçues des fournisseurs (webhooks), une seule fois chacune.
-- Pas de contenu brut stocké : seulement ce qui sert au rapprochement.
create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('wave', 'orange_money')),
  capability text not null check (capability in ('collection', 'disbursement')),
  provider_event_id text not null,
  event_type text,
  provider_reference text,
  reported_status text,
  reported_amount integer,
  signature_valid boolean not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  result text,
  unique (provider, capability, provider_event_id)
);

-- =====================================================================
-- 4. Registre vendeur : on complète seller_transactions (déjà le registre
--    des ventes / commissions / versements) au lieu d'en créer un autre.
-- =====================================================================
alter table public.seller_transactions add column if not exists order_shop_id uuid references public.order_shops(id);
alter table public.seller_transactions add column if not exists payout_id uuid;
alter table public.seller_transactions add column if not exists available_at timestamptz;
alter table public.seller_transactions add column if not exists hold_reason text;
create index if not exists seller_transactions_order_shop_idx on public.seller_transactions (order_shop_id);
create index if not exists seller_transactions_payout_idx on public.seller_transactions (payout_id);
create index if not exists seller_transactions_shop_status_idx on public.seller_transactions (shop_id, type, status);

-- Les nouvelles ventes naissent « en attente » (et non plus « disponibles ») :
-- elles ne deviennent versables qu'une fois le paiement confirmé par le
-- fournisseur ET la livraison confirmée (décision du 11/11/2026).
create or replace function ezial_private.trg_seller_sale_starts_pending()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.type = 'sale' then
    if new.order_shop_id is null and new.order_id is not null then
      select os.id into new.order_shop_id from public.order_shops os where os.order_id = new.order_id and os.shop_id = new.shop_id;
    end if;
    if new.status = 'available' then new.status := 'pending'; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_seller_sale_starts_pending on public.seller_transactions;
create trigger trg_seller_sale_starts_pending before insert on public.seller_transactions
  for each row execute function ezial_private.trg_seller_sale_starts_pending();

-- =====================================================================
-- 5. Moyens de réception des vendeurs (Wave ou Orange Money, pas de banque)
-- =====================================================================
create table if not exists public.seller_payout_methods (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  provider text not null check (provider in ('wave', 'orange_money')),
  phone text not null,
  holder_name text,
  extra jsonb not null default '{}'::jsonb,       -- informations supplémentaires exigées par le fournisseur (à définir)
  status text not null default 'pending_review' check (status in ('pending_review', 'approved', 'rejected', 'superseded')),
  consent_given_at timestamptz not null,
  submitted_by uuid not null,
  submitted_at timestamptz not null default now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text
);
create unique index if not exists seller_payout_methods_one_approved on public.seller_payout_methods (shop_id) where status = 'approved';
create unique index if not exists seller_payout_methods_one_pending on public.seller_payout_methods (shop_id) where status = 'pending_review';

-- =====================================================================
-- 6. Décaissements
-- =====================================================================
create table if not exists public.seller_payouts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  payout_method_id uuid not null references public.seller_payout_methods(id),
  provider text not null check (provider in ('wave', 'orange_money')),
  recipient_phone text not null,                    -- copie au moment du versement
  amount integer not null check (amount > 0),
  status text not null default 'scheduled' check (status in ('scheduled', 'processing', 'unknown', 'succeeded', 'failed', 'blocked', 'cancelled')),
  block_reason text,
  idempotency_key text not null unique,
  provider_reference text,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  sent_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists seller_payouts_shop_idx on public.seller_payouts (shop_id, created_at desc);
create index if not exists seller_payouts_status_idx on public.seller_payouts (status, next_attempt_at);
create unique index if not exists seller_payouts_provider_ref_key on public.seller_payouts (provider, provider_reference) where provider_reference is not null;

-- =====================================================================
-- 7. Accès (RLS) : vendeur = sa boutique seulement ; admin = lecture ;
--    aucune écriture directe, tout passe par les fonctions ci-dessous.
-- =====================================================================
alter table public.payment_settings enable row level security;
alter table public.payment_provider_status enable row level security;
alter table public.finance_audit_log enable row level security;
alter table public.ezial_events enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.payment_events enable row level security;
alter table public.seller_payout_methods enable row level security;
alter table public.seller_payouts enable row level security;
revoke all on public.payment_settings, public.payment_provider_status, public.finance_audit_log, public.ezial_events,
  public.payment_transactions, public.payment_events, public.seller_payout_methods, public.seller_payouts from anon, authenticated;
grant select on public.payment_settings, public.payment_provider_status, public.finance_audit_log, public.ezial_events,
  public.payment_transactions, public.payment_events, public.seller_payout_methods, public.seller_payouts to authenticated;
revoke usage, select on sequence public.finance_audit_log_id_seq, public.ezial_events_id_seq from anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['payment_settings', 'payment_provider_status', 'finance_audit_log', 'ezial_events', 'payment_transactions', 'payment_events', 'seller_payout_methods', 'seller_payouts'] loop
    execute format('drop policy if exists %I on public.%I', t || '_admin_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (exists (select 1 from public.admins a where a.user_id = (select auth.uid())))', t || '_admin_select', t);
  end loop;
end $$;

drop policy if exists seller_payout_methods_owner_select on public.seller_payout_methods;
create policy seller_payout_methods_owner_select on public.seller_payout_methods for select to authenticated
  using (exists (select 1 from public.shops s where s.id = shop_id and s.owner_id = (select auth.uid())));
drop policy if exists seller_payouts_owner_select on public.seller_payouts;
create policy seller_payouts_owner_select on public.seller_payouts for select to authenticated
  using (exists (select 1 from public.shops s where s.id = shop_id and s.owner_id = (select auth.uid())));
-- L'acheteur voit le paiement de sa propre commande (statut seulement).
drop policy if exists payment_transactions_customer_select on public.payment_transactions;
create policy payment_transactions_customer_select on public.payment_transactions for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.customer_id = (select auth.uid())));

-- seller_transactions : le vendeur ne peut toujours que lire (aucune
-- politique d'écriture) ; on retire en plus le droit d'écriture des colonnes.
revoke insert, update, delete on public.seller_transactions from anon, authenticated;

-- =====================================================================
-- 8. Admissibilité d'une part vendeur au versement
-- =====================================================================
-- Versable quand : paiement confirmé par le fournisseur + livraison confirmée
-- (ou retrait confirmé) + aucune réclamation ouverte + sous-commande non
-- annulée. Recalculé à chaque événement, jamais par le navigateur.
create or replace function ezial_private.order_shop_delivered(p_order_shop_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when os.status = 'cancelled' then false
    when os.fulfillment_type = 'pickup' then
      os.status = 'picked_up' and (
        (select s.pickup_auto_eligible from public.payment_settings s where s.id)
        or exists (select 1 from public.finance_audit_log l where l.entity = 'order_shop' and l.entity_id = os.id and l.action = 'admin_confirm_pickup'))
    else exists (
      select 1 from public.delivery_missions m
        join public.delivery_stops st on st.mission_id = m.id and st.shop_id = os.shop_id
       where m.order_id = os.order_id and m.status = 'delivered')
  end
  from public.order_shops os where os.id = p_order_shop_id;
$$;

create or replace function ezial_private.refresh_order_shop_eligibility(p_order_shop_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  os public.order_shops; o public.orders;
  v_paid boolean; v_delivered boolean; v_claim_open boolean; v_ok boolean; v_tx record;
begin
  select * into os from public.order_shops where id = p_order_shop_id;
  if os.id is null then return; end if;
  select * into o from public.orders where id = os.order_id;

  -- Annulation : la vente non versée est annulée ; déjà versée → anomalie.
  if os.status = 'cancelled' or o.status = 'cancelled' then
    for v_tx in select st.id, st.status, st.payout_id from public.seller_transactions st where st.order_shop_id = os.id and st.type = 'sale' and st.status <> 'cancelled' loop
      if v_tx.status = 'paid' or v_tx.payout_id is not null then
        perform ezial_private.emit_event('finance.anomaly', os.id, 'cancelled_after_payout', jsonb_build_object('reason', 'Commande annulée alors que la part vendeur est déjà versée ou en cours de versement.'));
      else
        update public.seller_transactions set status = 'cancelled', hold_reason = 'commande annulée' where id = v_tx.id;
        perform ezial_private.audit('system', 'sale_cancelled', 'seller_transaction', v_tx.id, jsonb_build_object('order_shop_id', os.id));
      end if;
    end loop;
    return;
  end if;

  v_paid := o.payment_status = 'paid' and exists (select 1 from public.payment_transactions pt where pt.order_id = o.id and pt.status = 'confirmed');
  v_delivered := ezial_private.order_shop_delivered(os.id);
  v_claim_open := exists (select 1 from public.order_claims c where c.order_shop_id = os.id and c.status in ('demande_recue', 'en_cours_examen', 'approuvee', 'en_cours_paiement', 'remboursee'));
  v_ok := v_paid and v_delivered and not v_claim_open;

  for v_tx in select st.id, st.status, st.payout_id from public.seller_transactions st where st.order_shop_id = os.id and st.type = 'sale' and st.status in ('pending', 'available') loop
    if v_ok and v_tx.status = 'pending' then
      update public.seller_transactions set status = 'available', available_at = now(), hold_reason = null where id = v_tx.id;
      perform ezial_private.audit('system', 'sale_available', 'seller_transaction', v_tx.id, jsonb_build_object('order_shop_id', os.id));
    elsif not v_ok and v_tx.status = 'available' and v_tx.payout_id is null and v_claim_open then
      update public.seller_transactions set status = 'pending', hold_reason = 'réclamation en cours' where id = v_tx.id;
      perform ezial_private.audit('system', 'sale_on_hold', 'seller_transaction', v_tx.id, jsonb_build_object('reason', 'claim'));
    elsif not v_ok and v_tx.payout_id is not null and v_claim_open then
      perform ezial_private.emit_event('finance.anomaly', os.id, 'claim_during_payout', jsonb_build_object('reason', 'Réclamation ouverte sur une part en cours de versement.'));
    end if;
  end loop;

  if v_delivered then perform ezial_private.emit_event('seller_order.delivered', os.id); end if;
end;
$$;

create or replace function ezial_private.refresh_order_eligibility(p_order_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  for v in select id from public.order_shops where order_id = p_order_id loop
    perform ezial_private.refresh_order_shop_eligibility(v);
  end loop;
end;
$$;

-- Déclencheurs (toute erreur absorbée : une commande, une livraison ou une
-- réclamation ne peut jamais échouer à cause de la comptabilité).
create or replace function ezial_private.trg_finance_refresh()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    if tg_table_name = 'order_shops' then
      perform ezial_private.refresh_order_shop_eligibility(new.id);
    elsif tg_table_name = 'order_claims' then
      if new.order_shop_id is not null then perform ezial_private.refresh_order_shop_eligibility(new.order_shop_id); end if;
    elsif tg_table_name = 'orders' then
      perform ezial_private.refresh_order_eligibility(new.id);
    else
      perform ezial_private.refresh_order_eligibility(new.order_id);
    end if;
    if tg_table_name = 'delivery_missions' and new.status = 'out_for_delivery' then
      perform ezial_private.emit_event('order.delivery_started', new.order_id);
    end if;
  exception when others then
    raise warning 'finance refresh (%): %', tg_table_name, sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists trg_finance_order_shop_status on public.order_shops;
create trigger trg_finance_order_shop_status after update on public.order_shops
  for each row when (old.status is distinct from new.status) execute function ezial_private.trg_finance_refresh();
drop trigger if exists trg_finance_order_status on public.orders;
create trigger trg_finance_order_status after update on public.orders
  for each row when (old.status is distinct from new.status or old.payment_status is distinct from new.payment_status)
  execute function ezial_private.trg_finance_refresh();
drop trigger if exists trg_finance_mission_status on public.delivery_missions;
create trigger trg_finance_mission_status after update on public.delivery_missions
  for each row when (old.status is distinct from new.status) execute function ezial_private.trg_finance_refresh();
drop trigger if exists trg_finance_claim on public.order_claims;
create trigger trg_finance_claim after insert or update on public.order_claims
  for each row execute function ezial_private.trg_finance_refresh();

-- Événements de création (commande acceptée, part vendeur créée).
create or replace function ezial_private.trg_events_order_created()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  begin
    if new.status <> 'cancelled' then
      perform ezial_private.emit_event('order.confirmed', new.id);
      for v in select id from public.order_shops where order_id = new.id loop
        perform ezial_private.emit_event('seller_order.created', v);
      end loop;
    end if;
  exception when others then
    raise warning 'events order created: %', sqlerrm;
  end;
  return null;
end;
$$;
drop trigger if exists trg_events_order_created on public.orders;
create constraint trigger trg_events_order_created after insert on public.orders deferrable initially deferred
  for each row execute function ezial_private.trg_events_order_created();

-- =====================================================================
-- 9. Livraison confirmée par le serveur (code client vérifié ici)
-- =====================================================================
create or replace function public.driver_complete_delivery(p_mission_id uuid, p_delivery_code text, p_proof_photo_path text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.delivery_missions;
begin
  select * into m from public.delivery_missions where id = p_mission_id for update;
  if m.id is null or m.driver_id is distinct from (select auth.uid()) then
    raise exception 'Mission introuvable.' using errcode = 'P0001';
  end if;
  if m.status = 'delivered' then return jsonb_build_object('alreadyDelivered', true); end if;
  if m.status <> 'out_for_delivery' then
    raise exception 'La livraison n''a pas été démarrée.' using errcode = 'P0001';
  end if;
  if m.delivery_code is null or trim(coalesce(p_delivery_code, '')) <> m.delivery_code then
    raise exception 'Code de livraison incorrect.' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_proof_photo_path), '') = '' or split_part(p_proof_photo_path, '/', 1) <> (select auth.uid())::text then
    raise exception 'Preuve photo manquante.' using errcode = 'P0001';
  end if;
  perform set_config('ezial.delivery_confirmed_by_server', 'on', true);
  update public.delivery_missions set status = 'delivered', delivered_at = now(), proof_photo_path = p_proof_photo_path where id = m.id;
  perform ezial_private.audit('driver', 'delivery_confirmed', 'delivery_mission', m.id, jsonb_build_object('order_id', m.order_id));
  return jsonb_build_object('delivered', true);
end;
$$;
revoke all on function public.driver_complete_delivery(uuid, text, text) from public, anon;
grant execute on function public.driver_complete_delivery(uuid, text, text) to authenticated;

-- =====================================================================
-- 10. Encaissements : fonctions du service serveur (clé service_role)
-- =====================================================================
create or replace function public.payments_create_transaction(p_order_id uuid, p_provider text, p_user_id uuid)
returns public.payment_transactions language plpgsql security definer set search_path = '' as $$
declare o public.orders; t public.payment_transactions; v_enabled boolean;
begin
  select s.collections_enabled into v_enabled from public.payment_settings s where s.id;
  if not coalesce(v_enabled, false) then
    raise exception 'Le paiement en ligne est en cours d''activation.' using errcode = 'P0001';
  end if;
  if p_provider not in ('wave', 'orange_money') then raise exception 'Moyen de paiement inconnu.' using errcode = 'P0001'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null or o.customer_id is distinct from p_user_id then raise exception 'Commande introuvable.' using errcode = 'P0001'; end if;
  if o.status = 'cancelled' then raise exception 'Cette commande est annulée.' using errcode = 'P0001'; end if;
  if o.payment_status = 'paid' then raise exception 'Cette commande est déjà payée.' using errcode = 'P0001'; end if;
  if coalesce(o.total_amount, 0) <= 0 then raise exception 'Montant de commande invalide.' using errcode = 'P0001'; end if;

  -- Réutilise la transaction ouverte du même fournisseur et du même montant.
  select * into t from public.payment_transactions
   where order_id = o.id and status in ('initiated', 'pending') and provider = p_provider and amount = o.total_amount
     and (expires_at is null or expires_at > now());
  if t.id is not null then return t; end if;

  -- Une autre tentative ouverte (autre fournisseur ou expirée) est close.
  update public.payment_transactions set status = 'cancelled', failure_reason = 'remplacée par une nouvelle tentative', updated_at = now()
   where order_id = o.id and status in ('initiated', 'pending');

  insert into public.payment_transactions (order_id, provider, amount, idempotency_key)
  values (o.id, p_provider, o.total_amount, 'pay_' || replace(gen_random_uuid()::text, '-', ''))
  returning * into t;
  update public.orders set payment_method = p_provider where id = o.id and payment_method is distinct from p_provider;
  perform ezial_private.audit('service', 'payment_initiated', 'payment_transaction', t.id, jsonb_build_object('order_id', o.id, 'provider', p_provider, 'amount', t.amount));
  return t;
end;
$$;

create or replace function public.payments_set_pending(p_transaction_id uuid, p_provider_reference text, p_checkout_url text, p_expires_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.payment_transactions
     set status = 'pending', provider_reference = coalesce(p_provider_reference, provider_reference),
         checkout_url = p_checkout_url, expires_at = p_expires_at, updated_at = now()
   where id = p_transaction_id and status in ('initiated', 'pending');
end;
$$;

-- Notification d'un fournisseur : enregistrée une seule fois.
create or replace function public.payments_record_event(p_provider text, p_capability text, p_provider_event_id text, p_event_type text,
  p_provider_reference text, p_reported_status text, p_reported_amount integer, p_signature_valid boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_processed boolean;
begin
  insert into public.payment_events (provider, capability, provider_event_id, event_type, provider_reference, reported_status, reported_amount, signature_valid)
  values (p_provider, p_capability, p_provider_event_id, p_event_type, p_provider_reference, p_reported_status, p_reported_amount, coalesce(p_signature_valid, false))
  on conflict (provider, capability, provider_event_id) do nothing
  returning id into v_id;
  if v_id is not null then return jsonb_build_object('new', true, 'id', v_id, 'processed', false); end if;
  -- Déjà reçue : à retraiter seulement si son traitement n'a pas abouti
  -- (vérification du statut impossible la première fois).
  select e.id, e.processed_at is not null into v_id, v_processed from public.payment_events e
   where e.provider = p_provider and e.capability = p_capability and e.provider_event_id = p_provider_event_id;
  return jsonb_build_object('new', false, 'id', v_id, 'processed', coalesce(v_processed, true));
end;
$$;

create or replace function public.payments_mark_event_processed(p_event_id uuid, p_result text)
returns void language sql security definer set search_path = '' as $$
  update public.payment_events set processed_at = now(), result = left(p_result, 200) where id = p_event_id;
$$;

-- Confirmation — appelée UNIQUEMENT après vérification du statut auprès de
-- l'API du fournisseur. Idempotente : une confirmation répétée ne change rien.
create or replace function public.payments_confirm(p_transaction_id uuid, p_provider_reference text, p_confirmed_amount integer)
returns text language plpgsql security definer set search_path = '' as $$
declare t public.payment_transactions; o public.orders;
begin
  select * into t from public.payment_transactions where id = p_transaction_id for update;
  if t.id is null then return 'not_found'; end if;
  if t.status = 'confirmed' then return 'already_confirmed'; end if;
  select * into o from public.orders where id = t.order_id for update;

  if p_confirmed_amount is distinct from t.amount or t.amount is distinct from o.total_amount then
    perform ezial_private.emit_event('finance.anomaly', t.id, 'amount_mismatch', jsonb_build_object('reason', 'Montant confirmé différent du montant attendu.',
      'expected', t.amount, 'order_total', o.total_amount, 'confirmed', p_confirmed_amount));
    perform ezial_private.audit('service', 'payment_amount_mismatch', 'payment_transaction', t.id, jsonb_build_object('expected', t.amount, 'confirmed', p_confirmed_amount));
    return 'amount_mismatch';
  end if;
  if exists (select 1 from public.payment_transactions x where x.order_id = t.order_id and x.status = 'confirmed') then
    perform ezial_private.emit_event('finance.anomaly', t.id, 'double_payment', jsonb_build_object('reason', 'Deuxième paiement confirmé pour la même commande : remboursement à prévoir.'));
    return 'duplicate_payment';
  end if;

  update public.payment_transactions set status = 'confirmed', confirmed_at = now(), updated_at = now(),
    provider_reference = coalesce(p_provider_reference, provider_reference), failure_reason = null where id = t.id;
  perform ezial_private.audit('service', 'payment_confirmed', 'payment_transaction', t.id, jsonb_build_object('order_id', o.id, 'amount', t.amount, 'provider', t.provider));
  perform ezial_private.emit_event('payment.confirmed', o.id, null, jsonb_build_object('provider', t.provider, 'amount', t.amount));

  if o.status = 'cancelled' then
    perform ezial_private.emit_event('finance.anomaly', o.id, 'paid_but_cancelled', jsonb_build_object('reason', 'Paiement confirmé sur une commande annulée : remboursement à prévoir.'));
    return 'confirmed_on_cancelled_order';
  end if;
  update public.orders set payment_status = 'paid' where id = o.id and payment_status is distinct from 'paid';
  return 'confirmed';
end;
$$;

create or replace function public.payments_fail(p_transaction_id uuid, p_status text, p_reason text)
returns text language plpgsql security definer set search_path = '' as $$
declare t public.payment_transactions;
begin
  if p_status not in ('failed', 'cancelled', 'expired') then raise exception 'Statut invalide.'; end if;
  select * into t from public.payment_transactions where id = p_transaction_id for update;
  if t.id is null then return 'not_found'; end if;
  if t.status not in ('initiated', 'pending') then return t.status; end if;   -- jamais une transaction confirmée
  update public.payment_transactions set status = p_status, failure_reason = left(p_reason, 300), updated_at = now() where id = t.id;
  perform ezial_private.audit('service', 'payment_' || p_status, 'payment_transaction', t.id, jsonb_build_object('reason', left(p_reason, 300)));
  return p_status;
end;
$$;

-- =====================================================================
-- 11. Moyens de réception : saisie vendeur, validation admin
-- =====================================================================
create or replace function ezial_private.normalize_wallet_phone(p_raw text)
returns text language plpgsql immutable set search_path = '' as $$
declare v text;
begin
  -- Règles provisoires (mobile sénégalais 7X) ; à aligner sur les règles
  -- officielles de Wave et d'Orange Money à réception de leur documentation.
  v := regexp_replace(coalesce(p_raw, ''), '[\s.\-()/]', '', 'g');
  if v ~ '^00221' then v := '+' || substr(v, 3); end if;
  if v ~ '^221\d{9}$' then v := '+' || v; end if;
  if v ~ '^7\d{8}$' then v := '+221' || v; end if;
  return case when v ~ '^\+2217\d{8}$' then v else null end;
end;
$$;

create or replace function public.submit_payout_method(p_provider text, p_phone text, p_holder_name text, p_consent boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_shop uuid; v_phone text; v_id uuid;
begin
  select s.id into v_shop from public.shops s where s.owner_id = v_uid limit 1;
  if v_uid is null or v_shop is null then raise exception 'Boutique introuvable.' using errcode = 'P0001'; end if;
  if p_provider not in ('wave', 'orange_money') then raise exception 'Choisissez Wave ou Orange Money.' using errcode = 'P0001'; end if;
  if not coalesce(p_consent, false) then raise exception 'Votre autorisation est nécessaire pour recevoir les versements.' using errcode = 'P0001'; end if;
  v_phone := ezial_private.normalize_wallet_phone(p_phone);
  if v_phone is null then raise exception 'Numéro invalide : indiquez un numéro mobile sénégalais (ex. 77 123 45 67).' using errcode = 'P0001'; end if;

  update public.seller_payout_methods set status = 'superseded' where shop_id = v_shop and status = 'pending_review';
  insert into public.seller_payout_methods (shop_id, provider, phone, holder_name, status, consent_given_at, submitted_by)
  values (v_shop, p_provider, v_phone, nullif(trim(p_holder_name), ''), 'pending_review', now(), v_uid)
  returning id into v_id;
  perform ezial_private.audit('seller', 'payout_method_submitted', 'seller_payout_method', v_id, jsonb_build_object('shop_id', v_shop, 'provider', p_provider,
    'phone_end', right(v_phone, 2)));
  perform public.notify_admins('payout_method_review', 'Nouveau moyen de réception à valider pour une boutique', '/pro/admin/paiements', null, null, null, v_shop);
  return jsonb_build_object('id', v_id, 'status', 'pending_review');
end;
$$;

create or replace function public.admin_review_payout_method(p_method_id uuid, p_approve boolean, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.seller_payout_methods; v_owner uuid;
begin
  if not exists (select 1 from public.admins a where a.user_id = (select auth.uid())) then raise exception 'Accès refusé.' using errcode = 'P0001'; end if;
  select * into m from public.seller_payout_methods where id = p_method_id for update;
  if m.id is null or m.status <> 'pending_review' then raise exception 'Demande introuvable ou déjà traitée.' using errcode = 'P0001'; end if;
  if p_approve then
    update public.seller_payout_methods set status = 'superseded' where shop_id = m.shop_id and status = 'approved';
    update public.seller_payout_methods set status = 'approved', reviewed_by = (select auth.uid()), reviewed_at = now(), review_note = left(p_note, 300) where id = m.id;
  else
    update public.seller_payout_methods set status = 'rejected', reviewed_by = (select auth.uid()), reviewed_at = now(), review_note = left(p_note, 300) where id = m.id;
  end if;
  perform ezial_private.audit('admin', case when p_approve then 'payout_method_approved' else 'payout_method_rejected' end, 'seller_payout_method', m.id,
    jsonb_build_object('shop_id', m.shop_id, 'note', left(p_note, 300)));
  select owner_id into v_owner from public.shops where id = m.shop_id;
  perform public.notify_user(v_owner, 'payout_method_reviewed',
    case when p_approve then 'Moyen de réception validé' else 'Moyen de réception refusé' end,
    case when p_approve then 'Votre numéro de réception a été validé : vos prochains versements y seront envoyés.'
         else 'Votre numéro de réception n''a pas été validé.' || coalesce(' Motif : ' || left(p_note, 200), '') end,
    '/pro/seller/finances', null, null, null, m.shop_id);
  return jsonb_build_object('status', case when p_approve then 'approved' else 'rejected' end);
end;
$$;

-- Retrait en boutique déclaré par le vendeur : confirmé par un admin tant
-- que le code client n'est pas vérifié côté serveur.
create or replace function public.admin_confirm_pickup(p_order_shop_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = (select auth.uid())) then raise exception 'Accès refusé.' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.order_shops os where os.id = p_order_shop_id and os.fulfillment_type = 'pickup' and os.status = 'picked_up') then
    raise exception 'Retrait non déclaré par la boutique.' using errcode = 'P0001';
  end if;
  perform ezial_private.audit('admin', 'admin_confirm_pickup', 'order_shop', p_order_shop_id);
  perform ezial_private.refresh_order_shop_eligibility(p_order_shop_id);
end;
$$;

-- =====================================================================
-- 12. Décaissements : préparation automatique, envoi par le service
-- =====================================================================
-- Prépare un versement par boutique (somme des parts versables), selon la
-- fréquence choisie. Ne fait rien si les versements sont désactivés.
create or replace function public.payouts_prepare_due()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  s public.payment_settings; v record; v_payout uuid; v_count integer := 0; v_key text;
begin
  select * into s from public.payment_settings where id;
  if not s.payouts_enabled then return 0; end if;
  if s.payout_frequency = 'weekly' and extract(isodow from now() at time zone 'Africa/Dakar') <> s.payout_weekday then return 0; end if;
  v_key := case when s.payout_frequency = 'weekly' then to_char(now() at time zone 'Africa/Dakar', 'IYYY-IW') else to_char(now() at time zone 'Africa/Dakar', 'YYYY-MM-DD') end;

  for v in
    select st.shop_id, pm.id as method_id, pm.provider, pm.phone, sum(st.net_amount)::integer as amount
      from public.seller_transactions st
      join public.order_shops os on os.id = st.order_shop_id
      join public.orders o on o.id = os.order_id
      join public.seller_payout_methods pm on pm.shop_id = st.shop_id and pm.status = 'approved'
     where st.type = 'sale' and st.status = 'available' and st.payout_id is null
       and o.payment_status = 'paid'
       and exists (select 1 from public.payment_transactions pt where pt.order_id = o.id and pt.status = 'confirmed')
       and not exists (select 1 from public.seller_payouts p where p.shop_id = st.shop_id and p.status in ('scheduled', 'processing', 'unknown', 'blocked'))
       -- Changement de numéro en attente de validation : versements suspendus.
       and not exists (select 1 from public.seller_payout_methods pend where pend.shop_id = st.shop_id and pend.status = 'pending_review')
     group by st.shop_id, pm.id, pm.provider, pm.phone
    having sum(st.net_amount) > 0
  loop
    insert into public.seller_payouts (shop_id, payout_method_id, provider, recipient_phone, amount, idempotency_key)
    values (v.shop_id, v.method_id, v.provider, v.phone, v.amount, 'payout_' || v.shop_id || '_' || v_key)
    on conflict (idempotency_key) do nothing
    returning id into v_payout;
    if v_payout is not null then
      update public.seller_transactions st set payout_id = v_payout
        from public.order_shops os, public.orders o
       where st.shop_id = v.shop_id and st.type = 'sale' and st.status = 'available' and st.payout_id is null
         and os.id = st.order_shop_id and o.id = os.order_id and o.payment_status = 'paid';
      -- Le montant du versement = exactement les parts rattachées.
      update public.seller_payouts p set amount = (select sum(net_amount)::integer from public.seller_transactions where payout_id = v_payout)
       where p.id = v_payout;
      perform ezial_private.audit('system', 'payout_scheduled', 'seller_payout', v_payout, jsonb_build_object('shop_id', v.shop_id, 'amount', v.amount));
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

-- Réserve les versements à envoyer. Un versement « unknown » n'est JAMAIS
-- renvoyé : il doit d'abord être vérifié auprès du fournisseur.
create or replace function public.payouts_claim_batch(p_limit integer default 10)
returns setof public.seller_payouts language sql security definer set search_path = '' as $$
  with due as (
    select p.id from public.seller_payouts p, public.payment_settings s
     where s.id and s.payouts_enabled and p.status in ('scheduled', 'blocked') and p.next_attempt_at <= now()
       and exists (select 1 from public.seller_payout_methods pm where pm.id = p.payout_method_id and pm.status = 'approved')
       and not exists (select 1 from public.seller_payout_methods pend where pend.shop_id = p.shop_id and pend.status = 'pending_review')
     order by p.created_at limit greatest(1, least(coalesce(p_limit, 10), 50))
     for update of p skip locked
  )
  update public.seller_payouts p set status = 'processing', attempts = p.attempts + 1, updated_at = now(), sent_at = coalesce(p.sent_at, now())
    from due where p.id = due.id
  returning p.*;
$$;

-- Versements à vérifier auprès du fournisseur (réponse incertaine).
create or replace function public.payouts_to_reconcile(p_limit integer default 20)
returns setof public.seller_payouts language sql stable security definer set search_path = '' as $$
  select * from public.seller_payouts where status = 'unknown' or (status = 'processing' and updated_at < now() - interval '10 minutes')
   order by updated_at limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

-- Résultat d'un versement. 'succeeded' / 'failed' seulement après
-- vérification du statut réel auprès du fournisseur.
create or replace function public.payouts_record_result(p_payout_id uuid, p_outcome text, p_provider_reference text default null, p_error text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare p public.seller_payouts; v_owner uuid;
begin
  if p_outcome not in ('succeeded', 'failed', 'unknown', 'blocked', 'retry') then raise exception 'Résultat invalide.'; end if;
  select * into p from public.seller_payouts where id = p_payout_id for update;
  if p.id is null then return 'not_found'; end if;
  if p.status in ('succeeded', 'failed', 'cancelled') then return p.status; end if;   -- résultat définitif déjà enregistré

  if p_outcome = 'succeeded' then
    update public.seller_payouts set status = 'succeeded', completed_at = now(), updated_at = now(),
      provider_reference = coalesce(p_provider_reference, provider_reference), last_error = null where id = p.id;
    update public.seller_transactions set status = 'paid' where payout_id = p.id and type = 'sale';
    insert into public.seller_transactions (shop_id, type, gross_amount, commission_amount, net_amount, status, payout_id)
    values (p.shop_id, 'payout', 0, 0, p.amount, 'paid', p.id);
    perform ezial_private.audit('service', 'payout_succeeded', 'seller_payout', p.id, jsonb_build_object('amount', p.amount, 'provider', p.provider));
    perform ezial_private.emit_event('payout.completed', p.id, null, jsonb_build_object('shop_id', p.shop_id, 'amount', p.amount));
    select owner_id into v_owner from public.shops where id = p.shop_id;
    perform public.notify_user(v_owner, 'payout_completed', 'Versement effectué',
      'Un versement de ' || p.amount || ' FCFA a été envoyé sur votre compte ' || case p.provider when 'wave' then 'Wave' else 'Orange Money' end || '.',
      '/pro/seller/finances', null, null, null, p.shop_id);
    return 'succeeded';
  elsif p_outcome = 'failed' then
    -- Échec définitif confirmé : les parts redeviennent versables (nouveau
    -- versement au prochain passage), rien n'a été envoyé.
    update public.seller_payouts set status = 'failed', completed_at = now(), updated_at = now(), last_error = left(p_error, 500),
      provider_reference = coalesce(p_provider_reference, provider_reference) where id = p.id;
    update public.seller_transactions set payout_id = null where payout_id = p.id and type = 'sale' and status = 'available';
    perform ezial_private.audit('service', 'payout_failed', 'seller_payout', p.id, jsonb_build_object('error', left(p_error, 300)));
    perform ezial_private.emit_event('payout.failed', p.id, null, jsonb_build_object('shop_id', p.shop_id, 'error', left(p_error, 300)));
    perform public.notify_admins('payout_failed', 'Versement échoué pour une boutique : ' || coalesce(left(p_error, 120), 'erreur inconnue'), '/pro/admin/paiements', null, null, null, p.shop_id);
    return 'failed';
  elsif p_outcome = 'unknown' then
    update public.seller_payouts set status = 'unknown', updated_at = now(), last_error = left(p_error, 500),
      provider_reference = coalesce(p_provider_reference, provider_reference) where id = p.id;
    perform ezial_private.audit('service', 'payout_unknown', 'seller_payout', p.id, jsonb_build_object('error', left(p_error, 300)));
    return 'unknown';
  elsif p_outcome = 'blocked' then
    -- Fonds insuffisants ou API indisponible : rien n'a été envoyé ; nouvel
    -- essai dans 1 h, administrateur alerté.
    update public.seller_payouts set status = 'blocked', block_reason = left(p_error, 300), next_attempt_at = now() + interval '1 hour', updated_at = now() where id = p.id;
    perform ezial_private.audit('service', 'payout_blocked', 'seller_payout', p.id, jsonb_build_object('reason', left(p_error, 300)));
    perform public.notify_admins('payout_blocked', 'Versement en attente : ' || coalesce(left(p_error, 120), 'fonds insuffisants'), '/pro/admin/paiements', null, null, null, p.shop_id);
    return 'blocked';
  else
    -- 'retry' : erreur certaine AVANT envoi (aucun transfert créé).
    update public.seller_payouts set status = 'scheduled', next_attempt_at = now() + interval '15 minutes', last_error = left(p_error, 500), updated_at = now() where id = p.id;
    return 'scheduled';
  end if;
end;
$$;

-- État réel des API (écrit par les services).
create or replace function public.payments_record_provider_status(p_provider text, p_capability text, p_configured boolean, p_ready boolean, p_balance integer, p_error text)
returns void language sql security definer set search_path = '' as $$
  update public.payment_provider_status set configured = coalesce(p_configured, false), ready = coalesce(p_ready, false),
    last_balance = p_balance, last_checked_at = now(), last_error = left(p_error, 300)
   where provider = p_provider and capability = p_capability;
$$;

-- Expiration des tentatives de paiement abandonnées.
create or replace function public.payments_maintenance()
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.payment_transactions set status = 'expired', failure_reason = 'délai dépassé', updated_at = now()
   where status in ('initiated', 'pending') and coalesce(expires_at, created_at + interval '2 hours') < now();
end;
$$;

-- =====================================================================
-- 13. Résumé financier du vendeur (calculé côté serveur, sa boutique seule)
-- =====================================================================
create or replace function public.seller_finance_summary()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_shop uuid;
begin
  select s.id into v_shop from public.shops s where s.owner_id = (select auth.uid()) limit 1;
  if v_shop is null then raise exception 'Boutique introuvable.' using errcode = 'P0001'; end if;
  return (
    select jsonb_build_object(
      'grossSales', coalesce(sum(st.gross_amount) filter (where st.type = 'sale' and st.status <> 'cancelled'), 0),
      'commissions', coalesce(sum(st.commission_amount) filter (where st.type = 'sale' and st.status <> 'cancelled'), 0),
      'netEarned', coalesce(sum(st.net_amount) filter (where st.type = 'sale' and st.status <> 'cancelled'), 0),
      'pending', coalesce(sum(st.net_amount) filter (where st.type = 'sale' and st.status = 'pending'), 0),
      'available', coalesce(sum(st.net_amount) filter (where st.type = 'sale' and st.status = 'available' and st.payout_id is null), 0),
      'inTransfer', coalesce(sum(st.net_amount) filter (where st.type = 'sale' and st.status = 'available' and st.payout_id is not null), 0),
      'paidOut', coalesce(sum(st.net_amount) filter (where st.type = 'payout' and st.status = 'paid'), 0),
      'cancelledOrRefunded', coalesce(sum(st.net_amount) filter (where st.type in ('sale', 'refund') and st.status = 'cancelled'), 0)
    ) from public.seller_transactions st where st.shop_id = v_shop);
end;
$$;

-- Droits : service d'envoi = clé serveur seulement.
revoke all on function public.payments_create_transaction(uuid, text, uuid), public.payments_set_pending(uuid, text, text, timestamptz),
  public.payments_record_event(text, text, text, text, text, text, integer, boolean), public.payments_mark_event_processed(uuid, text),
  public.payments_confirm(uuid, text, integer), public.payments_fail(uuid, text, text), public.payouts_prepare_due(),
  public.payouts_claim_batch(integer), public.payouts_to_reconcile(integer), public.payouts_record_result(uuid, text, text, text),
  public.payments_record_provider_status(text, text, boolean, boolean, integer, text), public.payments_maintenance()
  from public, anon, authenticated;
grant execute on function public.payments_create_transaction(uuid, text, uuid), public.payments_set_pending(uuid, text, text, timestamptz),
  public.payments_record_event(text, text, text, text, text, text, integer, boolean), public.payments_mark_event_processed(uuid, text),
  public.payments_confirm(uuid, text, integer), public.payments_fail(uuid, text, text), public.payouts_prepare_due(),
  public.payouts_claim_batch(integer), public.payouts_to_reconcile(integer), public.payouts_record_result(uuid, text, text, text),
  public.payments_record_provider_status(text, text, boolean, boolean, integer, text), public.payments_maintenance()
  to service_role;
revoke all on function public.submit_payout_method(text, text, text, boolean), public.admin_review_payout_method(uuid, boolean, text),
  public.admin_confirm_pickup(uuid), public.seller_finance_summary() from public, anon;
grant execute on function public.submit_payout_method(text, text, text, boolean), public.admin_review_payout_method(uuid, boolean, text),
  public.admin_confirm_pickup(uuid), public.seller_finance_summary() to authenticated;
revoke all on function ezial_private.audit(text, text, text, uuid, jsonb), ezial_private.emit_event(text, uuid, text, jsonb),
  ezial_private.refresh_order_shop_eligibility(uuid), ezial_private.refresh_order_eligibility(uuid), ezial_private.order_shop_delivered(uuid)
  from public, anon, authenticated;

-- Tâche planifiée : expiration des paiements abandonnés (les versements,
-- eux, ne sont planifiés qu'à la connexion des API — voir le guide).
select cron.schedule('payments-maintenance', '*/15 * * * *', 'select public.payments_maintenance();');

commit;

-- Vérification : 8 lignes « ok » attendues.
select 'tables paiements et versements' as element,
       case when to_regclass('public.payment_transactions') is not null and to_regclass('public.seller_payouts') is not null
             and to_regclass('public.seller_payout_methods') is not null and to_regclass('public.finance_audit_log') is not null then 'ok' else 'À VÉRIFIER' end as etat
union all
select 'encaissements et versements désactivés',
       case when not (select collections_enabled or payouts_enabled from public.payment_settings) then 'ok' else 'À VÉRIFIER' end
union all
select 'ventes nouvelles « en attente »',
       case when exists (select 1 from pg_trigger where tgname = 'trg_seller_sale_starts_pending') then 'ok' else 'À VÉRIFIER' end
union all
select 'registre vendeur : lecture seule',
       case when not has_table_privilege('authenticated', 'public.seller_transactions', 'UPDATE') then 'ok' else 'À VÉRIFIER' end
union all
select 'fonctions financières : clé serveur seulement',
       case when not has_function_privilege('authenticated', 'public.payments_confirm(uuid, text, integer)', 'execute')
             and not has_function_privilege('authenticated', 'public.payouts_record_result(uuid, text, text, text)', 'execute') then 'ok' else 'À VÉRIFIER' end
union all
select 'livraison confirmée par le serveur',
       case when has_function_privilege('authenticated', 'public.driver_complete_delivery(uuid, text, text)', 'execute') then 'ok' else 'À VÉRIFIER' end
union all
select 'déclencheurs comptables',
       case when (select count(*) from pg_trigger where tgname in ('trg_finance_order_shop_status', 'trg_finance_order_status', 'trg_finance_mission_status', 'trg_finance_claim', 'trg_events_order_created')) = 5 then 'ok' else 'À VÉRIFIER' end
union all
select 'tâche planifiée paiements',
       case when exists (select 1 from cron.job where jobname = 'payments-maintenance' and active) then 'ok' else 'À VÉRIFIER' end;
