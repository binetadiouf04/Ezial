-- Ezial — WhatsApp vendeur : un seul message, 24 h après une commande non prise en charge
-- À exécuter dans Supabase → SQL Editor, EN 3 ÉTAPES SÉPARÉES (une étape = un copier-coller
-- = un clic sur « Run »).
--
-- Règle voulue : le vendeur ne reçoit PLUS de WhatsApp à chaque nouvelle commande (il a déjà
-- la notification du téléphone et la cloche). Il reçoit un seul rappel WhatsApp si, 24 h après
-- l'acceptation de la commande, sa part n'est toujours pas prise en charge (statut « confirmed »),
-- et seulement s'il a donné son consentement WhatsApp. Les 3 autres messages ne changent pas :
-- confirmation et « en route » pour l'acheteur (si l'acheteur a accepté WhatsApp).
-- Rien n'est supprimé : le type « seller_new_order » reste autorisé en base mais n'est plus créé.

-- ÉTAPE 1 — la commande acceptée ne prépare plus de message immédiat au vendeur.
create or replace function ezial_private.whatsapp_on_order_accepted(p_order_id uuid)
returns void language plpgsql security definer set search_path = '' as $fn$
declare v_order record; v_requires_paid boolean;
begin
  select o.id, o.status, o.payment_status, o.customer_id, o.phone into v_order from public.orders o where o.id = p_order_id;
  if v_order.id is null or v_order.status = 'cancelled' then return; end if;
  select s.confirmation_requires_paid into v_requires_paid from public.whatsapp_settings s where s.id;
  if coalesce(v_requires_paid, false) and v_order.payment_status is distinct from 'paid' then return; end if;

  perform ezial_private.whatsapp_enqueue('buyer_order_confirmed', 'buyer_order_confirmed:' || v_order.id, v_order.id, null, null,
    v_order.customer_id, v_order.phone, interval '24 hours');
end;
$fn$;

-- ÉTAPE 2 — le rappel vendeur part 24 h après l'acceptation de la commande (et moins de 72 h après).
-- Le point de départ est le message de confirmation de l'acheteur, créé au même moment, que
-- l'acheteur ait accepté WhatsApp ou non.
create or replace function public.whatsapp_maintenance()
returns void language plpgsql security definer set search_path = '' as $fn$
declare v record;
begin
  for v in
    select os.order_id, os.id as order_shop_id, os.shop_id, sh.owner_id, sh.phone
      from public.whatsapp_notifications n
      join public.order_shops os on os.order_id = n.order_id
      join public.orders o on o.id = os.order_id
      join public.shops sh on sh.id = os.shop_id
     where n.kind = 'buyer_order_confirmed'
       and n.created_at <= now() - interval '24 hours'
       and n.created_at > now() - interval '72 hours'
       and os.status = 'confirmed' and o.status <> 'cancelled'
       and not exists (select 1 from public.whatsapp_notifications r where r.dedupe_key = 'seller_order_reminder:' || os.id)
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

-- ÉTAPE 3 — les anciens messages « nouvelle commande » encore en attente ne partent plus
-- (le numéro complet est effacé, comme pour tout message ignoré).
update public.whatsapp_notifications
   set status = 'skipped', skip_reason = 'seller_new_order_disabled', recipient_phone = null, updated_at = now()
 where kind = 'seller_new_order' and status = 'pending';

-- Vérification (à exécuter à part) : « true » trois fois attendu.
select
  position('seller_new_order' in pg_get_functiondef('ezial_private.whatsapp_on_order_accepted(uuid)'::regprocedure)) = 0 as plus_de_message_immediat_vendeur,
  position('buyer_order_confirmed' in pg_get_functiondef('public.whatsapp_maintenance()'::regprocedure)) > 0 as rappel_24h_a_jour,
  not exists (select 1 from public.whatsapp_notifications where kind = 'seller_new_order' and status = 'pending') as aucun_ancien_message_en_attente;
