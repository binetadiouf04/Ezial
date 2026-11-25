-- =====================================================================
-- Retour arrière de docs/sql/livreur-telephone-masque.sql
-- =====================================================================
-- Remet la politique de lecture des commandes pour les livreurs telle
-- qu'elle était en production avant le 25 nov. 2026 (tout livreur lit la
-- commande complète d'une mission « available ») et supprime la fonction
-- driver_available_missions().
--
-- ATTENTION : ce retour arrière ré-expose le téléphone, l'e-mail, le nom
-- du client et les informations cadeau à tous les livreurs pour les
-- missions disponibles. À n'utiliser qu'en cas de blocage réel.
-- L'interface Ezial Livreur continue de fonctionner : si la fonction
-- n'existe plus, elle relit les commandes directement (sans jamais
-- afficher le téléphone d'une mission non acceptée).
--
-- Idempotent.
-- =====================================================================

begin;

drop policy if exists drivers_select_orders_for_missions on public.orders;
create policy drivers_select_orders_for_missions
  on public.orders
  for select
  to public
  using (
    exists (
      select 1
      from public.delivery_missions dm
      join public.profiles p on p.id = auth.uid()
      where dm.order_id = orders.id
        and p.role = 'driver'::public.user_role
        and (dm.status = 'available'::text or dm.driver_id = auth.uid())
    )
  );

drop function if exists public.driver_available_missions();

notify pgrst, 'reload schema';

commit;
