-- Fonctions, déclencheurs et règles RLS de la PRODUCTION (copie du 20 nov. 2026,
-- commentaires retirés) sur lesquels reposent les tests. Les fonctions que les
-- migrations remplacent sont dans 11-baseline-remplacees.sql (aussi utilisé comme
-- script de retour arrière).

-- ───────────── Utilitaires ─────────────
create function ezial_private.emit_event(p_type text, p_entity_id uuid, p_dedupe_suffix text default null, p_payload jsonb default '{}'::jsonb)
returns boolean language plpgsql security definer set search_path to '' as $$
declare v_rows integer;
begin
  insert into public.ezial_events (event_type, entity_id, dedupe_key, payload)
  values (p_type, p_entity_id, p_type || ':' || p_entity_id || coalesce(':' || p_dedupe_suffix, ''), coalesce(p_payload, '{}'::jsonb))
  on conflict (dedupe_key) do nothing;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end; $$;

create function ezial_private.audit(p_actor_kind text, p_action text, p_entity text, p_entity_id uuid, p_details jsonb default '{}'::jsonb)
returns void language sql security definer set search_path to '' as $$
  insert into public.finance_audit_log (actor_id, actor_kind, action, entity, entity_id, details)
  values ((select auth.uid()), p_actor_kind, p_action, p_entity, p_entity_id, coalesce(p_details, '{}'::jsonb));
$$;

create function ezial_private.log_security_event(p_kind text, p_severity text, p_details jsonb default '{}'::jsonb, p_actor uuid default null)
returns void language plpgsql security definer set search_path to '' as $$
begin
  insert into public.security_events (kind, severity, actor_id, details) values (p_kind, p_severity, p_actor, p_details);
exception when others then null;
end; $$;

create function public.notify_user(p_user_id uuid, p_type text, p_title text, p_body text, p_url text, p_order_id uuid default null,
  p_claim_id uuid default null, p_mission_id uuid default null, p_shop_id uuid default null)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  insert into public.notifications (user_id, type, title, body, url, order_id, claim_id, mission_id, shop_id)
  values (p_user_id, p_type, p_title, p_body, p_url, p_order_id, p_claim_id, p_mission_id, p_shop_id);
  perform public.push_notify(p_user_id, p_title, p_body, p_url);
end; $$;

create function public.order_shops_set_customer_id() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  select customer_id into new.customer_id from public.orders where id = new.order_id;
  return new;
end; $$;

create function ezial_private.hide_order_delivery_code() returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.delivery_code is not null then
    insert into ezial_private.delivery_codes (order_id, code) values (new.id, new.delivery_code) on conflict (order_id) do nothing;
    new.delivery_code := null;
  end if;
  return new;
end; $$;

-- ───────────── Commande ─────────────
create function public.create_order(payload jsonb) returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_order public.orders; v_item jsonb; v_product record; v_variant record; v_variant_id uuid; v_qty numeric;
  v_original_unit_price numeric; v_unit_price numeric; v_item_discount numeric; v_line_total numeric;
  v_products_subtotal numeric := 0; v_discount_total numeric := 0; v_image text; v_promo_active boolean;
  v_commission_rate numeric; v_item_commission numeric; v_shop_is_premium boolean; v_waist numeric;
  v_client_lat numeric; v_client_lng numeric; v_needs_delivery boolean := false; v_delivery_fee numeric := 0;
  v_distance_km numeric := 0; v_route_distance_quote numeric; v_route_counter integer := 0; v_route_shop record;
  v_prev_lat numeric; v_prev_lng numeric; v_delivery_code text; v_shop_key text; v_shop_fulfillment jsonb; v_shop_id uuid;
  v_order_shop_id uuid; v_order_shop_ids jsonb := '{}'::jsonb; v_shop_subtotals jsonb := '{}'::jsonb;
  v_shop_commissions jsonb := '{}'::jsonb; v_requested_fulfillment text; v_order_number text; v_payment_method text;
  v_gift_wrap_fee numeric := 0; v_promo_code text; v_promo_result jsonb; v_promo_discount numeric := 0;
  v_shops_out jsonb := '[]'::jsonb; v_items_out jsonb := '[]'::jsonb;
