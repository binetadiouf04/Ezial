-- Ezial — LIVRAISON URGENTE (point 10 du lancement)
-- ============================================================================
-- Option payante au moment de la commande : supplément FIXE de 500 FCFA par
-- commande, fixé ici côté serveur (jamais envoyé par le navigateur), seulement
-- si au moins une boutique de la commande est livrée à domicile (pas en retrait).
-- Le jour et le créneau sont ceux de la préférence de livraison qui existe déjà
-- (orders.preferred_delivery_date / preferred_delivery_slot, payload
-- preferredDeliveryDate / preferredDeliverySlot) : aucun second champ de date.
--
-- Ce que fait ce fichier (rejouable, une transaction) :
--   1. orders : deux colonnes, is_urgent (bool, faux par défaut) et urgent_fee
--      (entier, 0 par défaut). Les commandes existantes ne changent pas.
--   2. Table de réglages public.urgent_delivery_settings (une seule ligne) :
--      disponibilité (ÉTEINTE par défaut), délai minimal avant le début du
--      créneau, nombre de jours proposés, créneaux (libellé, début, fin, heure
--      limite de commande, actif). Lecture : administrateurs (RLS) ; écriture :
--      seulement par admin_update_urgent_delivery_settings().
--   3. ezial_private.urgent_delivery_fee() = 500 ; urgent_delivery_refusal()
--      (raison du refus d'un jour/créneau, ou null) ; order_urgent_fee(payload,
--      needs_delivery) qui valide la demande et renvoie 500 ou 0 (ou refuse).
--   4. public.get_urgent_delivery_options() : réglage public lu par le site
--      (le site n'affiche l'option que si cette fonction existe et répond
--      enabled = true avec au moins un créneau réalisable).
--   5. create_order : TROIS AJOUTS seulement à la définition de PRODUCTION relue
--      le 24 nov. 2026 (empreinte md5(replace(prosrc, E'\r','')) =
--      147fe41987848a9c884cbb129ae0bcca). Pour fusionner avec une autre
--      version de create_order (ex. promotions-2-commande.sql), il suffit de
--      reporter ces trois ajouts, à l'identique :
--        (a) dans « declare », après « v_promo_discount numeric := 0; » :
--              v_urgent_fee integer := 0; -- livraison urgente
--        (b) juste avant le dernier « update public.orders set ... » :
--              v_urgent_fee := ezial_private.order_urgent_fee(payload, v_needs_delivery); -- livraison urgente
--        (c) dans ce même update : ajouter les deux lignes
--              is_urgent = (v_urgent_fee > 0),
--              urgent_fee = v_urgent_fee,
--            et terminer le calcul du total par « + v_urgent_fee » :
--              total_amount = (...) + v_delivery_fee + v_gift_wrap_fee + v_urgent_fee,
--      Rien d'autre ne change : frais de livraison (calculate_delivery_fee),
--      commissions, parts vendeurs (order_shops, seller_transactions), stock,
--      paiements. Le supplément n'entre que dans total_amount, donc dans le
--      montant payé (payments_create_transaction lit orders.total_amount).
--
-- Retour arrière : docs/sql/lancement-livraison-urgente-retour-arriere.sql
-- Banc de test local : supabase/tests/livraison-urgente/run.sh
-- ============================================================================
begin;

-- 1. Colonnes de commande --------------------------------------------------
alter table public.orders add column if not exists is_urgent boolean not null default false;
alter table public.orders add column if not exists urgent_fee integer not null default 0;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'orders_urgent_fee_check' and conrelid = 'public.orders'::regclass) then
    alter table public.orders add constraint orders_urgent_fee_check check (urgent_fee >= 0 and (is_urgent or urgent_fee = 0));
  end if;
end $$;

