-- Banc « Campagnes promotionnelles » : compléments au banc orange-money (schéma simplifié + fixtures).
-- Chargé AVANT 10-production.sql. Données FICTIVES uniquement (aucune donnée de production).

-- Supabase : jeton (niveau de double authentification) et facteurs MFA, simulés.
create or replace function auth.jwt() returns jsonb language sql stable as
$$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create table if not exists auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid, status text);

-- La copie simplifiée du banc orange-money a d'autres noms de paramètres : remplacée par la version de production (10-production.sql).
drop function public.validate_promo_code(text, integer);

-- Tables de production absentes du banc orange-money (colonnes identiques à la production).
create table public.promo_codes (
  id uuid primary key default gen_random_uuid(), code text not null, discount_type text not null, discount_value numeric not null,
  min_order_amount integer, start_date timestamptz, end_date timestamptz, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
alter table public.promo_codes enable row level security;
create policy promo_codes_admin_all on public.promo_codes for all using (exists (select 1 from public.admins where admins.user_id = auth.uid()));
-- Copie FICTIVE de la seule ligne de production (mêmes valeurs que EZI10 : 10 %, fin 31/12/2026, désactivé).
insert into public.promo_codes (code, discount_type, discount_value, min_order_amount, start_date, end_date, is_active, created_at)
values ('EZI10', 'percent', 10, null, null, '2026-12-31 00:00:00+00', false, '2026-09-24 02:45:34+00');

create table public.delivery_pricing_settings (
  id boolean primary key default true, price_per_km numeric not null default 100, minimum_fee numeric not null default 800,
  maximum_fee numeric not null default 4000, updated_at timestamptz not null default now());
insert into public.delivery_pricing_settings (id) values (true);

create table public.seller_payout_methods (
  id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.shops(id), provider text not null check (provider in ('wave', 'orange_money')),
  phone text not null, holder_name text, extra jsonb not null default '{}', status text not null default 'pending_review'
  check (status in ('pending_review', 'approved', 'rejected', 'superseded')), consent_given_at timestamptz not null default now(),
  submitted_by uuid not null, submitted_at timestamptz not null default now(), reviewed_by uuid, reviewed_at timestamptz, review_note text);

alter table public.admins enable row level security;
create policy admins_can_read_own_row on public.admins for select to authenticated using (user_id = auth.uid());
alter table public.shops enable row level security;
create policy shops_read_all on public.shops for select using (true);

-- Fixtures supplémentaires : boutique officielle (0 %), produits catégorisés, promotion produit, clients.
insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000d3'), ('00000000-0000-4000-8000-0000000000c3'), ('00000000-0000-4000-8000-0000000000c4');
insert into public.profiles (id, role) values ('00000000-0000-4000-8000-0000000000d3', 'seller'),
  ('00000000-0000-4000-8000-0000000000c3', 'customer'), ('00000000-0000-4000-8000-0000000000c4', 'customer');
insert into public.shops (id, owner_id, name, latitude, longitude, is_official) values
  ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-0000000000d3', 'Boutique officielle test', 14.71, -17.46, true);
update public.shops set pickup_enabled = true where id = '00000000-0000-4000-8000-0000000000b2';
update public.products set category = 'mode-femme', subcategory = 'robes' where id = '00000000-0000-4000-8000-0000000000e1';
update public.products set category = 'sacs', subcategory = 'sacs-a-main' where id = '00000000-0000-4000-8000-0000000000e2';
insert into public.products (id, shop_id, name, reference, base_price, category, subcategory, is_promo, promo_price) values
  ('00000000-0000-4000-8000-0000000000e3', '00000000-0000-4000-8000-0000000000b3', 'Collier test', 'T-3', 15000, 'bijoux', 'colliers', false, null),
  ('00000000-0000-4000-8000-0000000000e4', '00000000-0000-4000-8000-0000000000b1', 'Jupe test (promo produit)', 'T-4', 8000, 'mode-femme', 'jupes', true, 6000),
  ('00000000-0000-4000-8000-0000000000e5', '00000000-0000-4000-8000-0000000000b3', 'Parfum test', 'T-5', 3333, 'beaute', 'parfums', false, null);
insert into public.product_variants (id, product_id, stock) values
  ('00000000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-0000000000e3', 10),
  ('00000000-0000-4000-8000-0000000000f4', '00000000-0000-4000-8000-0000000000e4', 10),
  ('00000000-0000-4000-8000-0000000000f5', '00000000-0000-4000-8000-0000000000e5', 10);
-- 12 clients pour les commandes simultanées
insert into auth.users (id) select ('00000000-0000-4000-8000-0000000001' || lpad(i::text, 2, '0'))::uuid from generate_series(1, 12) i;
insert into public.profiles (id, role) select ('00000000-0000-4000-8000-0000000001' || lpad(i::text, 2, '0'))::uuid, 'customer' from generate_series(1, 12) i;

-- Aides de scénario
create function tests.uid(p text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-0000000000' || p)::uuid $$;
create function tests.it(p text, p_qty numeric default 1) returns jsonb language sql as
$$ select jsonb_build_object('productId', tests.uid('e' || p), 'variantId', tests.uid('f' || p), 'quantity', p_qty, 'selectedOptions', '{}'::jsonb) $$;
-- Commande via create_order, comme depuis le site ; renvoie la ligne « order » (jsonb)
create function tests.buy(p_user uuid, p_items jsonb, p_extra jsonb default '{}', p_method text default 'wave') returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform tests.as_user(p_user);
  r := public.create_order(jsonb_build_object('firstName', 'Awa', 'lastName', 'Test', 'phone', '+221771234567', 'latitude', 14.69,
         'longitude', -17.44, 'neighborhood', 'Plateau', 'paymentMethod', p_method, 'items', p_items) || p_extra);
  perform tests.as_system();
  return r->'order';
end $$;
-- Même chose, mais renvoie « ok » ou le message d'erreur (sans interrompre le test)
create function tests.try_buy_msg(p_user uuid, p_items jsonb, p_extra jsonb default '{}', p_method text default 'wave') returns text language plpgsql as $$
begin
  perform tests.buy(p_user, p_items, p_extra, p_method);
  return 'ok';
exception when others then
  perform tests.as_system();
  return sqlerrm;
end $$;
-- Utilisateur connecté avec un niveau de double authentification donné
create function tests.as_user_aal(p_uid uuid, p_aal text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'aal', p_aal)::text, true);
  perform tests.as_user(p_uid);
end $$;
-- Photographie complète et comparable d'une commande (sans identifiants ni horodatages)
create function tests.snap(p_order uuid) returns jsonb language sql as $$
  select jsonb_build_object(
    'order', (select jsonb_build_object('status', status, 'payment_status', payment_status, 'products_subtotal', products_subtotal,
        'delivery_fee', delivery_fee, 'discount_amount', discount_amount, 'total_amount', total_amount, 'promo_code', promo_code,
        'payment_required', payment_required, 'fulfillment_type', fulfillment_type, 'gift_wrap_fee', gift_wrap_fee) from public.orders where id = p_order),
    'shops', (select jsonb_agg(jsonb_build_object('shop', shop_id, 'subtotal', subtotal, 'commission', commission_amount, 'net', net_amount,
        'status', status, 'fulfillment', fulfillment_type) order by shop_id) from public.order_shops where order_id = p_order),
    'items', (select jsonb_agg(jsonb_build_object('product', product_id, 'qty', quantity, 'orig', original_unit_price, 'unit', unit_price,
        'disc', discount_amount, 'line', line_total, 'rate', commission_rate, 'comm', commission_amount) order by product_id) from public.order_items where order_id = p_order),
    'sales', (select coalesce(jsonb_agg(jsonb_build_object('shop', shop_id, 'gross', gross_amount, 'commission', commission_amount, 'net', net_amount,
        'status', status, 'has_order_shop', order_shop_id is not null) order by shop_id), '[]'::jsonb) from public.seller_transactions where order_id = p_order))
$$;
-- Scénario de référence SANS promotion : mêmes paniers avant et après les migrations (non-régression)
create function tests.reference_scenario() returns jsonb language plpgsql as $$
declare res jsonb := '{}'; o jsonb; t public.payment_transactions;
begin
  perform tests.reset();
  o := tests.buy(tests.uid('c1'), jsonb_build_array(tests.it('1')));
  res := res || jsonb_build_object('wave_1_boutique', tests.snap((o->>'id')::uuid));
  o := tests.buy(tests.uid('c1'), jsonb_build_array(tests.it('1', 2), tests.it('2'), tests.it('3'), tests.it('4', 3)), '{"giftWrap": true, "isGift": true, "giftRecipientName": "Fatou", "giftRecipientPhone": "+221770000000"}');
  res := res || jsonb_build_object('wave_3_boutiques_cadeau', tests.snap((o->>'id')::uuid));
  o := tests.buy(tests.uid('c2'), jsonb_build_array(tests.it('2'), tests.it('5')), jsonb_build_object('shopFulfillments', jsonb_build_object(tests.uid('b2'), jsonb_build_object('type', 'pickup'))));
  res := res || jsonb_build_object('retrait_et_livraison', tests.snap((o->>'id')::uuid));
  o := tests.buy(tests.uid('c2'), jsonb_build_array(tests.it('2')), jsonb_build_object('shopFulfillments', jsonb_build_object(tests.uid('b2'), jsonb_build_object('type', 'pickup'))));
  res := res || jsonb_build_object('retrait_seul', tests.snap((o->>'id')::uuid));
  -- Orange Money : commande à payer, puis paiement confirmé
  update public.payment_settings set orange_money_enabled = true;
  o := tests.buy(tests.uid('c1'), jsonb_build_array(tests.it('1'), tests.it('3')), '{}', 'orange_money');
  res := res || jsonb_build_object('orange_a_payer', tests.snap((o->>'id')::uuid));
  t := public.payments_create_transaction((o->>'id')::uuid, 'orange_money', tests.uid('c1'));
  perform public.payments_record_verification(t.id, 'confirmed', (o->>'total_amount')::integer, 'MPREF');
  res := res || jsonb_build_object('orange_payee', tests.snap((o->>'id')::uuid));
  -- Orange Money impayée puis annulée automatiquement
  o := tests.buy(tests.uid('c2'), jsonb_build_array(tests.it('1')), '{}', 'orange_money');
  update public.orders set payment_deadline = now() - interval '1 hour', payment_grace_until = now() - interval '5 minutes' where id = (o->>'id')::uuid;
  perform ezial_private.orders_finalize_unpaid();
  res := res || jsonb_build_object('orange_impayee', tests.snap((o->>'id')::uuid), 'stock', tests.stock());
  -- Ancien code EZI10 (désactivé) : refusé avec le même message
  res := res || jsonb_build_object('code_inconnu', tests.try_buy_msg(tests.uid('c1'), jsonb_build_array(tests.it('1')), '{"promoCode": "NEXISTEPAS"}'));
  return res;
end $$;

-- ───── Aides propres aux campagnes (résolues à l'exécution : utilisables une fois la migration 1 appliquée) ─────
set check_function_bodies = off;
-- Remise à zéro : commandes, utilisations, compensations, campagnes de test (EZI10 repris est conservé, suspendu)
create function tests.reset_promo() returns void language plpgsql as $$
begin
  perform tests.reset();
  delete from public.promotion_targets where promotion_id in (select id from public.promotions where code is distinct from 'EZI10');
  delete from public.promotion_seller_shares where promotion_id in (select id from public.promotions where code is distinct from 'EZI10');
  delete from public.promotions where code is distinct from 'EZI10';
  update public.promotions set status = 'paused', uses_count = 0, budget_used = 0 where code = 'EZI10';
  delete from auth.mfa_factors;
  perform set_config('request.jwt.claims', '', false);
end $$;
-- Campagne active (début il y a 1 h, fin dans 10 jours, sans limite par client sauf indication) ; p_code null = automatique
create function tests.new_promo(p_code text, p_kind text, p_value numeric, p_extra jsonb default '{}') returns uuid language plpgsql as $$
declare v_id uuid := gen_random_uuid();
begin
  insert into public.promotions
  select (jsonb_populate_record(null::public.promotions, jsonb_build_object('id', v_id, 'name', coalesce(p_code, 'Automatique ' || p_kind), 'code', p_code,
           'kind', p_kind, 'value', p_value, 'min_amount', 0, 'starts_at', now() - interval '1 hour', 'ends_at', now() + interval '10 days',
           'status', 'active', 'audience', 'all', 'max_uses_per_customer', null, 'uses_count', 0, 'budget_used', 0,
           'created_at', now(), 'updated_at', now()) || p_extra)).*;
  return v_id;
end $$;
create function tests.target(p_promo uuid, p_type text, p_ref text) returns void language sql as
$$ insert into public.promotion_targets values (p_promo, p_type, p_ref) $$;
create function tests.share(p_promo uuid, p_shop text, p_type text, p_value numeric) returns void language sql as
$$ insert into public.promotion_seller_shares (promotion_id, shop_id, share_type, share_value, agreed) values (p_promo, tests.uid('b' || p_shop), p_type, p_value, true) $$;
create function tests.promo(p_code text) returns jsonb language sql as $$ select to_jsonb(p) from public.promotions p where code = p_code $$;
-- Commande avec code ; renvoie la ligne « order »
create function tests.buy_code(p_user uuid, p_items jsonb, p_code text, p_extra jsonb default '{}', p_method text default 'wave') returns jsonb language sql as
$$ select tests.buy(p_user, p_items, jsonb_build_object('promoCode', p_code) || p_extra, p_method) $$;
create function tests.pickup(p_shop text) returns jsonb language sql as
$$ select jsonb_build_object('shopFulfillments', jsonb_build_object(tests.uid('b' || p_shop), jsonb_build_object('type', 'pickup'))) $$;
-- Formule du contrat vérifiée sur une commande
create function tests.total_ok(p_order uuid) returns boolean language sql as $$
  select o.total_amount = (o.products_subtotal - (o.discount_amount - o.promo_discount) - o.promo_discount) + o.delivery_fee - o.delivery_discount + o.gift_wrap_fee
     and o.discount_amount - o.promo_discount = (select coalesce(sum(oi.discount_amount), 0) from public.order_items oi where oi.order_id = o.id)
    from public.orders o where o.id = p_order $$;
-- Compensation reversée par Ezial (A − V) à une boutique pour une commande
create function tests.comp(p_order uuid, p_shop text) returns integer language sql as
$$ select amount from public.promotion_compensations where order_id = p_order and shop_id = tests.uid('b' || p_shop) $$;
create function tests.sale(p_order uuid, p_shop text) returns jsonb language sql as
$$ select jsonb_build_object('gross', gross_amount, 'commission', commission_amount, 'net', net_amount) from public.seller_transactions
    where order_id = p_order and shop_id = tests.uid('b' || p_shop) and type = 'sale' $$;
