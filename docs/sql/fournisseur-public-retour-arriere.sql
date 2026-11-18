-- Retour arrière de fournisseur-public.sql (aucune donnée supprimée).
begin;
drop function if exists public.public_product_suppliers(uuid[]);
alter table public.product_suppliers drop constraint if exists product_suppliers_supplier_name_check;
commit;
