-- Boutiques : colonnes privées non lisibles sans connexion (25 nov. 2026)
--
-- Constat : le rôle anon (visiteur non connecté) pouvait lire TOUTES les colonnes
-- des boutiques actives, dont le téléphone du vendeur, l'identifiant de son compte
-- (owner_id), la raison d'une suspension et des champs internes. Le site ne les
-- affiche pas, mais n'importe qui pouvait les lire en appelant l'API.
--
-- Correction : anon ne lit plus que les colonnes publiques. Les utilisateurs
-- connectés (vendeur sur sa propre boutique, admin) gardent l'accès actuel, la RLS
-- continuant de limiter les lignes.
-- seller_code (nom d'utilisateur vendeur) reste lisible : il sert au contrôle
-- « nom déjà pris » pendant l'inscription, avant connexion.
--
-- À exécuter APRÈS la publication du prérendu qui ne lit plus que ces colonnes.
-- Retour arrière : docs/sql/boutiques-colonnes-privees-retour.sql

begin;

revoke select on public.shops from anon;
grant select (
  id, name, slug, description, neighborhood, address_text, logo_url, cover_url,
  status, is_official, pickup_enabled, latitude, longitude, created_at, updated_at,
  seller_code
) on public.shops to anon;

commit;

-- Vérification : doit afficher false pour phone, owner_id, pin_hash, suspension_reason.
select c.column_name, has_column_privilege('anon', 'public.shops', c.column_name, 'SELECT') as lisible_sans_connexion
  from information_schema.columns c
 where c.table_schema = 'public' and c.table_name = 'shops'
 order by c.ordinal_position;
