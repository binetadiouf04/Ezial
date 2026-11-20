-- ============================================================================
-- Orange Money (QR Code – OM) — migration 2/4 : COMMANDES NON PAYÉES
-- Pour les commandes Orange Money créées quand l'interrupteur est allumé
-- (orders.payment_required = true) :
--   * aucune notification (vendeur, client, administrateur, WhatsApp, événements)
--     avant la confirmation fiable du paiement ;
--   * le vendeur ne voit pas la commande et ne peut pas la préparer ;
--   * aucune livraison possible ; la part vendeur n'est créée qu'au paiement.
-- Toutes les autres commandes (Wave, existantes) se comportent exactement comme avant.
-- Prérequis : migration 1. Sûre à relancer. Retour arrière : orange-money-retour-arriere.sql
-- ============================================================================
begin;

-- ── Aide : « commande à paiement obligatoire, jamais payée » ─────────────────
create or replace function public.order_is_unpaid(p_order_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select o.payment_required and o.paid_processed_at is null from public.orders o where o.id = p_order_id), false);
$$;
revoke execute on function public.order_is_unpaid(uuid) from public, anon;
grant execute on function public.order_is_unpaid(uuid) to authenticated, service_role;

-- ── Création : marquer la commande Orange Money (si l'interrupteur est allumé) ─
create or replace function ezial_private.trg_orders_set_payment_required() returns trigger
language plpgsql security definer set search_path = '' as $$
declare s public.payment_settings;
begin
  select * into s from public.payment_settings where id;
  if new.payment_method = 'orange_money' and coalesce(s.orange_money_enabled, false) then
    new.payment_required := true;
    new.payment_deadline := now() + make_interval(mins => s.payment_window_minutes);
    new.payment_grace_until := new.payment_deadline + make_interval(mins => s.payment_grace_minutes);
  end if;
  return new;
end; $$;
drop trigger if exists trg_a_set_payment_required on public.orders;
create trigger trg_a_set_payment_required before insert on public.orders
  for each row execute function ezial_private.trg_orders_set_payment_required();

-- ── Notifications : rien avant paiement (versions de production + garde) ─────
create or replace function public.notify_customer_order_confirmed() returns trigger
language plpgsql security definer set search_path to 'public' as $function$
begin
  if new.payment_required and new.paid_processed_at is null then return new; end if;
  if new.customer_id is not null then
    perform public.notify_user(
      new.customer_id, 'order_confirmed', 'Commande confirmée',
      'Votre commande ' || coalesce(new.order_number, '') || ' est enregistrée. Votre facture est disponible.',
      '/compte/commande/' || coalesce(new.order_number, ''), new.id
    );
  end if;
  return new;
end;
$function$;

create or replace function public.trg_fn_notify_admin_new_order() returns trigger
language plpgsql security definer set search_path to 'public' as $function$
begin
  if new.payment_required and new.paid_processed_at is null then return new; end if;
  perform public.notify_admins('new_order', 'Nouvelle commande ' || new.order_number, '/pro/admin/commandes/' || new.id, new.id);
  return new;
end;
$function$;

create or replace function public.notify_seller_new_order() returns trigger
language plpgsql security definer set search_path to 'public' as $function$
declare v_owner_id uuid;
begin
  if public.order_is_unpaid(new.order_id) then return new; end if;
  select owner_id into v_owner_id from public.shops where id = new.shop_id;
  if v_owner_id is null then return new; end if;
  perform public.notify_user(v_owner_id, 'seller_new_order', 'Nouvelle commande reçue', 'Une nouvelle commande vient d''arriver.', '/pro/seller/commandes', new.order_id, null, null, new.shop_id);
  return new;
end;
$function$;

create or replace function public.notify_seller_order_cancelled() returns trigger
language plpgsql security definer set search_path to 'public' as $function$
declare v_owner_id uuid;
begin
  if new.status is distinct from 'cancelled' then return new; end if;
  if public.order_is_unpaid(new.order_id) then return new; end if;   -- jamais vue par le vendeur
  select owner_id into v_owner_id from public.shops where id = new.shop_id;
  if v_owner_id is null then return new; end if;
  perform public.notify_user(v_owner_id, 'seller_order_cancelled', 'Commande annulée', 'Une commande a été annulée.', '/pro/seller/commandes', new.order_id, null, null, new.shop_id);
  return new;
end;
$function$;

create or replace function ezial_private.trg_events_order_created() returns trigger
language plpgsql security definer set search_path to '' as $function$
declare v uuid;
begin
  begin
    if new.status <> 'cancelled' and not (new.payment_required and new.paid_processed_at is null) then
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
$function$;

create or replace function ezial_private.whatsapp_on_order_accepted(p_order_id uuid) returns void
language plpgsql security definer set search_path to '' as $function$
declare v_order record; v_requires_paid boolean;
begin
  select o.id, o.status, o.payment_status, o.payment_required, o.customer_id, o.phone into v_order from public.orders o where o.id = p_order_id;
  if v_order.id is null or v_order.status = 'cancelled' then return; end if;
  if v_order.payment_required and v_order.payment_status is distinct from 'paid' then return; end if;   -- pas de WhatsApp avant paiement
  select s.confirmation_requires_paid into v_requires_paid from public.whatsapp_settings s where s.id;
  if coalesce(v_requires_paid, false) and v_order.payment_status is distinct from 'paid' then return; end if;
  perform ezial_private.whatsapp_enqueue('buyer_order_confirmed', 'buyer_order_confirmed:' || v_order.id, v_order.id, null, null, v_order.customer_id, v_order.phone, interval '24 hours');
end;
$function$;

-- ── Part vendeur : créée seulement après le paiement (soldes inchangés pour les autres) ─
create or replace function ezial_private.trg_skip_unpaid_sale() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.type = 'sale' and new.order_id is not null and public.order_is_unpaid(new.order_id) then
    return null;   -- recréée au paiement par trg_orders_on_paid, avec les mêmes montants
  end if;
  return new;
end; $$;
drop trigger if exists trg_a_skip_unpaid_sale on public.seller_transactions;
create trigger trg_a_skip_unpaid_sale before insert on public.seller_transactions
  for each row execute function ezial_private.trg_skip_unpaid_sale();

-- ── Passage à « payé » : tout part une seule fois ───────────────────────────
create or replace function ezial_private.trg_orders_on_paid() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_marked uuid; v_shop record; v_owner uuid;
begin
  -- Le marqueur est posé d'abord : un second passage (notification répétée) ne fait rien.
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
end; $$;
drop trigger if exists trg_orders_on_paid on public.orders;
create trigger trg_orders_on_paid after update on public.orders for each row
  when (old.payment_status is distinct from new.payment_status and new.payment_status = 'paid' and new.payment_required)
  execute function ezial_private.trg_orders_on_paid();

-- ── Aucune préparation ni livraison d'une commande non payée (même par un administrateur) ─
create or replace function ezial_private.trg_block_unpaid_progress() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_blocked boolean;
begin
  if new.status is not distinct from old.status or new.status = 'cancelled' then return new; end if;
  if tg_table_name = 'orders' then
    v_blocked := old.payment_required and old.paid_processed_at is null and old.payment_status is distinct from 'paid';
  else
    v_blocked := public.order_is_unpaid(old.order_id);
  end if;
  if v_blocked then
    raise exception 'Commande non payée : préparation et livraison impossibles.' using errcode = 'P0001';
  end if;
  return new;
end; $$;
drop trigger if exists trg_a_block_unpaid_progress on public.orders;
create trigger trg_a_block_unpaid_progress before update of status on public.orders
  for each row execute function ezial_private.trg_block_unpaid_progress();
drop trigger if exists trg_a_block_unpaid_progress on public.order_shops;
create trigger trg_a_block_unpaid_progress before update of status on public.order_shops
  for each row execute function ezial_private.trg_block_unpaid_progress();

create or replace function ezial_private.trg_block_unpaid_mission() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.order_is_unpaid(new.order_id) then
    raise exception 'Commande non payée : mission de livraison impossible.' using errcode = 'P0001';
  end if;
  return new;
end; $$;
drop trigger if exists trg_a_block_unpaid_mission on public.delivery_missions;
create trigger trg_a_block_unpaid_mission before insert on public.delivery_missions
  for each row execute function ezial_private.trg_block_unpaid_mission();

-- ── Le vendeur ne voit pas une commande non payée (RLS) ──────────────────────
alter policy sellers_select_orders_with_own_shop on public.orders
  using (id in (select os.order_id from public.order_shops os join public.shops s on s.id = os.shop_id where s.owner_id = auth.uid())
         and not public.order_is_unpaid(id));
alter policy sellers_select_own_order_shops on public.order_shops
  using (shop_id in (select shops.id from public.shops where shops.owner_id = auth.uid())
         and not public.order_is_unpaid(order_id));
alter policy sellers_update_own_order_shops_status on public.order_shops
  using (shop_id in (select shops.id from public.shops where shops.owner_id = auth.uid()) and not public.order_is_unpaid(order_id))
  with check (shop_id in (select shops.id from public.shops where shops.owner_id = auth.uid()) and not public.order_is_unpaid(order_id));
alter policy sellers_select_own_order_items on public.order_items
  using (order_shop_id in (select os.id from public.order_shops os join public.shops s on s.id = os.shop_id where s.owner_id = auth.uid())
         and not public.order_is_unpaid(order_id));

commit;
