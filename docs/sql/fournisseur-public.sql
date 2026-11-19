-- Ezial — fournisseur d'un produit : réservé à Ezial Boutique, nom visible sur la fiche
-- À exécuter une fois dans Supabase → SQL Editor. Non destructif : ne modifie ni ne
-- supprime aucune donnée (les 12 fournisseurs actuels respectent déjà la contrainte).
--
-- Règles :
-- 1. Le champ « Fournisseur » est réservé à la boutique officielle (shops.is_official).
--    DÉJÀ imposé par la base, rien à changer ici :
--    - product_suppliers : RLS activée ; insertion / modification / suppression /
--      lecture réservées au propriétaire d'une boutique officielle (et lecture admin) ;
--    - shops.is_official : verrouillé pour tout non-administrateur (déclencheur
--      lock_shop_privileged_columns, tentative journalisée).
-- 2. Les clients voient le NOM du fournisseur sur la fiche produit, rien d'autre :
--    la table interne reste illisible pour eux ; une fonction serveur ne renvoie que
--    (product_id, nom) pour les produits ACTIFS de la boutique officielle.
-- 3. Seul un nom est accepté : ni téléphone, ni e-mail, ni lien (contrainte).
-- 4. Aucun mode « sur commande » ni précommande : rien d'autre n'est créé.

begin;

alter table public.product_suppliers drop constraint if exists product_suppliers_supplier_name_check;
alter table public.product_suppliers add constraint product_suppliers_supplier_name_check
  check (
    char_length(supplier) between 2 and 80
    and supplier = btrim(supplier)
    and position('@' in supplier) = 0
    and supplier !~* '(https?:|www\.)'
    and char_length(regexp_replace(supplier, '[^0-9]', '', 'g')) < 7
  );

create or replace function public.public_product_suppliers(p_product_ids uuid[] default null)
returns table (product_id uuid, supplier text)
language sql
stable
security definer
set search_path = ''
as $$
  select ps.product_id, ps.supplier
    from public.product_suppliers ps
    join public.products p on p.id = ps.product_id
    join public.shops s on s.id = p.shop_id
   where p.status = 'active'
     and s.status = 'active'
     and s.is_official = true
     and (p_product_ids is null or ps.product_id = any (p_product_ids));
$$;

revoke all on function public.public_product_suppliers(uuid[]) from public;
grant execute on function public.public_product_suppliers(uuid[]) to anon, authenticated;

comment on function public.public_product_suppliers(uuid[]) is
  'Nom public du fournisseur (produits actifs de la boutique officielle uniquement). Ne renvoie jamais d''autre colonne de product_suppliers.';

commit;

-- Vérification : 12 lignes attendues (un fournisseur par produit actif d'Ezial Boutique).
select count(*) as fournisseurs_publics from public.public_product_suppliers();
