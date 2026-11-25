-- Définitions EXACTES de la PRODUCTION (lues en lecture seule le 21 nov. 2026, projet lkqezdrdbogtborgjvlw ;
-- create_order relue de nouveau le 25 nov. 2026 : version AVEC la livraison urgente, migration
-- docs/sql/lancement-livraison-urgente.sql exécutée en production, empreinte 10178f6554882cf5390eb6f0a7a13381),
-- fins de ligne ramenées à LF (la production stocke des CRLF : seule différence, contrôlée par empreinte md5
-- calculée sans les « \r » dans tests/10-etat-production.sql).
-- Chargées APRÈS le banc orange-money (schéma simplifié + migrations Orange Money 1 à 6) et la migration
-- lancement-livraison-urgente.sql (= état de production), elles remplacent les copies du banc par le texte réel.
-- Les trois blocs « @@ restaure » sont recopiés tels quels dans docs/sql/promotions-2-retour-arriere.sql
-- par build-rollback.sh.

-- @@ restaure : debut
CREATE OR REPLACE FUNCTION public.create_order(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
v_order public.orders;
v_item jsonb;
v_product record;
v_variant record;
v_variant_id uuid;
v_qty numeric;
v_original_unit_price numeric;
v_unit_price numeric;
v_item_discount numeric;
v_line_total numeric;
v_products_subtotal numeric := 0;
v_discount_total numeric := 0;
v_image text;
v_promo_active boolean;
v_commission_rate numeric;
v_item_commission numeric;
v_shop_is_premium boolean;
v_waist numeric;

v_client_lat numeric;
v_client_lng numeric;
v_needs_delivery boolean := false;
v_delivery_fee numeric := 0;
v_distance_km numeric := 0;
v_route_distance_quote numeric;
v_route_counter integer := 0;
v_route_shop record;
v_prev_lat numeric;
v_prev_lng numeric;
v_delivery_code text;

v_shop_key text;
v_shop_fulfillment jsonb;
v_shop_id uuid;
v_order_shop_id uuid;
v_order_shop_ids jsonb := '{}'::jsonb;
v_shop_subtotals jsonb := '{}'::jsonb;
v_shop_commissions jsonb := '{}'::jsonb;
v_requested_fulfillment text;

v_order_number text;
v_payment_method text;
v_gift_wrap_fee numeric := 0;

v_promo_code text;
v_promo_result jsonb;
v_promo_discount numeric := 0;
v_urgent_fee integer := 0; -- livraison urgente

v_shops_out jsonb := '[]'::jsonb;
v_items_out jsonb := '[]'::jsonb;
begin

if coalesce(trim(payload->>'firstName'), '') = ''
or coalesce(trim(payload->>'lastName'), '') = ''
or coalesce(trim(payload->>'phone'), '') = '' then
raise exception 'Coordonnées client incomplètes.';
end if;

if jsonb_typeof(coalesce(payload->'items', '[]'::jsonb)) <> 'array' then
raise exception 'Format du panier invalide.';
end if;

if jsonb_array_length(coalesce(payload->'items', '[]'::jsonb)) = 0 then
raise exception 'Le panier est vide.';
end if;

v_payment_method := payload->>'paymentMethod';

if v_payment_method is null
or v_payment_method not in ('wave', 'orange_money', 'paypal') then
raise exception 'Mode de paiement invalide.';
end if;

if coalesce((payload->>'isGift')::boolean, false) then
  if coalesce(trim(payload->>'giftRecipientName'), '') = ''
  or coalesce(trim(payload->>'giftRecipientPhone'), '') = '' then
    raise exception 'Informations du destinataire incomplètes.';
  end if;
end if;

v_gift_wrap_fee := case when coalesce((payload->>'giftWrap')::boolean, false) then 2000 else 0 end;

select exists (
select 1
from jsonb_array_elements(payload->'items') it
join public.products p
on p.id = (it->>'productId')::uuid
where coalesce(
(payload->'shopFulfillments'->(p.shop_id::text))->>'type',
'delivery'
) = 'delivery'
)
into v_needs_delivery;

if v_needs_delivery then
v_client_lat := nullif(payload->>'latitude', '')::numeric;
v_client_lng := nullif(payload->>'longitude', '')::numeric;

if v_client_lat is null or v_client_lng is null then
raise exception 'Coordonnées de livraison manquantes.';
end if;

if v_client_lat < -90 or v_client_lat > 90 then
raise exception 'Latitude de livraison invalide.';
end if;

if v_client_lng < -180 or v_client_lng > 180 then
raise exception 'Longitude de livraison invalide.';
end if;

v_delivery_code := lpad(floor(random() * 9000 + 1000)::text, 4, '0');
end if;

v_order_number :=
'EZI-' ||
to_char(clock_timestamp(), 'YYMMDD') ||
'-' ||
lpad(nextval('public.order_number_seq')::text, 6, '0');

insert into public.orders (
order_number,
customer_id,
first_name,
last_name,
phone,
email,
neighborhood,
delivery_address,
delivery_notes,
delivery_latitude,
delivery_longitude,
delivery_code,
preferred_delivery_date,
preferred_delivery_slot,
payment_method,
fulfillment_type,
delivery_fee,
products_subtotal,
discount_amount,
total_amount,
is_gift,
gift_recipient_name,
gift_recipient_phone,
gift_show_buyer_name,
gift_message,
gift_wrap,
gift_wrap_fee
)
values (
v_order_number,
auth.uid(),
trim(payload->>'firstName'),
trim(payload->>'lastName'),
trim(payload->>'phone'),
nullif(trim(payload->>'email'), ''),
nullif(trim(payload->>'neighborhood'), ''),
nullif(trim(payload->>'deliveryAddress'), ''),
nullif(trim(payload->>'deliveryNotes'), ''),
v_client_lat,
v_client_lng,
v_delivery_code,
nullif(payload->>'preferredDeliveryDate', '')::date,
nullif(payload->>'preferredDeliverySlot', ''),
v_payment_method,
case when v_needs_delivery then 'delivery' else 'pickup' end,
0,
0,
0,
0,
coalesce((payload->>'isGift')::boolean, false),
nullif(trim(payload->>'giftRecipientName'), ''),
nullif(trim(payload->>'giftRecipientPhone'), ''),
coalesce((payload->>'giftShowBuyerName')::boolean, false),
nullif(trim(payload->>'giftMessage'), ''),
coalesce((payload->>'giftWrap')::boolean, false),
v_gift_wrap_fee
)
returning *
into v_order;

for v_item in
select *
from jsonb_array_elements(payload->'items')
loop

v_qty := nullif(v_item->>'quantity', '')::numeric;

if v_qty is null or v_qty <= 0 then
raise exception 'Quantité invalide.';
end if;

select
p.id,
p.shop_id,
p.name,
p.reference,
p.status,
p.base_price,
p.is_promo,
p.promo_price,
p.promo_start,
p.promo_end,
p.sale_mode,
p.category,
p.subcategory,
s.status as shop_status,
s.pickup_enabled
into v_product
from public.products p
join public.shops s
on s.id = p.shop_id
where p.id = (v_item->>'productId')::uuid
for share of p;

if v_product.id is null then
raise exception 'Produit introuvable.';
end if;

if v_product.status <> 'active' then
raise exception 'Produit indisponible : %.', v_product.name;
end if;

if v_product.shop_status <> 'active' then
raise exception 'Boutique indisponible pour "%".', v_product.name;
end if;

-- Tissus (vente au mètre/kilogramme/pièce) — la seule catégorie où la
-- quantité n'est pas simplement "un entier positif". Chaque borne est
-- revérifiée ici côté serveur (jamais une confiance aveugle dans le
-- sélecteur +/- du navigateur) ; tout produit sans sale_mode (toutes les
-- autres catégories) saute entièrement ce bloc, donc rien ne change pour
-- elles.
if v_product.sale_mode in ('metre', 'kilogramme') then
if v_qty < 0.5 or v_qty > 10 or (v_qty * 2) <> trunc(v_qty * 2) then
raise exception 'Quantité invalide pour "%" (entre 0,5 et 10, par pas de 0,5).', v_product.name;
end if;
elsif v_product.sale_mode = 'piece' then
if v_qty < 1 or v_qty > 10 or v_qty <> trunc(v_qty) then
raise exception 'Quantité invalide pour "%" (entre 1 et 10 pièces).', v_product.name;
end if;
end if;

v_waist := null;

if v_product.category = 'bijoux' and v_product.subcategory = 'baya' then
begin
v_waist := nullif(trim(v_item->>'waistCm'), '')::numeric;
exception when others then
v_waist := null;
end;

if v_waist is null
or v_waist < 40
or v_waist > 200
or v_waist <> round(v_waist, 1) then
raise exception 'Tour de taille invalide pour "%" (entre 40 et 200 cm).', v_product.name;
end if;
end if;

v_variant_id := nullif(v_item->>'variantId', '')::uuid;

if v_variant_id is not null then
select id, price, stock, attributes
into v_variant
from public.product_variants
where id = v_variant_id
and product_id = v_product.id
for update;
else
select id, price, stock, attributes
into v_variant
from public.product_variants
where product_id = v_product.id
and attributes = coalesce(v_item->'selectedOptions', '{}'::jsonb)
for update;
end if;

if v_variant.id is null then
raise exception 'Variante introuvable pour "%".', v_product.name;
end if;

if v_variant.stock < v_qty then
raise exception 'Stock insuffisant pour "%".', v_product.name;
end if;

v_original_unit_price := coalesce(v_variant.price, v_product.base_price);

v_promo_active :=
coalesce(v_product.is_promo, false)
and (v_product.promo_start is null or now() >= v_product.promo_start)
and (v_product.promo_end is null or now() <= v_product.promo_end)
and v_product.promo_price is not null
and v_product.base_price > 0;

if v_promo_active then
v_unit_price := round(
v_original_unit_price *
(v_product.promo_price::numeric / v_product.base_price::numeric)
);
else
v_unit_price := v_original_unit_price;
end if;

v_item_discount := greatest(0, v_original_unit_price - v_unit_price);
v_line_total := v_unit_price * v_qty;

-- Commission selon le forfait de la boutique au moment de la vente
-- (10% Free, 8% Premium — essai ou payant), plus aucune exception liée
-- à une promotion : l'ancienne règle à 5% est définitivement supprimée.
select (plan = 'pro' and pro_until is not null and pro_until > now())
into v_shop_is_premium
from public.seller_subscriptions where shop_id = v_product.shop_id;

v_commission_rate := case when exists (select 1 from public.shops so where so.id = v_product.shop_id and coalesce(so.is_official, false)) then 0 when coalesce(v_shop_is_premium, false) then 0.08 else 0.10 end;
v_item_commission := round(v_line_total * v_commission_rate);

v_products_subtotal :=
v_products_subtotal + (v_original_unit_price * v_qty);

v_discount_total :=
v_discount_total + (v_item_discount * v_qty);

v_shop_id := v_product.shop_id;
v_shop_key := v_shop_id::text;

if v_order_shop_ids ? v_shop_key then
v_order_shop_id := (v_order_shop_ids->>v_shop_key)::uuid;
else
v_shop_fulfillment := coalesce(
payload->'shopFulfillments'->v_shop_key,
'{}'::jsonb
);

v_requested_fulfillment := coalesce(
v_shop_fulfillment->>'type',
'delivery'
);

if v_requested_fulfillment not in ('delivery', 'pickup') then
raise exception 'Mode de réception invalide.';
end if;

if v_requested_fulfillment = 'pickup'
and not coalesce(v_product.pickup_enabled, false) then
raise exception 'Le retrait en boutique n''est pas disponible pour "%".', v_product.name;
end if;

v_route_counter := v_route_counter + 1;

insert into public.order_shops (
order_id,
shop_id,
fulfillment_type,
status,
route_sequence,
pickup_code,
scheduled_date,
scheduled_window
)
values (
v_order.id,
v_shop_id,
v_requested_fulfillment,
'preparing',
v_route_counter,
case
when v_requested_fulfillment = 'pickup'
then lpad(floor(random() * 9000 + 1000)::text, 4, '0')
else null
end,
nullif(v_shop_fulfillment->>'date', '')::date,
nullif(v_shop_fulfillment->>'window', '')
)
returning id
into v_order_shop_id;

v_order_shop_ids :=
v_order_shop_ids ||
jsonb_build_object(v_shop_key, v_order_shop_id::text);

v_shop_subtotals :=
v_shop_subtotals ||
jsonb_build_object(v_shop_key, 0);

v_shop_commissions :=
v_shop_commissions ||
jsonb_build_object(v_shop_key, 0);
end if;

v_shop_subtotals :=
v_shop_subtotals ||
jsonb_build_object(
v_shop_key,
coalesce((v_shop_subtotals->>v_shop_key)::numeric, 0) + v_line_total
);

v_shop_commissions :=
v_shop_commissions ||
jsonb_build_object(
v_shop_key,
coalesce((v_shop_commissions->>v_shop_key)::numeric, 0) + v_item_commission
);

select storage_path
into v_image
from public.product_images
where product_id = v_product.id
and coalesce(media_type, 'image') = 'image'
and (variant_id is null or variant_id = v_variant.id)
order by
(variant_id = v_variant.id) desc,
(is_primary is true) desc,
sort_order asc
limit 1;

insert into public.order_items (
order_id,
order_shop_id,
shop_id,
product_id,
variant_id,
product_name,
product_reference,
image_url,
selected_options,
quantity,
original_unit_price,
unit_price,
discount_amount,
line_total,
commission_rate,
commission_amount,
waist_cm
)
values (
v_order.id,
v_order_shop_id,
v_shop_id,
v_product.id,
v_variant.id,
v_product.name,
v_product.reference,
v_image,
coalesce(v_variant.attributes, '{}'::jsonb),
v_qty,
v_original_unit_price,
v_unit_price,
v_item_discount * v_qty,
v_line_total,
v_commission_rate,
v_item_commission,
v_waist
);

update public.product_variants
set stock = stock - v_qty,
updated_at = now()
where id = v_variant.id;

end loop;

for v_shop_key in
select jsonb_object_keys(v_shop_subtotals)
loop
update public.order_shops
set subtotal = (v_shop_subtotals->>v_shop_key)::numeric,
commission_amount = (v_shop_commissions->>v_shop_key)::numeric,
net_amount = (v_shop_subtotals->>v_shop_key)::numeric - (v_shop_commissions->>v_shop_key)::numeric,
updated_at = now()
where id = (v_order_shop_ids->>v_shop_key)::uuid;

insert into public.seller_transactions (
shop_id, order_id, type, gross_amount, commission_amount, net_amount, status
)
values (
v_shop_key::uuid,
v_order.id,
'sale',
round((v_shop_subtotals->>v_shop_key)::numeric)::integer,
round((v_shop_commissions->>v_shop_key)::numeric)::integer,
round((v_shop_subtotals->>v_shop_key)::numeric - (v_shop_commissions->>v_shop_key)::numeric)::integer,
'available'
);
end loop;

if v_needs_delivery then

for v_route_shop in
select
s.latitude,
s.longitude,
s.name
from public.order_shops os
join public.shops s
on s.id = os.shop_id
where os.order_id = v_order.id
and os.fulfillment_type = 'delivery'
order by os.route_sequence
loop

if v_route_shop.latitude is null
or v_route_shop.longitude is null then
raise exception 'Coordonnées manquantes pour la boutique "%".', v_route_shop.name;
end if;

if v_route_shop.latitude < -90
or v_route_shop.latitude > 90
or v_route_shop.longitude < -180
or v_route_shop.longitude > 180 then
raise exception 'Coordonnées invalides pour la boutique "%".', v_route_shop.name;
end if;

if v_prev_lat is not null then
v_distance_km :=
v_distance_km +
public.haversine_km(
v_prev_lat,
v_prev_lng,
v_route_shop.latitude,
v_route_shop.longitude
);
end if;

v_prev_lat := v_route_shop.latitude;
v_prev_lng := v_route_shop.longitude;

end loop;

if v_prev_lat is not null then
v_distance_km :=
v_distance_km +
public.haversine_km(
v_prev_lat,
v_prev_lng,
v_client_lat,
v_client_lng
);
end if;

if jsonb_typeof(payload->'routeDistanceKm') = 'number' then
v_route_distance_quote := (payload->>'routeDistanceKm')::numeric;
end if;

if v_route_distance_quote is not null
and v_route_distance_quote >= v_distance_km
and v_route_distance_quote <= v_distance_km * 3 then
v_distance_km := v_route_distance_quote;
end if;

v_delivery_fee :=
public.calculate_delivery_fee(v_distance_km);

end if;

v_promo_code := nullif(trim(payload->>'promoCode'), '');
if v_promo_code is not null then
  v_promo_result := public.validate_promo_code(v_promo_code, (v_products_subtotal - v_discount_total)::integer);
  if coalesce((v_promo_result->>'valid')::boolean, false) then
    v_promo_discount := (v_promo_result->>'discount_amount')::numeric;
  else
    raise exception '%', coalesce(v_promo_result->>'message', 'Code promo invalide.');
  end if;
end if;

v_urgent_fee := ezial_private.order_urgent_fee(payload, v_needs_delivery); -- livraison urgente

update public.orders
set
products_subtotal = v_products_subtotal,
discount_amount = v_discount_total + v_promo_discount,
delivery_fee = v_delivery_fee,
promo_code = v_promo_code,
is_urgent = (v_urgent_fee > 0),
urgent_fee = v_urgent_fee,
total_amount = (v_products_subtotal - v_discount_total - v_promo_discount) + v_delivery_fee + v_gift_wrap_fee + v_urgent_fee,
updated_at = now()
where id = v_order.id
returning *
into v_order;

select
coalesce(jsonb_agg(to_jsonb(os)), '[]'::jsonb)
into v_shops_out
from public.order_shops os
where os.order_id = v_order.id;

select
coalesce(jsonb_agg(to_jsonb(oi)), '[]'::jsonb)
into v_items_out
from public.order_items oi
where oi.order_id = v_order.id;

return jsonb_build_object(
'order', to_jsonb(v_order),
'shops', v_shops_out,
'items', v_items_out
);

end;
$function$;

CREATE OR REPLACE FUNCTION ezial_private.trg_orders_on_paid()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_marked uuid; v_shop record; v_owner uuid;
begin
  update public.orders set paid_processed_at = now() where id = new.id and paid_processed_at is null returning id into v_marked;
  if v_marked is null then return null; end if;

  insert into public.seller_transactions (shop_id, order_id, order_shop_id, type, gross_amount, commission_amount, net_amount, status)
  select s.shop_id, s.order_id, s.id, 'sale', round(s.subtotal)::integer, round(s.commission_amount)::integer,
         round(s.subtotal - s.commission_amount)::integer, 'available'
    from public.order_shops s
   where s.order_id = new.id and not exists (select 1 from public.seller_transactions t where t.order_shop_id = s.id and t.type = 'sale');

  begin
    if new.customer_id is not null then
      perform public.notify_user(new.customer_id, 'order_confirmed', 'Commande confirmée',
        'Votre paiement est reçu : votre commande ' || coalesce(new.order_number, '') || ' est confirmée. Votre facture est disponible.',
        '/compte/commande/' || coalesce(new.order_number, ''), new.id);
    end if;
    for v_shop in select id, shop_id from public.order_shops where order_id = new.id loop
      select owner_id into v_owner from public.shops where id = v_shop.shop_id;
      if v_owner is not null then
        perform public.notify_user(v_owner, 'seller_new_order', 'Nouvelle commande reçue', 'Une nouvelle commande vient d''arriver.',
          '/pro/seller/commandes', new.id, null, null, v_shop.shop_id);
      end if;
      perform ezial_private.emit_event('seller_order.created', v_shop.id);
    end loop;
    perform public.notify_admins('new_order', 'Nouvelle commande ' || new.order_number, '/pro/admin/commandes/' || new.id, new.id);
    perform ezial_private.emit_event('order.confirmed', new.id);
  exception when others then
    raise warning 'notifications de paiement (commande %) : %', new.id, sqlerrm;
  end;
  return null;
end; $function$;

CREATE OR REPLACE FUNCTION public.validate_promo_code(p_code text, p_subtotal integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_row public.promo_codes%rowtype; v_discount integer;
begin
  select * into v_row from public.promo_codes where upper(code) = upper(trim(p_code));
  if v_row.id is null then return jsonb_build_object('valid', false, 'message', 'Code promo invalide.'); end if;
  if not v_row.is_active then return jsonb_build_object('valid', false, 'message', 'Ce code promo n''est plus actif.'); end if;
  if v_row.start_date is not null and now() < v_row.start_date then return jsonb_build_object('valid', false, 'message', 'Ce code promo n''est pas encore actif.'); end if;
  if v_row.end_date is not null and now() > v_row.end_date then return jsonb_build_object('valid', false, 'message', 'Ce code promo a expiré.'); end if;
  if v_row.min_order_amount is not null and p_subtotal < v_row.min_order_amount then
    return jsonb_build_object('valid', false, 'message', format('Montant minimum requis : %s FCFA.', v_row.min_order_amount));
  end if;
  if v_row.discount_type = 'percent' then v_discount := round(p_subtotal * (v_row.discount_value / 100.0));
  else v_discount := round(v_row.discount_value); end if;
  v_discount := least(v_discount, p_subtotal);
  return jsonb_build_object('valid', true, 'discount_amount', v_discount, 'code', upper(v_row.code));
end; $function$;
-- @@ restaure : fin

-- Fonctions de production non modifiées par les migrations « promotions », mais sur lesquelles reposent les tests
-- (annulation des impayés, restitution du stock, ventes vendeurs, disponibilité des ventes).
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

CREATE OR REPLACE FUNCTION ezial_private.restock_order(p_order_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o public.orders; v_lines integer;
begin
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then return 'not_found'; end if;
  if not o.payment_required then return 'not_applicable'; end if;
  if o.paid_processed_at is not null then return 'paid_order'; end if;
  if o.status <> 'cancelled' then return 'not_cancelled'; end if;
  if o.stock_released_at is not null then return 'already_released'; end if;

  perform 1 from public.product_variants pv
   where pv.id in (select oi.variant_id from public.order_items oi where oi.order_id = o.id and oi.variant_id is not null)
   order by pv.id for update;

  update public.product_variants pv set stock = pv.stock + s.qty, updated_at = now()
    from (select oi.variant_id, sum(oi.quantity) as qty from public.order_items oi
           where oi.order_id = o.id and oi.variant_id is not null group by oi.variant_id) s
   where pv.id = s.variant_id;
  get diagnostics v_lines = row_count;

  update public.orders set stock_released_at = now() where id = o.id;
  perform ezial_private.audit('system', 'order_stock_released', 'order', o.id, jsonb_build_object('variants', v_lines));
  return 'released';
end; $function$;

CREATE OR REPLACE FUNCTION ezial_private.refresh_order_shop_eligibility(p_order_shop_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION ezial_private.emit_event(p_type text, p_entity_id uuid, p_dedupe_suffix text DEFAULT NULL::text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_rows integer;
begin
  insert into public.ezial_events (event_type, entity_id, dedupe_key, payload)
  values (p_type, p_entity_id, p_type || ':' || p_entity_id || coalesce(':' || p_dedupe_suffix, ''), coalesce(p_payload, '{}'::jsonb))
  on conflict (dedupe_key) do nothing;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$function$;

CREATE OR REPLACE FUNCTION ezial_private.refresh_order_eligibility(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v uuid;
begin
  for v in select id from public.order_shops where order_id = p_order_id loop
    perform ezial_private.refresh_order_shop_eligibility(v);
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION ezial_private.trg_finance_refresh()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION ezial_private.trg_seller_sale_starts_pending()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.type = 'sale' then
    if new.order_shop_id is null and new.order_id is not null then
      select os.id into new.order_shop_id from public.order_shops os where os.order_id = new.order_id and os.shop_id = new.shop_id;
    end if;
    if new.status = 'available' then new.status := 'pending'; end if;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION ezial_private.trg_skip_unpaid_sale()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.type = 'sale' and new.order_id is not null and public.order_is_unpaid(new.order_id) then
    return null;
  end if;
  return new;
end; $function$;

CREATE OR REPLACE FUNCTION ezial_private.order_shop_delivered(p_order_shop_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
