-- Ezial — fournisseur public et disponibilité des produits (En stock / Sur commande)
-- À exécuter une fois dans Supabase → SQL Editor. Non destructif : ajoute des
-- colonnes, des contraintes et un déclencheur ; ne modifie aucune donnée existante.
--
-- - products.public_supplier : nom du fournisseur AFFICHÉ aux clients (facultatif).
--   Distinct de product_suppliers.supplier (champ interne d'EZIAL), qui reste
--   privé et n'est PAS recopié : aucun fournisseur existant ne devient public.
-- - products.availability_mode : 'in_stock' (par défaut, tous les produits
--   existants) ou 'on_order' (approvisionnement ou fabrication après commande).
-- - products.preparation_days : délai de préparation, obligatoire pour 'on_order'
--   (1 à 60 jours), toujours vide pour 'in_stock'.
-- - order_items.availability_mode / preparation_days : copie au moment de la
--   commande (le vendeur, l'admin et le client gardent le délai annoncé même si
--   le produit change ensuite). Remplie par un déclencheur : create_order() et
--   le paiement ne sont pas modifiés.

begin;

alter table public.products
  add column if not exists public_supplier text,
  add column if not exists availability_mode text not null default 'in_stock',
  add column if not exists preparation_days smallint;

alter table public.products drop constraint if exists products_availability_mode_check;
alter table public.products add constraint products_availability_mode_check
  check (availability_mode in ('in_stock', 'on_order'));

alter table public.products drop constraint if exists products_preparation_days_check;
alter table public.products add constraint products_preparation_days_check
  check (
    (availability_mode = 'on_order' and preparation_days between 1 and 60)
    or (availability_mode = 'in_stock' and preparation_days is null)
  );

-- Un nom seulement : ni e-mail, ni lien, ni numéro de téléphone (7 chiffres ou plus).
alter table public.products drop constraint if exists products_public_supplier_check;
alter table public.products add constraint products_public_supplier_check
  check (
    public_supplier is null or (
      char_length(public_supplier) between 2 and 80
      and public_supplier = btrim(public_supplier)
      and position('@' in public_supplier) = 0
      and public_supplier !~* '(https?:|www\.)'
      and char_length(regexp_replace(public_supplier, '[^0-9]', '', 'g')) < 7
    )
  );

alter table public.order_items
  add column if not exists availability_mode text,
  add column if not exists preparation_days smallint;

create or replace function ezial_private.snapshot_order_item_availability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode text;
  v_days smallint;
begin
  select p.availability_mode, p.preparation_days
    into v_mode, v_days
    from public.products p
   where p.id = new.product_id;
  new.availability_mode := coalesce(v_mode, 'in_stock');
  new.preparation_days := case when v_mode = 'on_order' then v_days else null end;
  return new;
end;
$$;

revoke all on function ezial_private.snapshot_order_item_availability() from public, anon, authenticated;

drop trigger if exists trg_snapshot_order_item_availability on public.order_items;
create trigger trg_snapshot_order_item_availability
  before insert on public.order_items
  for each row execute function ezial_private.snapshot_order_item_availability();

commit;

-- Vérification (doit afficher 3 lignes « products » et 2 « order_items ») :
select table_name, column_name, data_type, column_default
  from information_schema.columns
 where table_schema = 'public'
   and ((table_name = 'products' and column_name in ('public_supplier', 'availability_mode', 'preparation_days'))
     or (table_name = 'order_items' and column_name in ('availability_mode', 'preparation_days')))
 order by table_name, column_name;
