-- ============================================================================
-- Ezial — Campagnes promotionnelles — RETOUR ARRIÈRE de la MIGRATION 3 (promotions-3-admin.sql)
-- QUOI : retire les fonctions d'administration et la fonction vendeur des campagnes (aucune n'existait
--   avant : rien à restaurer). Aucune donnée n'est supprimée.
-- REFUSÉ si une commande non annulée utilise encore une campagne : l'administratrice ne pourrait plus
--   suivre ni payer les compensations dues.
-- ORDRE : 3, puis 2 (promotions-2-retour-arriere.sql), puis 1 (promotions-1-retour-arriere.sql).
-- ============================================================================
begin;

do $$
begin
  if to_regclass('public.promotion_redemptions') is not null and exists (
       select 1 from public.promotion_redemptions r join public.orders o on o.id = r.order_id
        where r.status = 'counted' and o.status <> 'cancelled') then
    raise exception 'Des commandes non annulées utilisent encore une campagne : retour arrière refusé (rien n''a été modifié).';
  end if;
end $$;

drop function if exists public.admin_promotions_list();
drop function if exists public.admin_promotion_save(jsonb);
drop function if exists public.admin_promotion_set_status(uuid, text);
drop function if exists public.admin_promotion_compensations(text);
drop function if exists public.admin_mark_compensations_paid(uuid[], text, text, text);
drop function if exists public.seller_promotion_compensations(uuid);
drop function if exists ezial_private.promotions_assert_admin();

commit;