begin
  if coalesce(trim(payload->>'firstName'), '') = '' or coalesce(trim(payload->>'lastName'), '') = '' or coalesce(trim(payload->>'phone'), '') = '' then
    raise exception 'Coordonnées client incomplètes.';
  end if;
  if jsonb_typeof(coalesce(payload->'items', '[]'::jsonb)) <> 'array' then raise exception 'Format du panier invalide.'; end if;
  if jsonb_array_length(coalesce(payload->'items', '[]'::jsonb)) = 0 then raise exception 'Le panier est vide.'; end if;
  v_payment_method := payload->>'paymentMethod';
  if v_payment_method is null or v_payment_method not in ('wave', 'orange_money', 'paypal') then raise exception 'Mode de paiement invalide.'; end if;
  if coalesce((payload->>'isGift')::boolean, false) then
    if coalesce(trim(payload->>'giftRecipientName'), '') = '' or coalesce(trim(payload->>'giftRecipientPhone'), '') = '' then
      raise exception 'Informations du destinataire incomplètes.';
    end if;
  end if;
  v_gift_wrap_fee := case when coalesce((payload->>'giftWrap')::boolean, false) then 2000 else 0 end;
  select exists (select 1 from jsonb_array_elements(payload->'items') it join public.products p on p.id = (it->>'productId')::uuid
    where coalesce((payload->'shopFulfillments'->(p.shop_id::text))->>'type', 'delivery') = 'delivery') into v_needs_delivery;
  if v_needs_delivery then
    v_client_lat := nullif(payload->>'latitude', '')::numeric;
    v_client_lng := nullif(payload->>'longitude', '')::numeric;
    if v_client_lat is null or v_client_lng is null then raise exception 'Coordonnées de livraison manquantes.'; end if;
    if v_client_lat < -90 or v_client_lat > 90 then raise exception 'Latitude de livraison invalide.'; end if;
    if v_client_lng < -180 or v_client_lng > 180 then raise exception 'Longitude de livraison invalide.'; end if;
    v_delivery_code := lpad(floor(random() * 9000 + 1000)::text, 4, '0');
  end if;
  v_order_number := 'EZI-' || to_char(clock_timestamp(), 'YYMMDD') || '-' || lpad(nextval('public.order_number_seq')::text, 6, '0');
  insert into public.orders (order_number, customer_id, first_name, last_name, phone, email, neighborhood, delivery_address, delivery_notes,
    delivery_latitude, delivery_longitude, delivery_code, preferred_delivery_date, preferred_delivery_slot, payment_method, fulfillment_type,
    delivery_fee, products_subtotal, discount_amount, total_amount, is_gift, gift_recipient_name, gift_recipient_phone, gift_show_buyer_name,
    gift_message, gift_wrap, gift_wrap_fee)
  values (v_order_number, auth.uid(), trim(payload->>'firstName'), trim(payload->>'lastName'), trim(payload->>'phone'),
    nullif(trim(payload->>'email'), ''), nullif(trim(payload->>'neighborhood'), ''), nullif(trim(payload->>'deliveryAddress'), ''),
    nullif(trim(payload->>'deliveryNotes'), ''), v_client_lat, v_client_lng, v_delivery_code,
    nullif(payload->>'preferredDeliveryDate', '')::date, nullif(payload->>'preferredDeliverySlot', ''), v_payment_method,
    case when v_needs_delivery then 'delivery' else 'pickup' end, 0, 0, 0, 0, coalesce((payload->>'isGift')::boolean, false),
    nullif(trim(payload->>'giftRecipientName'), ''), nullif(trim(payload->>'giftRecipientPhone'), ''),
    coalesce((payload->>'giftShowBuyerName')::boolean, false), nullif(trim(payload->>'giftMessage'), ''),
    coalesce((payload->>'giftWrap')::boolean, false), v_gift_wrap_fee)
  returning * into v_order;

  for v_item in select * from jsonb_array_elements(payload->'items') loop
    v_qty := nullif(v_item->>'quantity', '')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'Quantité invalide.'; end if;
    select p.id, p.shop_id, p.name, p.reference, p.status, p.base_price, p.is_promo, p.promo_price, p.promo_start, p.promo_end,
      p.sale_mode, p.category, p.subcategory, s.status as shop_status, s.pickup_enabled
      into v_product from public.products p join public.shops s on s.id = p.shop_id
      where p.id = (v_item->>'productId')::uuid for share of p;
    if v_product.id is null then raise exception 'Produit introuvable.'; end if;
    if v_product.status <> 'active' then raise exception 'Produit indisponible : %.', v_product.name; end if;
    if v_product.shop_status <> 'active' then raise exception 'Boutique indisponible pour "%".', v_product.name; end if;
    if v_product.sale_mode in ('metre', 'kilogramme') then
      if v_qty < 0.5 or v_qty > 10 or (v_qty * 2) <> trunc(v_qty * 2) then raise exception 'Quantité invalide pour "%" (entre 0,5 et 10, par pas de 0,5).', v_product.name; end if;
    elsif v_product.sale_mode = 'piece' then
      if v_qty < 1 or v_qty > 10 or v_qty <> trunc(v_qty) then raise exception 'Quantité invalide pour "%" (entre 1 et 10 pièces).', v_product.name; end if;
    end if;
    v_waist := null;
    if v_product.category = 'bijoux' and v_product.subcategory = 'baya' then
      begin v_waist := nullif(trim(v_item->>'waistCm'), '')::numeric; exception when others then v_waist := null; end;
      if v_waist is null or v_waist < 40 or v_waist > 200 or v_waist <> round(v_waist, 1) then raise exception 'Tour de taille invalide pour "%" (entre 40 et 200 cm).', v_product.name; end if;
    end if;
    v_variant_id := nullif(v_item->>'variantId', '')::uuid;
    if v_variant_id is not null then
      select id, price, stock, attributes into v_variant from public.product_variants where id = v_variant_id and product_id = v_product.id for update;
    else
      select id, price, stock, attributes into v_variant from public.product_variants
        where product_id = v_product.id and attributes = coalesce(v_item->'selectedOptions', '{}'::jsonb) for update;
    end if;
    if v_variant.id is null then raise exception 'Variante introuvable pour "%".', v_product.name; end if;
    if v_variant.stock < v_qty then raise exception 'Stock insuffisant pour "%".', v_product.name; end if;
    v_original_unit_price := coalesce(v_variant.price, v_product.base_price);
    v_promo_active := coalesce(v_product.is_promo, false) and (v_product.promo_start is null or now() >= v_product.promo_start)
      and (v_product.promo_end is null or now() <= v_product.promo_end) and v_product.promo_price is not null and v_product.base_price > 0;
    if v_promo_active then
      v_unit_price := round(v_original_unit_price * (v_product.promo_price::numeric / v_product.base_price::numeric));
    else
      v_unit_price := v_original_unit_price;
    end if;
    v_item_discount := greatest(0, v_original_unit_price - v_unit_price);
    v_line_total := v_unit_price * v_qty;
    select (plan = 'pro' and pro_until is not null and pro_until > now()) into v_shop_is_premium from public.seller_subscriptions where shop_id = v_product.shop_id;
    v_commission_rate := case when exists (select 1 from public.shops so where so.id = v_product.shop_id and coalesce(so.is_official, false)) then 0
      when coalesce(v_shop_is_premium, false) then 0.08 else 0.10 end;
    v_item_commission := round(v_line_total * v_commission_rate);
    v_products_subtotal := v_products_subtotal + (v_original_unit_price * v_qty);
    v_discount_total := v_discount_total + (v_item_discount * v_qty);
    v_shop_id := v_product.shop_id;
    v_shop_key := v_shop_id::text;
    if v_order_shop_ids ? v_shop_key then
      v_order_shop_id := (v_order_shop_ids->>v_shop_key)::uuid;
    else
      v_shop_fulfillment := coalesce(payload->'shopFulfillments'->v_shop_key, '{}'::jsonb);
      v_requested_fulfillment := coalesce(v_shop_fulfillment->>'type', 'delivery');
      if v_requested_fulfillment not in ('delivery', 'pickup') then raise exception 'Mode de réception invalide.'; end if;
      if v_requested_fulfillment = 'pickup' and not coalesce(v_product.pickup_enabled, false) then
        raise exception 'Le retrait en boutique n''est pas disponible pour "%".', v_product.name;
      end if;
      v_route_counter := v_route_counter + 1;
      insert into public.order_shops (order_id, shop_id, fulfillment_type, status, route_sequence, pickup_code, scheduled_date, scheduled_window)
      values (v_order.id, v_shop_id, v_requested_fulfillment, 'preparing', v_route_counter,
        case when v_requested_fulfillment = 'pickup' then lpad(floor(random() * 9000 + 1000)::text, 4, '0') else null end,
        nullif(v_shop_fulfillment->>'date', '')::date, nullif(v_shop_fulfillment->>'window', ''))
      returning id into v_order_shop_id;
      v_order_shop_ids := v_order_shop_ids || jsonb_build_object(v_shop_key, v_order_shop_id::text);
      v_shop_subtotals := v_shop_subtotals || jsonb_build_object(v_shop_key, 0);
      v_shop_commissions := v_shop_commissions || jsonb_build_object(v_shop_key, 0);
    end if;
    v_shop_subtotals := v_shop_subtotals || jsonb_build_object(v_shop_key, coalesce((v_shop_subtotals->>v_shop_key)::numeric, 0) + v_line_total);
    v_shop_commissions := v_shop_commissions || jsonb_build_object(v_shop_key, coalesce((v_shop_commissions->>v_shop_key)::numeric, 0) + v_item_commission);
    select storage_path into v_image from public.product_images
      where product_id = v_product.id and coalesce(media_type, 'image') = 'image' and (variant_id is null or variant_id = v_variant.id)
      order by (variant_id = v_variant.id) desc, (is_primary is true) desc, sort_order asc limit 1;
    insert into public.order_items (order_id, order_shop_id, shop_id, product_id, variant_id, product_name, product_reference, image_url,
      selected_options, quantity, original_unit_price, unit_price, discount_amount, line_total, commission_rate, commission_amount, waist_cm)
    values (v_order.id, v_order_shop_id, v_shop_id, v_product.id, v_variant.id, v_product.name, v_product.reference, v_image,
      coalesce(v_variant.attributes, '{}'::jsonb), v_qty, v_original_unit_price, v_unit_price, v_item_discount * v_qty, v_line_total,
      v_commission_rate, v_item_commission, v_waist);
    update public.product_variants set stock = stock - v_qty, updated_at = now() where id = v_variant.id;
  end loop;

  for v_shop_key in select jsonb_object_keys(v_shop_subtotals) loop
    update public.order_shops set subtotal = (v_shop_subtotals->>v_shop_key)::numeric, commission_amount = (v_shop_commissions->>v_shop_key)::numeric,
      net_amount = (v_shop_subtotals->>v_shop_key)::numeric - (v_shop_commissions->>v_shop_key)::numeric, updated_at = now()
      where id = (v_order_shop_ids->>v_shop_key)::uuid;
    insert into public.seller_transactions (shop_id, order_id, type, gross_amount, commission_amount, net_amount, status)
    values (v_shop_key::uuid, v_order.id, 'sale', round((v_shop_subtotals->>v_shop_key)::numeric)::integer,
      round((v_shop_commissions->>v_shop_key)::numeric)::integer,
      round((v_shop_subtotals->>v_shop_key)::numeric - (v_shop_commissions->>v_shop_key)::numeric)::integer, 'available');
  end loop;

  if v_needs_delivery then
    for v_route_shop in select s.latitude, s.longitude, s.name from public.order_shops os join public.shops s on s.id = os.shop_id
      where os.order_id = v_order.id and os.fulfillment_type = 'delivery' order by os.route_sequence loop
      if v_route_shop.latitude is null or v_route_shop.longitude is null then raise exception 'Coordonnées manquantes pour la boutique "%".', v_route_shop.name; end if;
      if v_prev_lat is not null then
        v_distance_km := v_distance_km + public.haversine_km(v_prev_lat, v_prev_lng, v_route_shop.latitude, v_route_shop.longitude);
      end if;
      v_prev_lat := v_route_shop.latitude; v_prev_lng := v_route_shop.longitude;
    end loop;
    if v_prev_lat is not null then v_distance_km := v_distance_km + public.haversine_km(v_prev_lat, v_prev_lng, v_client_lat, v_client_lng); end if;
    v_delivery_fee := public.calculate_delivery_fee(v_distance_km);
  end if;
  v_promo_code := nullif(trim(payload->>'promoCode'), '');
  if v_promo_code is not null then
    v_promo_result := public.validate_promo_code(v_promo_code, (v_products_subtotal - v_discount_total)::integer);
    if coalesce((v_promo_result->>'valid')::boolean, false) then v_promo_discount := (v_promo_result->>'discount_amount')::numeric;
    else raise exception '%', coalesce(v_promo_result->>'message', 'Code promo invalide.'); end if;
  end if;
  update public.orders set products_subtotal = v_products_subtotal, discount_amount = v_discount_total + v_promo_discount, delivery_fee = v_delivery_fee,
    promo_code = v_promo_code, total_amount = (v_products_subtotal - v_discount_total - v_promo_discount) + v_delivery_fee + v_gift_wrap_fee, updated_at = now()
    where id = v_order.id returning * into v_order;
  select coalesce(jsonb_agg(to_jsonb(os)), '[]'::jsonb) into v_shops_out from public.order_shops os where os.order_id = v_order.id;
  select coalesce(jsonb_agg(to_jsonb(oi)), '[]'::jsonb) into v_items_out from public.order_items oi where oi.order_id = v_order.id;
  return jsonb_build_object('order', to_jsonb(v_order), 'shops', v_shops_out, 'items', v_items_out);
