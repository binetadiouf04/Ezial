-- Retour arrière de fournisseur-public-disponibilite.sql.
-- ATTENTION : supprime les fournisseurs publics, modes de disponibilité et délais
-- saisis depuis la mise en place. Le champ interne product_suppliers n'est pas touché.
begin;
drop trigger if exists trg_snapshot_order_item_availability on public.order_items;
drop function if exists ezial_private.snapshot_order_item_availability();
alter table public.order_items drop column if exists availability_mode, drop column if exists preparation_days;
alter table public.products drop constraint if exists products_public_supplier_check;
alter table public.products drop constraint if exists products_preparation_days_check;
alter table public.products drop constraint if exists products_availability_mode_check;
alter table public.products drop column if exists public_supplier, drop column if exists availability_mode, drop column if exists preparation_days;
commit;
