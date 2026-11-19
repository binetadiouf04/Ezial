-- Retour arrière de index-performance.sql (supprime uniquement les index ajoutés).
drop index if exists public.product_images_product_id_idx;
drop index if exists public.product_variants_product_id_idx;
drop index if exists public.products_shop_id_idx;
drop index if exists public.order_items_order_id_idx;
drop index if exists public.order_items_product_id_idx;
drop index if exists public.order_items_shop_id_idx;
drop index if exists public.orders_customer_id_idx;
drop index if exists public.review_images_review_id_idx;
drop index if exists public.subscription_payments_shop_id_idx;
drop index if exists public.delivery_missions_order_id_idx;