end; $$;
revoke execute on function public.create_order(jsonb) from public, anon;

-- ───────────── Finance : éligibilité des parts vendeurs ─────────────
create function ezial_private.order_shop_delivered(p_order_shop_id uuid) returns boolean language sql stable security definer set search_path to '' as $$
  select case when os.status = 'cancelled' then false
    when os.fulfillment_type = 'pickup' then os.status = 'picked_up' and ((select s.pickup_auto_eligible from public.payment_settings s where s.id)
      or exists (select 1 from public.finance_audit_log l where l.entity = 'order_shop' and l.entity_id = os.id and l.action = 'admin_confirm_pickup'))
    else exists (select 1 from public.delivery_missions m join public.delivery_stops st on st.mission_id = m.id and st.shop_id = os.shop_id
      where m.order_id = os.order_id and m.status = 'delivered') end
  from public.order_shops os where os.id = p_order_shop_id;
$$;

create function ezial_private.refresh_order_shop_eligibility(p_order_shop_id uuid) returns void language plpgsql security definer set search_path to '' as $$
declare os public.order_shops; o public.orders; v_paid boolean; v_delivered boolean; v_claim_open boolean; v_ok boolean; v_tx record;
begin
  select * into os from public.order_shops where id = p_order_shop_id;
  if os.id is null then return; end if;
  select * into o from public.orders where id = os.order_id;
  if os.status = 'cancelled' or o.status = 'cancelled' then
    for v_tx in select st.id, st.status, st.payout_id from public.seller_transactions st
      where st.order_shop_id = os.id and st.type = 'sale' and st.status <> 'cancelled' loop
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
  for v_tx in select st.id, st.status, st.payout_id from public.seller_transactions st
    where st.order_shop_id = os.id and st.type = 'sale' and st.status in ('pending', 'available') loop
    if v_ok and v_tx.status = 'pending' then
      update public.seller_transactions set status = 'available', available_at = now(), hold_reason = null where id = v_tx.id;
      perform ezial_private.audit('system', 'sale_available', 'seller_transaction', v_tx.id, jsonb_build_object('order_shop_id', os.id));
    end if;
  end loop;
  if v_delivered then perform ezial_private.emit_event('seller_order.delivered', os.id); end if;
