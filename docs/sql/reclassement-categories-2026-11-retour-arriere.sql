-- Ezial — retour arrière du reclassement du 21 nov. 2026 (reclassement-categories-2026-11.sql)
-- Remet exactement les produits concernés à leur état d'avant, d'après leurs
-- identifiants relevés le 21 nov. 2026 (les produits créés depuis ne sont pas touchés).
-- À n'utiliser qu'avec l'ancienne version du site (anciennes sous-catégories).

begin;

update public.products
   set subcategory = 'bijoux-de-taille',
       descriptive_attributes = descriptive_attributes || jsonb_build_object('Type', jsonb_build_array('Bijou de taille')),
       updated_at = now()
 where id = '53b1dc73-bd30-4137-85e1-e6cb2139bf1f' and subcategory = 'baya';

update public.products
   set subcategory = 'vetements-de-nuit', updated_at = now()
 where id in ('4c81e624-3e5d-48cd-afd9-572e1d12d05d', 'bd52ba18-e2d4-4a1c-ae15-f06211820782') and subcategory = 'pyjamas';

update public.products
   set descriptive_attributes = (descriptive_attributes - 'Type de lunettes') || jsonb_build_object('Type', jsonb_build_array('Lunettes')),
       updated_at = now()
 where id = 'da7b4613-356a-4db9-a263-d1e8c2168af0';

commit;
