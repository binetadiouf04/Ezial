-- ============================================================================
-- Ezial — Campagnes promotionnelles — RETOUR ARRIÈRE de la MIGRATION 1 (promotions-1-structure.sql)
-- QUOI : supprime les tables des campagnes, des parts vendeurs, des utilisations et des compensations, et les
--   colonnes orders.promotion_id / promo_discount / delivery_discount et order_shops.promo_compensation / promo_seller_share.
--   IRRÉVERSIBLE : l'historique des campagnes est perdu. public.promo_codes (ancien code EZI10) n'a jamais
--   été modifiée et reste en place.
-- REFUSÉ (rien n'est modifié) :
--   * si les retours arrière 3 et 2 n'ont pas été exécutés avant ;
--   * si une commande non annulée utilise encore une campagne ;
--   * si une compensation a déjà été PAYÉE à une boutique (trace comptable à conserver : l'exporter avant,
--     puis la supprimer à la main si c'est vraiment voulu).
-- ============================================================================
begin;

do $$
begin
  if position('promotion_apply_to_order' in pg_get_functiondef('public.create_order(jsonb)'::regprocedure)) > 0
     or to_regprocedure('public.promotions_preview(jsonb)') is not null then
    raise exception 'Exécutez d''abord docs/sql/promotions-2-retour-arriere.sql : retour arrière refusé (rien n''a été modifié).';
  end if;
  if to_regprocedure('public.admin_promotions_list()') is not null then
    raise exception 'Exécutez d''abord docs/sql/promotions-3-retour-arriere.sql : retour arrière refusé (rien n''a été modifié).';
  end if;
  if to_regclass('public.promotion_redemptions') is not null and exists (
       select 1 from public.promotion_redemptions r join public.orders o on o.id = r.order_id
        where r.status = 'counted' and o.status <> 'cancelled') then
    raise exception 'Des commandes non annulées utilisent encore une campagne : retour arrière refusé (rien n''a été modifié).';
  end if;
  if to_regclass('public.promotion_compensations') is not null and exists (select 1 from public.promotion_compensations where status = 'paid') then
    raise exception 'Des compensations ont déjà été payées aux boutiques : retour arrière refusé pour conserver leur trace (rien n''a été modifié).';
  end if;
end $$;

alter table public.orders drop constraint if exists orders_promo_discounts_check;
alter table public.order_shops drop constraint if exists order_shops_promo_compensation_check;
drop index if exists public.orders_promotion_idx;
alter table public.orders drop column if exists promotion_id, drop column if exists promo_discount, drop column if exists delivery_discount;
alter table public.order_shops drop column if exists promo_compensation, drop column if exists promo_seller_share;
drop table if exists public.promotion_compensations;
drop table if exists public.promotion_redemptions;
drop table if exists public.promotion_seller_shares;
drop table if exists public.promotion_targets;
drop table if exists public.promotions;
drop function if exists ezial_private.trg_promotions_guard();

commit;