end; $$;

create function ezial_private.refresh_order_eligibility(p_order_id uuid) returns void language plpgsql security definer set search_path to '' as $$
declare v uuid;
begin
  for v in select id from public.order_shops where order_id = p_order_id loop
    perform ezial_private.refresh_order_shop_eligibility(v);
  end loop;
end; $$;

create function ezial_private.trg_finance_refresh() returns trigger language plpgsql security definer set search_path to '' as $$
begin
  begin
    if tg_table_name = 'order_shops' then perform ezial_private.refresh_order_shop_eligibility(new.id);
    elsif tg_table_name = 'orders' then perform ezial_private.refresh_order_eligibility(new.id);
    end if;
  exception when others then raise warning 'finance refresh (%): %', tg_table_name, sqlerrm;
  end;
  return null;
end; $$;

create function ezial_private.trg_seller_sale_starts_pending() returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.type = 'sale' then
    if new.order_shop_id is null and new.order_id is not null then
      select os.id into new.order_shop_id from public.order_shops os where os.order_id = new.order_id and os.shop_id = new.shop_id;
    end if;
    if new.status = 'available' then new.status := 'pending'; end if;
  end if;
  return new;
end; $$;

create function ezial_private.guard_order_shop_status() returns trigger language plpgsql security definer set search_path to '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if new.status is not distinct from old.status then return new; end if;
  if v_uid is null or pg_trigger_depth() <> 1 or exists (select 1 from public.admins a where a.user_id = v_uid) then return new; end if;
  if not ((old.status = 'confirmed' and new.status = 'preparing')
    or (old.status = 'preparing' and new.status = 'ready' and new.fulfillment_type = 'delivery')
    or (old.status = 'preparing' and new.status = 'ready_for_pickup' and new.fulfillment_type = 'pickup')
    or (old.status = 'ready_for_pickup' and new.status = 'picked_up' and new.fulfillment_type = 'pickup')) then
    perform ezial_private.log_security_event('order_status_rejected', 'high', jsonb_build_object('order_shop_id', new.id, 'from', old.status, 'to', new.status));
    new.status := old.status;
  end if;
  return new;