-- 2. Réglages (une seule ligne) ---------------------------------------------
create table if not exists public.urgent_delivery_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  min_lead_minutes integer not null default 60 check (min_lead_minutes between 0 and 1440),
  max_days_ahead integer not null default 1 check (max_days_ahead between 0 and 7),
  slots jsonb not null default '[
    {"label": "09h–12h", "start": "09:00", "end": "12:00", "cutoff": "08:00", "enabled": true},
    {"label": "12h–15h", "start": "12:00", "end": "15:00", "cutoff": "11:00", "enabled": true},
    {"label": "15h–18h", "start": "15:00", "end": "18:00", "cutoff": "14:00", "enabled": true},
    {"label": "18h–20h", "start": "18:00", "end": "20:00", "cutoff": "17:00", "enabled": true}
  ]'::jsonb check (jsonb_typeof(slots) = 'array'),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.urgent_delivery_settings (id) values (true) on conflict (id) do nothing;

alter table public.urgent_delivery_settings enable row level security;
revoke all on public.urgent_delivery_settings from anon, authenticated;
grant select on public.urgent_delivery_settings to authenticated;
drop policy if exists urgent_delivery_settings_admin_select on public.urgent_delivery_settings;
create policy urgent_delivery_settings_admin_select on public.urgent_delivery_settings for select to authenticated
  using (exists (select 1 from public.admins a where a.user_id = (select auth.uid())));

-- 3. Règles serveur ----------------------------------------------------------
-- Montant fixe du supplément, en FCFA. Seule source de vérité.
create or replace function ezial_private.urgent_delivery_fee()
returns integer language sql immutable set search_path = '' as $$ select 500 $$;

