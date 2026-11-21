-- Ezial — reclassement des produits après la refonte des sous-catégories (21 nov. 2026)
-- À exécuter une fois dans Supabase → SQL Editor. Une seule transaction : en cas
-- d'erreur, RIEN n'est modifié. Aucun produit n'est supprimé, aucun prix, stock,
-- variante ni commande n'est touché : seules la sous-catégorie et les
-- caractéristiques descriptives changent.
--
--   * « Bijou de taille » est regroupé dans « Baya » (le client indiquera son tour
--     de taille, comme pour toute baya) ; la caractéristique « Type : Bijou de
--     taille » disparaît (la sous-catégorie le dit déjà) ;
--   * Pyjamas & Lingerie passe à deux sous-catégories : « Vêtements de nuit » →
--     « Pyjamas & nuisettes » (pyjamas), « Sous-vêtements » → « Lingerie &
--     sous-vêtements » (lingerie) ;
--   * les lunettes reçoivent leur nouvelle caractéristique « Type de lunettes »
--     à la place de l'ancien « Type : Lunettes » (seulement si c'est la valeur
--     actuelle, et seulement pour des lunettes de soleil d'après leur nom).
-- Retour arrière : reclassement-categories-2026-11-retour-arriere.sql

begin;

update public.products
   set subcategory = 'baya', descriptive_attributes = descriptive_attributes - 'Type', updated_at = now()
 where category = 'bijoux' and subcategory = 'bijoux-de-taille';

update public.products
   set subcategory = 'pyjamas', updated_at = now()
 where category = 'lingerie' and subcategory = 'vetements-de-nuit';

update public.products
   set subcategory = 'lingerie', updated_at = now()
 where category = 'lingerie' and subcategory = 'sous-vetements';

update public.products
   set descriptive_attributes = (descriptive_attributes - 'Type') || jsonb_build_object('Type de lunettes', jsonb_build_array('Lunettes de soleil')),
       updated_at = now()
 where category = 'bijoux' and subcategory = 'lunettes'
   and descriptive_attributes -> 'Type' = '["Lunettes"]'::jsonb
   and name ilike '%soleil%';

-- Contrôle : plus aucun produit dans les anciennes sous-catégories.
do $$
begin
  if exists (select 1 from public.products where (category, subcategory) in (('bijoux','bijoux-de-taille'), ('lingerie','vetements-de-nuit'), ('lingerie','sous-vetements'))) then
    raise exception 'Reclassement incomplet : rien n''a été modifié.';
  end if;
end $$;

commit;

-- Vérification (à lancer après) :
-- select category, subcategory, count(*) from public.products where category in ('bijoux','lingerie') group by 1, 2 order by 1, 2;