end; $$;

create function public.create_delivery_mission_when_ready() returns trigger language plpgsql security definer set search_path to '' as $$
declare v_all_ready boolean; v_mission_id uuid; v_stop record; v_stop_order integer := 0;
begin
  if new.fulfillment_type <> 'delivery' or new.status <> 'ready' then return new; end if;
  if exists (select 1 from public.delivery_missions where order_id = new.order_id) then return new; end if;
  select bool_and(status = 'ready') into v_all_ready from public.order_shops where order_id = new.order_id and fulfillment_type = 'delivery';
  if not coalesce(v_all_ready, false) then return new; end if;
  perform ezial_private.ensure_delivery_code(new.order_id);
  insert into public.delivery_missions (order_id, status, driver_earning) values (new.order_id, 'available', 0) returning id into v_mission_id;
  for v_stop in select shop_id from public.order_shops where order_id = new.order_id and fulfillment_type = 'delivery' order by route_sequence loop
    v_stop_order := v_stop_order + 1;
    insert into public.delivery_stops (mission_id, shop_id, stop_order, status) values (v_mission_id, v_stop.shop_id, v_stop_order, 'pending');
  end loop;
  return new;
end; $$;

-- ───────────── Déclencheurs ─────────────
create trigger trg_a_hide_delivery_code before insert or update on public.orders for each row execute function ezial_private.hide_order_delivery_code();
create trigger trg_finance_order_status after update on public.orders for each row
  when (old.status is distinct from new.status or old.payment_status is distinct from new.payment_status) execute function ezial_private.trg_finance_refresh();
