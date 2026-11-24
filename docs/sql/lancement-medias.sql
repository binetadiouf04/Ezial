-- Lancement (déc. 2026) : index pour la lecture du catalogue public.
-- FACULTATIF aujourd'hui, utile à la montée en charge. Aucune donnée modifiée.
--
-- Mesure du 24/11/2026 (EXPLAIN ANALYZE, lecture seule) : la liste publique
-- « products where status = 'active' order by created_at, id » lit les 75
-- lignes par un parcours complet en 0,5 ms ; c'est sans importance à cette
-- taille. Au-delà de quelques milliers de produits, cet index permet de lire
-- directement les produits actifs dans l'ordre utilisé par la pagination du
-- site (range par pages de 1 000, voir src/lib/supabasePaging.ts), sans tri.
-- Les autres lectures sont déjà indexées : product_images(product_id),
-- product_variants(product_id), products(shop_id), products(slug),
-- reviews(product_id, user_id).
--
-- À exécuter dans l'éditeur SQL de Supabase. Rejouable. Aucune interface ne
-- dépend de cet index : le site fonctionne de la même façon avec ou sans.

create index if not exists products_active_created_idx
  on public.products (created_at, id)
  where status = 'active';
