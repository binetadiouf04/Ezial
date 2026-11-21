-- Retour arrière de docs/sql/avis-relance.sql : remet dispatch_order_reminders() telle
-- qu'avant (trois relances, sans la relance « avis »). Les notifications déjà envoyées
-- et les lignes de reminders_sent sont conservées (historique).

create or replace function public.dispatch_order_reminders()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  r record;
begin
  -- Vendeur 24h : commande encore "confirmed" (préparation jamais commencée).
  for r in
    select os.id as order_shop_id, os.shop_id, o.id as order_id, o.order_number, s.owner_id
    from public.order_shops os
    join public.orders o on o.id = os.order_id
    join public.shops s on s.id = os.shop_id
    where os.status = 'confirmed'
      and o.created_at < now() - interval '24 hours'
      and not exists (select 1 from public.reminders_sent rs where rs.reminder_type = 'seller_order_24h' and rs.target_id = os.id)
  loop
    perform public.notify_user(r.owner_id, 'seller_order_reminder', 'Commande en attente',
      'La commande ' || r.order_number || ' attend votre action depuis plus de 24h.',
      '/pro/seller/commandes/' || r.order_id, r.order_id, null, null, r.shop_id);
    perform public.notify_admins('seller_order_reminder',
      'Commande ' || r.order_number || ' sans action du vendeur depuis 24h',
      '/pro/admin/commandes/' || r.order_id, r.order_id, null, null, r.shop_id);
    insert into public.reminders_sent (reminder_type, target_id) values ('seller_order_24h', r.order_shop_id);
  end loop;

  -- Livreur 4h : mission acceptée mais ramassage jamais commencé.
  for r in
    select dm.id as mission_id, dm.driver_id, dm.order_id, o.order_number
    from public.delivery_missions dm
    join public.orders o on o.id = dm.order_id
    where dm.status = 'accepted'
      and dm.accepted_at < now() - interval '4 hours'
      and not exists (select 1 from public.reminders_sent rs where rs.reminder_type = 'driver_mission_4h' and rs.target_id = dm.id)
  loop
    perform public.notify_user(r.driver_id, 'driver_mission_reminder', 'Mission en attente',
      'La mission pour la commande ' || r.order_number || ' attend depuis plus de 4h.',
      '/pro/driver/livraisons/' || r.mission_id, r.order_id, null, r.mission_id);
    perform public.notify_admins('driver_mission_reminder',
      'Mission (commande ' || r.order_number || ') sans action du livreur depuis 4h',
      '/pro/admin/livraisons/' || r.mission_id, r.order_id, null, r.mission_id);
    insert into public.reminders_sent (reminder_type, target_id) values ('driver_mission_4h', r.mission_id);
  end loop;

  -- Mission non prise en charge depuis 4h : personne à relancer, admin informé seul.
  for r in
    select dm.id as mission_id, dm.order_id, o.order_number
    from public.delivery_missions dm
    join public.orders o on o.id = dm.order_id
    where dm.status = 'available'
      and dm.created_at < now() - interval '4 hours'
      and not exists (select 1 from public.reminders_sent rs where rs.reminder_type = 'driver_mission_unclaimed_4h' and rs.target_id = dm.id)
  loop
    perform public.notify_admins('driver_mission_unclaimed_4h',
      'Mission (commande ' || r.order_number || ') non prise en charge depuis 4h',
      '/pro/admin/livraisons/' || r.mission_id, r.order_id, null, r.mission_id);
    insert into public.reminders_sent (reminder_type, target_id) values ('driver_mission_unclaimed_4h', r.mission_id);
  end loop;

end;
$function$;