create trigger trg_order_shops_set_customer_id before insert on public.order_shops for each row execute function public.order_shops_set_customer_id();
create trigger trg_guard_order_shop_status before update on public.order_shops for each row execute function ezial_private.guard_order_shop_status();
create trigger trg_finance_order_shop_status after update on public.order_shops for each row
  when (old.status is distinct from new.status) execute function ezial_private.trg_finance_refresh();
create trigger trg_create_delivery_mission_when_ready after update on public.order_shops for each row
  when (new.status = 'ready' and old.status is distinct from new.status) execute function public.create_delivery_mission_when_ready();
create trigger trg_seller_sale_starts_pending before insert on public.seller_transactions for each row execute function ezial_private.trg_seller_sale_starts_pending();

-- ───────────── RLS (extraits utiles) ─────────────
alter table public.orders enable row level security;
alter table public.order_shops enable row level security;
alter table public.order_items enable row level security;
alter table public.seller_transactions enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.payment_events enable row level security;
alter table public.payment_settings enable row level security;
alter table public.notifications enable row level security;

create policy admins_select_all_orders on public.orders for select to authenticated using (exists (select 1 from public.admins a where a.user_id = auth.uid()));
create policy orders_select_own on public.orders for select using (customer_id = auth.uid());
create policy sellers_select_orders_with_own_shop on public.orders for select to authenticated using (id in (
  select os.order_id from public.order_shops os join public.shops s on s.id = os.shop_id where s.owner_id = auth.uid()));
