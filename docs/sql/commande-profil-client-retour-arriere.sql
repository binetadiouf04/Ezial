-- Retour arrière de docs/sql/commande-profil-client.sql : retire le
-- déclencheur. Les lignes profiles déjà créées sont conservées (les supprimer
-- casserait les commandes passées entre-temps). Après ce retour arrière, un
-- NOUVEAU client ne pourra de nouveau plus commander.
begin;
drop trigger if exists trg_ensure_profile_for_customer on public.customer_profiles;
drop function if exists ezial_private.ensure_profile_for_customer();
commit;