-- Raison du refus d'un jour + créneau en livraison urgente, ou null s'il est
-- réalisable. Heure de Dakar (UTC+0 toute l'année). p_now sert aux tests.
create or replace function ezial_private.urgent_delivery_refusal(p_date date, p_slot text, p_now timestamptz default now())
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.urgent_delivery_settings;
  v_slot jsonb;
  v_local timestamp := p_now at time zone 'Africa/Dakar';
  v_today date := (p_now at time zone 'Africa/Dakar')::date;
begin
  select * into s from public.urgent_delivery_settings where id;
  if s.id is null or not s.enabled then
    return 'La livraison urgente n''est pas disponible pour le moment.';
  end if;
  if p_date is null or coalesce(trim(p_slot), '') = '' then
    return 'Choisissez un jour et un créneau pour la livraison urgente.';
  end if;
  select e into v_slot from jsonb_array_elements(s.slots) e
   where e->>'label' = trim(p_slot) and coalesce((e->>'enabled')::boolean, false)
   limit 1;
  if v_slot is null then
    return 'Ce créneau n''est pas proposé en livraison urgente.';
  end if;
  if p_date < v_today then
    return 'Ce créneau est déjà passé. Choisissez un autre créneau.';
  end if;
  if p_date > v_today + s.max_days_ahead then
    return 'Ce jour n''est pas encore ouvert à la livraison urgente.';
  end if;
  if v_local > p_date + (v_slot->>'cutoff')::time then
    return 'L''heure limite de ce créneau est passée. Choisissez un autre créneau.';
  end if;
  if (p_date + (v_slot->>'start')::time) - v_local < make_interval(mins => s.min_lead_minutes) then
    return 'Ce créneau est trop proche pour être garanti. Choisissez un créneau plus tard.';
  end if;
  return null;
end;
$$;

-- Appelée par create_order : 0 si la livraison urgente n'est pas demandée,
-- 500 si elle est demandée et réalisable ; refus (exception) sinon.
create or replace function ezial_private.order_urgent_fee(payload jsonb, p_needs_delivery boolean)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_reason text;
  v_date date;
begin
  -- Seul le booléen JSON true demande l'urgence (absent, false ou autre : commande normale).
  if jsonb_typeof(payload->'urgentDelivery') is distinct from 'boolean' then
    return 0;
  end if;
  if not (payload->>'urgentDelivery')::boolean then
    return 0;
  end if;
  if not coalesce(p_needs_delivery, false) then
    raise exception 'La livraison urgente n''est possible qu''avec une livraison à domicile.' using errcode = 'P0001';
  end if;
  begin
    v_date := nullif(payload->>'preferredDeliveryDate', '')::date;
  exception when others then
    v_date := null;
  end;
  v_reason := ezial_private.urgent_delivery_refusal(v_date, payload->>'preferredDeliverySlot');
  if v_reason is not null then
    raise exception '%', v_reason using errcode = 'P0001';
  end if;
  return ezial_private.urgent_delivery_fee();
end;
$$;

revoke all on function ezial_private.urgent_delivery_fee() from public, anon, authenticated;
revoke all on function ezial_private.urgent_delivery_refusal(date, text, timestamptz) from public, anon, authenticated;
revoke all on function ezial_private.order_urgent_fee(jsonb, boolean) from public, anon, authenticated;

-- 4. Réglage public lu par le site -----------------------------------------
-- { enabled, fee, minLeadMinutes, days: [{ date, slots: [{label, start, end, cutoff}] }] }
-- days ne contient que les créneaux réalisables à l'instant (même règle que la commande).
create or replace function public.get_urgent_delivery_options()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.urgent_delivery_settings;
  v_today date := (now() at time zone 'Africa/Dakar')::date;
  v_days jsonb := '[]'::jsonb;
  v_slots jsonb;
  d integer;
begin
  select * into s from public.urgent_delivery_settings where id;
  if s.id is null or not s.enabled then
    return jsonb_build_object('enabled', false, 'fee', ezial_private.urgent_delivery_fee(), 'days', '[]'::jsonb);
  end if;
  for d in 0 .. s.max_days_ahead loop
    select coalesce(jsonb_agg(jsonb_build_object('label', e->>'label', 'start', e->>'start', 'end', e->>'end', 'cutoff', e->>'cutoff') order by e->>'start'), '[]'::jsonb)
      into v_slots
      from jsonb_array_elements(s.slots) e
     where coalesce((e->>'enabled')::boolean, false)
       and ezial_private.urgent_delivery_refusal(v_today + d, e->>'label') is null;
    if jsonb_array_length(v_slots) > 0 then
      v_days := v_days || jsonb_build_array(jsonb_build_object('date', to_char(v_today + d, 'YYYY-MM-DD'), 'slots', v_slots));
    end if;
  end loop;
  return jsonb_build_object('enabled', true, 'fee', ezial_private.urgent_delivery_fee(), 'minLeadMinutes', s.min_lead_minutes, 'days', v_days);
end;
$$;
revoke all on function public.get_urgent_delivery_options() from public;
grant execute on function public.get_urgent_delivery_options() to anon, authenticated, service_role;

-- Écriture des réglages : administrateurs seulement, tout est revérifié ici.
create or replace function public.admin_update_urgent_delivery_settings(
  p_enabled boolean, p_min_lead_minutes integer, p_max_days_ahead integer, p_slots jsonb)
returns public.urgent_delivery_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  e jsonb;
  v_labels text[] := '{}';
  v_clean jsonb := '[]'::jsonb;
  v_label text;
  v_start time; v_end time; v_cutoff time;
  r public.urgent_delivery_settings;
begin
  if not exists (select 1 from public.admins a where a.user_id = (select auth.uid())) then
    raise exception 'Action réservée aux administrateurs.' using errcode = '42501';
  end if;
  if p_min_lead_minutes is null or p_min_lead_minutes < 0 or p_min_lead_minutes > 1440 then
    raise exception 'Délai minimal invalide (entre 0 et 1440 minutes).' using errcode = 'P0001';
  end if;
  if p_max_days_ahead is null or p_max_days_ahead < 0 or p_max_days_ahead > 7 then
    raise exception 'Nombre de jours invalide (entre 0 et 7).' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_slots) is distinct from 'array' or jsonb_array_length(p_slots) > 8 then
    raise exception 'Liste de créneaux invalide (8 au maximum).' using errcode = 'P0001';
  end if;
  for e in select * from jsonb_array_elements(p_slots) loop
    v_label := trim(coalesce(e->>'label', ''));
    if v_label = '' or length(v_label) > 40 then
      raise exception 'Chaque créneau doit avoir un libellé (40 caractères au plus).' using errcode = 'P0001';
    end if;
    if v_label = any (v_labels) then
      raise exception 'Le créneau « % » apparaît deux fois.', v_label using errcode = 'P0001';
    end if;
    begin
      v_start := (e->>'start')::time; v_end := (e->>'end')::time; v_cutoff := (e->>'cutoff')::time;
    exception when others then
      raise exception 'Heures invalides pour le créneau « % » (format HH:MM).', v_label using errcode = 'P0001';
    end;
    if v_start is null or v_end is null or v_cutoff is null or v_start >= v_end then
      raise exception 'Le créneau « % » doit commencer avant de finir.', v_label using errcode = 'P0001';
    end if;
    if v_cutoff > v_start then
      raise exception 'L''heure limite du créneau « % » doit être au plus tard à son début.', v_label using errcode = 'P0001';
    end if;
    v_labels := v_labels || v_label;
    v_clean := v_clean || jsonb_build_array(jsonb_build_object(
      'label', v_label, 'start', to_char(v_start, 'HH24:MI'), 'end', to_char(v_end, 'HH24:MI'),
      'cutoff', to_char(v_cutoff, 'HH24:MI'), 'enabled', coalesce((e->>'enabled')::boolean, false)));
  end loop;
  if coalesce(p_enabled, false) and not exists (select 1 from jsonb_array_elements(v_clean) x where (x->>'enabled')::boolean) then
    raise exception 'Activez au moins un créneau avant d''ouvrir la livraison urgente.' using errcode = 'P0001';
  end if;
  insert into public.urgent_delivery_settings (id) values (true) on conflict (id) do nothing;
  update public.urgent_delivery_settings
     set enabled = coalesce(p_enabled, false), min_lead_minutes = p_min_lead_minutes, max_days_ahead = p_max_days_ahead,
         slots = v_clean, updated_at = now(), updated_by = (select auth.uid())
   where id
  returning * into r;
  return r;
