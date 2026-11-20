-- Données de test FICTIVES (aucune donnée de production) et aides de scénario.
insert into auth.users (id) values
  ('00000000-0000-4000-8000-0000000000c1'), ('00000000-0000-4000-8000-0000000000c2'),
  ('00000000-0000-4000-8000-0000000000d1'), ('00000000-0000-4000-8000-0000000000d2'),
  ('00000000-0000-4000-8000-0000000000a1'),
  ('fb97d8f8-7551-462e-8f40-23ea3bd407be');   -- identifiant du compte testeur inscrit par la migration 5
insert into public.profiles (id, role) values
  ('00000000-0000-4000-8000-0000000000c1', 'customer'), ('00000000-0000-4000-8000-0000000000c2', 'customer'),
  ('00000000-0000-4000-8000-0000000000d1', 'seller'), ('00000000-0000-4000-8000-0000000000d2', 'seller'),
  ('00000000-0000-4000-8000-0000000000a1', 'admin');
insert into public.admins (user_id) values ('00000000-0000-4000-8000-0000000000a1');
insert into public.shops (id, owner_id, name, latitude, longitude) values
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000d1', 'Boutique Un', 14.70, -17.45),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000d2', 'Boutique Deux', 14.72, -17.47);
insert into public.seller_subscriptions (shop_id, plan, pro_until) values
  ('00000000-0000-4000-8000-0000000000b2', 'pro', now() + interval '100 days');   -- Ezial Plus : 8 % ; Boutique Un : Free, 10 %
insert into public.products (id, shop_id, name, reference, base_price) values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000b1', 'Robe test', 'T-1', 10000),
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000b2', 'Sac test', 'T-2', 20000);
insert into public.product_variants (id, product_id, stock) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000e1', 10),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000e2', 10);

create table tests.ctx (k text primary key, v jsonb);
grant select on tests.ctx to anon, authenticated, service_role;
create function tests.total(p uuid) returns integer language sql as $$ select total_amount from public.orders where id = p $$;

-- Remet la base de scénario à zéro (stock à 10, aucune commande, réglages par défaut).
create function tests.reset() returns void language plpgsql as $$
begin
  perform tests.as_system();
  truncate public.orders cascade;
  truncate public.notifications, public.admin_notifications, public.ezial_events, public.whatsapp_queue, public.finance_audit_log,
           public.security_events, public.payment_events, public.seller_transactions, public.delivery_missions, public.delivery_stops;
  if to_regclass('public.payment_anomalies') is not null then execute 'truncate public.payment_anomalies'; end if;
  if to_regclass('public.payment_testers') is not null then execute 'delete from public.payment_testers'; end if;
  update public.product_variants set stock = 10;
  update public.payment_settings set collections_enabled = false, payouts_enabled = false;
  if exists (select 1 from information_schema.columns where table_name = 'payment_settings' and column_name = 'orange_money_enabled') then
    execute 'update public.payment_settings set orange_money_enabled = false, payment_window_minutes = 30, payment_grace_minutes = 15';
  end if;
  update public.whatsapp_settings set confirmation_requires_paid = false;
  delete from tests.ctx;
end $$;

create function tests.put(p_k text, p_v jsonb) returns void language sql as
$$ insert into tests.ctx values (p_k, p_v) on conflict (k) do update set v = excluded.v $$;
create function tests.get(p_k text) returns jsonb language sql as $$ select v from tests.ctx where k = p_k $$;
create function tests.getid(p_k text) returns uuid language sql as $$ select (v #>> '{}')::uuid from tests.ctx where k = p_k $$;

-- Paniers : une boutique (Robe, 10 000) ou deux boutiques (Robe + Sac, 10 000 + 20 000)
create function tests.cart(p_two_shops boolean default false, p_qty numeric default 1) returns jsonb language sql as $$
  select jsonb_build_object('firstName', 'Awa', 'lastName', 'Test', 'phone', '+221771234567', 'latitude', 14.69, 'longitude', -17.44,
    'items', case when p_two_shops
      then jsonb_build_array(jsonb_build_object('productId', '00000000-0000-4000-8000-0000000000e1', 'variantId', '00000000-0000-4000-8000-0000000000f1', 'quantity', p_qty),
                             jsonb_build_object('productId', '00000000-0000-4000-8000-0000000000e2', 'variantId', '00000000-0000-4000-8000-0000000000f2', 'quantity', p_qty))
      else jsonb_build_array(jsonb_build_object('productId', '00000000-0000-4000-8000-0000000000e1', 'variantId', '00000000-0000-4000-8000-0000000000f1', 'quantity', p_qty)) end)
$$;

-- Commande passée par le client C1, comme depuis le site ; renvoie l'identifiant de la commande
create function tests.place(p_method text, p_two_shops boolean default false, p_qty numeric default 1) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  perform tests.as_user('00000000-0000-4000-8000-0000000000c1');
  select (public.create_order(tests.cart(p_two_shops, p_qty) || jsonb_build_object('paymentMethod', p_method))->'order'->>'id')::uuid into v_id;
  perform tests.as_system();
  return v_id;
end $$;

-- Achat concurrent : « ok » ou « ko » (stock insuffisant)
create function tests.try_buy(p_qty numeric) returns text language plpgsql as $$
begin
  perform tests.place('wave', false, p_qty);
  return 'ok';
exception when others then
  return 'ko';
end $$;

-- Photographie de ce qu'une commande a déclenché
create function tests.summary(p_order uuid) returns jsonb language sql as $$
  select jsonb_build_object(
    'seller_notifs', (select count(*) from public.notifications where order_id = p_order and type = 'seller_new_order'),
    'customer_confirmed', (select count(*) from public.notifications where order_id = p_order and type = 'order_confirmed'),
    'customer_cancelled', (select count(*) from public.notifications where order_id = p_order and type = 'order_cancelled'),
    'seller_cancelled', (select count(*) from public.notifications where order_id = p_order and type = 'seller_order_cancelled'),
    'admin_notifs', (select count(*) from public.admin_notifications where order_id = p_order),
    'events_order_confirmed', (select count(*) from public.ezial_events where event_type = 'order.confirmed' and entity_id = p_order),
    'events_seller_created', (select count(*) from public.ezial_events e join public.order_shops s on s.id = e.entity_id where e.event_type = 'seller_order.created' and s.order_id = p_order),
    'whatsapp', (select count(*) from public.whatsapp_queue where order_id = p_order),
    'sales', (select count(*) from public.seller_transactions where order_id = p_order),
    'sales_net', (select coalesce(sum(net_amount), 0) from public.seller_transactions where order_id = p_order),
    'sales_commission', (select coalesce(sum(commission_amount), 0) from public.seller_transactions where order_id = p_order),
    'sales_gross', (select coalesce(sum(gross_amount), 0) from public.seller_transactions where order_id = p_order))
$$;
create function tests.stock() returns numeric language sql as $$ select sum(stock) from public.product_variants $$;
