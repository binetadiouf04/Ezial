-- create_order(jsonb) TEL QU'EN PRODUCTION, relu en lecture seule le 24 nov. 2026
-- (pg_get_functiondef, fins de ligne CRLF ramenées à LF). Empreinte attendue du corps :
-- md5(replace(prosrc, E'\r', '')) = 147fe41987848a9c884cbb129ae0bcca (vérifiée par run.sh).
-- Sert de référence « avant » du banc et de base au retour arrière.
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

update public.orders
set
products_subtotal = v_products_subtotal,
discount_amount = v_discount_total + v_promo_discount,
delivery_fee = v_delivery_fee,
promo_code = v_promo_code,
total_amount = (v_products_subtotal - v_discount_total - v_promo_discount) + v_delivery_fee + v_gift_wrap_fee,
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
