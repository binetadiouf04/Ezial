-- Aides de scénario (après migration). Données FICTIVES.
create function tests.reset_abo() returns void language plpgsql as $$
begin
  perform tests.as_system();
  delete from public.payment_anomalies where subscription_attempt_id is not null;
  delete from public.subscription_payments;
  delete from public.subscription_payment_attempts;
  delete from public.premium_grants;
  delete from public.seller_subscriptions where shop_id not in ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b2');
  delete from public.shops where name like 'Abo %';
  truncate public.notifications, public.admin_notifications, public.ezial_events, public.finance_audit_log, public.payment_events;
  delete from public.payment_testers;
  update public.payment_settings set orange_money_enabled = true, collections_enabled = false;
end $$;

-- Nouvelle boutique de test (propriétaire d1 par défaut), sans abonnement.
create function tests.mkshop(p_owner uuid default '00000000-0000-4000-8000-0000000000d1') returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.shops (owner_id, name) values (p_owner, 'Abo ' || substr(gen_random_uuid()::text, 1, 6)) returning id into v;
  return v;
end $$;

-- Tentative créée comme le fait payment-initiate (service), QR enregistré (valable 30 min).
create function tests.attempt(p_shop uuid, p_period text default 'quarterly', p_pending boolean default true) returns uuid language plpgsql as $$
declare v_owner uuid; v_id uuid;
begin
  select owner_id into v_owner from public.shops where id = p_shop;
  v_id := (public.subscription_payments_create_attempt(p_shop, p_period, 'orange_money', v_owner)).id;
  if p_pending then perform public.subscription_payments_set_pending(v_id, v_id::text, null, now() + interval '30 minutes'); end if;
  return v_id;
end $$;

create function tests.verify(p_attempt uuid, p_status text, p_amount integer default null, p_txid text default null) returns text language sql as
$$ select public.subscription_payments_record_verification(p_attempt, p_status, p_amount, p_txid) $$;

create function tests.sub(p_shop uuid) returns public.seller_subscriptions language sql as $$ select * from public.seller_subscriptions where shop_id = p_shop $$;
create function tests.n_payments(p_shop uuid) returns integer language sql as $$ select count(*)::int from public.subscription_payments where shop_id = p_shop $$;
create function tests.n_notif(p_shop uuid, p_type text) returns integer language sql security definer as $$ select count(*)::int from public.notifications where shop_id = p_shop and type = p_type $$;
create function tests.n_admin(p_shop uuid, p_type text) returns integer language sql security definer as $$ select count(*)::int from public.admin_notifications where shop_id = p_shop and type = p_type $$;
-- « presque égal » à une date (± 5 s)
create function tests.near(a timestamptz, b timestamptz) returns boolean language sql as $$ select abs(extract(epoch from a - b)) < 5 $$;
-- Erreur attendue : renvoie le message d'exception de la requête, ou 'aucune erreur'.
create function tests.err(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'aucune erreur'; exception when others then return sqlerrm; end $$;
-- Lecture de la table des tentatives depuis un test qui s'exécute sous un rôle restreint (admin, vendeur).
create function tests.astatus(p uuid) returns text language sql security definer as $$ select status from public.subscription_payment_attempts where id = p $$;
create function tests.anote(p uuid) returns text language sql security definer as $$ select admin_note from public.subscription_payment_attempts where id = p $$;
