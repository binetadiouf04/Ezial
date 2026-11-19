-- Ezial — Index manquants sur les liens entre tables (performance à l'échelle)
-- À exécuter une fois dans Supabase → SQL Editor. Sans risque : un index ne change
-- aucune donnée ni aucune règle d'accès ; il accélère seulement les recherches.
--
-- Pourquoi : Postgres ne crée pas d'index automatiquement sur les clés étrangères.
-- Le conseiller de performance Supabase en signale 39. Avec 43 produits et 75 photos
-- cela ne se voit pas ; avec des milliers de produits, chaque lecture des photos, des
-- variantes ou des commandes parcourrait toute la table. Ces index couvrent les
-- lectures les plus fréquentes : photos / variantes / produits d'une boutique, lignes
-- et commandes d'un client, avis, paiements d'abonnement, missions de livraison.
--
-- Idempotent (IF NOT EXISTS) : peut être relancé sans erreur.

create index if not exists product_images_product_id_idx on public.product_images (product_id);
create index if not exists product_variants_product_id_idx on public.product_variants (product_id);
create index if not exists products_shop_id_idx on public.products (shop_id);

create index if not exists order_items_order_id_idx on public.order_items (order_id);
create index if not exists order_items_product_id_idx on public.order_items (product_id);
create index if not exists order_items_shop_id_idx on public.order_items (shop_id);
create index if not exists orders_customer_id_idx on public.orders (customer_id);

create index if not exists review_images_review_id_idx on public.review_images (review_id);
create index if not exists subscription_payments_shop_id_idx on public.subscription_payments (shop_id);
create index if not exists delivery_missions_order_id_idx on public.delivery_missions (order_id);

-- Vérification : 10 lignes attendues.
select tablename, indexname
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'product_images_product_id_idx', 'product_variants_product_id_idx', 'products_shop_id_idx',
    'order_items_order_id_idx', 'order_items_product_id_idx', 'order_items_shop_id_idx',
    'orders_customer_id_idx', 'review_images_review_id_idx',
    'subscription_payments_shop_id_idx', 'delivery_missions_order_id_idx'
  )
order by tablename, indexname;
