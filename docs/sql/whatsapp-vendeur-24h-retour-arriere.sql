-- Retour arrière de whatsapp-vendeur-24h.sql : rétablit le message immédiat « nouvelle commande »
-- pour le vendeur et le rappel calculé à partir de ce message (comportement d'origine).
-- À exécuter en 2 étapes séparées.

-- ÉTAPE 1
create or replace function ezial_private.whatsapp_on_order_accepted(p_order_id uuid)
returns void language plpgsql security definer set search_path = '' as $fn$
declare v_order record; v_requires_paid boolean; v_os record;
begin
  select o.id, o.status, o.payment_status, o.customer_id, o.phone into v_order from public.orders o where o.id = p_order_id;
  if v_order.id is null or v_order.status = 'cancelled' then return; end if;
  select s.confirmation_requires_paid into v_requires_paid from public.whatsapp_settings s where s.id;
  if coalesce(v_requires_paid, false) and v_order.payment_status is distinct from 'paid' then return; end if;

  perform ezial_private.whatsapp_enqueue('buyer_order_confirmed', 'buyer_order_confirmed:' || v_order.id, v_order.id, null, null,
    v_order.customer_id, v_order.phone, interval '24 hours');

  for v_os in
    select os.id, os.shop_id, sh.owner_id, sh.phone
      from public.order_shops os join public.shops sh on sh.id = os.shop_id
     where os.order_id = v_order.id and os.status <> 'cancelled'
  loop
    perform ezial_private.whatsapp_enqueue('seller_new_order', 'seller_new_order:' || v_os.id, v_order.id, v_os.id, v_os.shop_id,
      v_os.owner_id, v_os.phone, interval '24 hours');
  end loop;
end;
$fn$;

-- ÉTAPE 2
create or replace function public.whatsapp_maintenance()
returns void language plpgsql security definer set search_path = '' as $fn$
declare v record;
begin
  for v in
    select n.order_id, n.order_shop_id, n.shop_id, sh.owner_id, sh.phone
      from public.whatsapp_notifications n
      join public.order_shops os on os.id = n.order_shop_id
      join public.orders o on o.id = n.order_id
      join public.shops sh on sh.id = n.shop_id
     where n.kind = 'seller_new_order'
       and n.created_at <= now() - interval '24 hours'
       and n.created_at > now() - interval '72 hours'
       and os.status = 'confirmed' and o.status <> 'cancelled'
       and not exists (select 1 from public.whatsapp_notifications r where r.dedupe_key = 'seller_order_reminder:' || n.order_shop_id)
  loop
    perform ezial_private.whatsapp_enqueue('seller_order_reminder', 'seller_order_reminder:' || v.order_shop_id, v.order_id, v.order_shop_id, v.shop_id,
      v.owner_id, v.phone, interval '12 hours');
  end loop;

  update public.whatsapp_notifications
     set status = 'pending', locked_until = null, updated_at = now()
   where status = 'sending' and locked_until < now();

  update public.whatsapp_notifications
     set status = 'expired', recipient_phone = null, updated_at = now()
   where status = 'pending' and expires_at <= now();
end;
$fn$;
revoke all on function public.whatsapp_maintenance() from public, anon, authenticated;

