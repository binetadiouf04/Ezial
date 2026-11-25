-- =====================================================================
-- Ezial Livreur : téléphone du client masqué tant que la mission n'est
-- pas acceptée (demande de la propriétaire, 25 nov. 2026)
-- =====================================================================
--
-- Avant : la politique RLS « drivers_select_orders_for_missions » laissait
-- TOUT livreur lire la ligne complète de la commande (téléphone, e-mail,
-- nom, prénom, destinataire et téléphone du cadeau, message cadeau…) dès
-- qu'une mission était « available ». Masquer à l'écran ne suffisait pas :
-- l'API renvoyait quand même ces données.
--
-- Après :
--   1. Un livreur ne lit plus directement une commande que si la mission
--      lui est attribuée (delivery_missions.driver_id = lui). Il voit alors
--      le téléphone pour livrer, comme aujourd'hui.
--   2. Pour décider s'il accepte une mission encore disponible, il appelle
--      la fonction public.driver_available_missions(), qui ne renvoie que :
--      numéro de commande, quartier, adresse et coordonnées GPS de
--      livraison, jour et créneau souhaités, urgence, et les boutiques à
--      récupérer (nom, quartier, adresse, coordonnées). Jamais le
--      téléphone, l'e-mail, le nom du client, les notes de livraison
--      (texte libre pouvant contenir un numéro), ni les informations du
--      destinataire d'un cadeau.
--
-- Inchangé : clients (orders_select_own), vendeurs, administrateurs,
-- anonymes (aucune lecture). Les tables delivery_stops et order_shops ne
-- contiennent aucune coordonnée du client : rien à changer.
--
-- Idempotente : peut être exécutée plusieurs fois sans effet de bord.
-- Retour arrière : docs/sql/livreur-telephone-masque-retour.sql
-- =====================================================================

begin;

-- 1. Lecture directe des commandes : seulement les missions attribuées
--    au livreur connecté.
drop policy if exists drivers_select_orders_for_missions on public.orders;
create policy drivers_select_orders_for_missions
  on public.orders
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.delivery_missions dm
      join public.profiles p on p.id = (select auth.uid())
      where dm.order_id = orders.id
        and dm.driver_id = (select auth.uid())
        and p.role = 'driver'::public.user_role
    )
  );

-- 2. Missions disponibles : uniquement les champs utiles pour décider.
--    SECURITY DEFINER (lit les commandes sans la politique ci-dessus),
--    donc la fonction vérifie elle-même que l'appelant est un livreur
--    non suspendu, et ne renvoie que des missions encore libres.
create or replace function public.driver_available_missions()
returns table (
  mission_id uuid,
  order_id uuid,
  order_number text,
  created_at timestamptz,
  neighborhood text,
  delivery_address text,
  delivery_latitude numeric,
  delivery_longitude numeric,
  preferred_delivery_slot text,
  preferred_delivery_date date,
  is_urgent boolean,
  stops jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- Livreur actif uniquement : sinon aucune ligne (ni erreur exploitable).
  if not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'driver'::public.user_role
      and not coalesce(p.is_suspended, false)
  ) then
    return;
  end if;

  return query
  select
    dm.id,
    o.id,
    o.order_number,
    dm.created_at,
    o.neighborhood,
    o.delivery_address,
    o.delivery_latitude,
    o.delivery_longitude,
    o.preferred_delivery_slot,
    o.preferred_delivery_date,
    coalesce(o.is_urgent, false),
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'stop_id', ds.id,
               'shop_id', ds.shop_id,
               'stop_order', ds.stop_order,
               'status', ds.status,
               'picked_up_at', ds.picked_up_at,
               'shop_name', s.name,
               'shop_neighborhood', s.neighborhood,
               'shop_address', s.address_text,
               'shop_latitude', s.latitude,
               'shop_longitude', s.longitude
             ) order by ds.stop_order)
      from public.delivery_stops ds
      left join public.shops s on s.id = ds.shop_id
      where ds.mission_id = dm.id
    ), '[]'::jsonb)
  from public.delivery_missions dm
  join public.orders o on o.id = dm.order_id
  where dm.status = 'available'
    and dm.driver_id is null
  order by dm.created_at desc;
end;
$$;

comment on function public.driver_available_missions() is
  'Ezial Livreur : missions encore disponibles, sans téléphone, e-mail, nom du client ni informations cadeau. Réservée aux livreurs non suspendus.';

-- Supabase accorde EXECUTE à anon et public par défaut : on le retire.
revoke all on function public.driver_available_missions() from public;
revoke all on function public.driver_available_missions() from anon;
grant execute on function public.driver_available_missions() to authenticated;

-- Recharge le cache de PostgREST pour que la fonction soit appelable tout de suite.
notify pgrst, 'reload schema';

commit;

-- ---------------------------------------------------------------------
-- Vérifications (à lancer après l'exécution, lecture seule)
-- ---------------------------------------------------------------------
-- La politique ne doit plus mentionner 'available' :
--   select qual from pg_policies
--   where tablename = 'orders' and policyname = 'drivers_select_orders_for_missions';
-- Droits de la fonction (attendu : authenticated, postgres, service_role ; ni anon ni public) :
--   select proacl from pg_proc where proname = 'driver_available_missions';