end;
$$;
revoke all on function public.admin_update_urgent_delivery_settings(boolean, integer, integer, jsonb) from public, anon;
grant execute on function public.admin_update_urgent_delivery_settings(boolean, integer, integer, jsonb) to authenticated, service_role;

-- 5. create_order : définition de production + les trois ajouts (a), (b), (c) -
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

commit;

notify pgrst, 'reload schema';

-- Vérification : toutes les lignes doivent indiquer « ok ».
select 'colonnes orders.is_urgent / urgent_fee' as element,
       case when (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name in ('is_urgent', 'urgent_fee')) = 2 then 'ok' else 'À VÉRIFIER' end as etat
union all
select 'réglages présents (livraison urgente éteinte tant que l''admin ne l''ouvre pas)',
       case when exists (select 1 from public.urgent_delivery_settings where id) then 'ok' else 'À VÉRIFIER' end
union all
select 'create_order appelle order_urgent_fee',
       case when (select prosrc from pg_proc where oid = 'public.create_order(jsonb)'::regprocedure) like '%ezial_private.order_urgent_fee(payload, v_needs_delivery)%' then 'ok' else 'À VÉRIFIER' end
union all
select 'supplément fixé côté serveur à 500 FCFA',
       case when ezial_private.urgent_delivery_fee() = 500 then 'ok' else 'À VÉRIFIER' end
union all
select 'réglage public lisible par le site',
       case when has_function_privilege('anon', 'public.get_urgent_delivery_options()', 'execute') then 'ok' else 'À VÉRIFIER' end;
