-- Ezial — Notes des produits calculées par le serveur (montée en charge)
-- À exécuter une fois dans Supabase → SQL Editor.
--
-- Pourquoi : pour afficher les étoiles sur les cartes, le site envoyait au serveur la
-- liste de TOUS les identifiants de produits dans l'adresse de la requête, puis
-- recalculait les moyennes sur le téléphone. Avec quelques centaines de produits,
-- l'adresse devient trop longue pour être acceptée et les étoiles disparaissent.
-- Cette fonction renvoie directement une ligne par produit noté (moyenne + nombre
-- d'avis publics) : quelques octets, quel que soit le nombre d'avis.
--
-- Sécurité : lecture seule, uniquement des agrégats (aucune ligne d'avis, aucun
-- identifiant d'utilisateur). Seuls les avis visibles publiquement (non masqués) des
-- produits actifs sont comptés, exactement ce que voit un visiteur. Fonction
-- SECURITY DEFINER avec search_path vide, droits explicites (anon et authenticated).
--
-- Sans cette fonction, le site continue de fonctionner (repli par lots d'identifiants).

create or replace function public.public_review_stats()
returns table (product_id uuid, average numeric, review_count bigint)
language sql
stable
security definer
set search_path = ''
as $fn$
  select r.product_id, avg(r.rating)::numeric as average, count(*) as review_count
  from public.reviews r
  join public.products p on p.id = r.product_id and p.status = 'active'
  where r.is_hidden = false
  group by r.product_id
$fn$;

revoke all on function public.public_review_stats() from public;
grant execute on function public.public_review_stats() to anon, authenticated;

-- Vérification : une ligne par produit noté (aujourd'hui : 1 avis).
select * from public.public_review_stats();