create policy admins_select_all_order_shops on public.order_shops for select to authenticated using (exists (select 1 from public.admins a where a.user_id = auth.uid()));
create policy order_shops_select_own on public.order_shops for select using (customer_id = auth.uid());
create policy sellers_select_own_order_shops on public.order_shops for select to authenticated using (shop_id in (select shops.id from public.shops where shops.owner_id = auth.uid()));
create policy sellers_update_own_order_shops_status on public.order_shops for update to authenticated
  using (shop_id in (select shops.id from public.shops where shops.owner_id = auth.uid()))
  with check (shop_id in (select shops.id from public.shops where shops.owner_id = auth.uid()));
create policy admins_select_all_order_items on public.order_items for select to authenticated using (exists (select 1 from public.admins a where a.user_id = auth.uid()));
create policy order_items_select_own on public.order_items for select using (exists (
  select 1 from public.order_shops os join public.orders o on o.id = os.order_id where os.id = order_items.order_shop_id and o.customer_id = auth.uid()));
create policy sellers_select_own_order_items on public.order_items for select to authenticated using (order_shop_id in (
  select os.id from public.order_shops os join public.shops s on s.id = os.shop_id where s.owner_id = auth.uid()));
create policy "Seller can view own transactions" on public.seller_transactions for select using (exists (
  select 1 from public.shops where shops.id = seller_transactions.shop_id and shops.owner_id = auth.uid()));
create policy payment_transactions_admin_select on public.payment_transactions for select to authenticated using (exists (select 1 from public.admins a where a.user_id = (select auth.uid())));
create policy payment_transactions_customer_select on public.payment_transactions for select to authenticated using (exists (
  select 1 from public.orders o where o.id = payment_transactions.order_id and o.customer_id = (select auth.uid())));
create policy payment_events_admin_select on public.payment_events for select to authenticated using (exists (select 1 from public.admins a where a.user_id = (select auth.uid())));
create policy payment_settings_admin_select on public.payment_settings for select to authenticated using (exists (select 1 from public.admins a where a.user_id = (select auth.uid())));
create policy notifications_own on public.notifications for select using (user_id = auth.uid());

-- Fonction de synthèse vendeur (inchangée par la migration, sert à vérifier les soldes)
create function public.seller_finance_summary() returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_shop uuid;
begin
  select s.id into v_shop from public.shops s where s.owner_id = (select auth.uid()) limit 1;
  if v_shop is null then raise exception 'Boutique introuvable.' using errcode = 'P0001'; end if;
  return (select jsonb_build_object(
    'grossSales', coalesce(sum(st.gross_amount) filter (where st.type = 'sale' and st.status <> 'cancelled'), 0),
    'commissions', coalesce(sum(st.commission_amount) filter (where st.type = 'sale' and st.status <> 'cancelled'), 0),
    'netEarned', coalesce(sum(st.net_amount) filter (where st.type = 'sale' and st.status <> 'cancelled'), 0),
    'pending', coalesce(sum(st.net_amount) filter (where st.type = 'sale' and st.status = 'pending'), 0),
    'available', coalesce(sum(st.net_amount) filter (where st.type = 'sale' and st.status = 'available' and st.payout_id is null), 0))
    from public.seller_transactions st where st.shop_id = v_shop);
end; $$;
