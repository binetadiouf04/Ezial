-- ============================================================================
-- Orange Money — migration 6 : CLÉS INTERNES LUES DANS LE COFFRE (Vault)
-- Les fonctions Edge lisent elles-mêmes, dans le coffre Supabase, la clé de
-- callback Orange et le secret de la vérification périodique : plus aucune
-- copie à la main (source d'erreurs), et personne n'a besoin de les voir.
-- Seul le serveur (service_role) peut appeler cette fonction ; uniquement
-- ces deux noms de clés, rien d'autre du coffre.
-- Sûre à relancer. Retour arrière : drop function public.payments_internal_secret(text);
-- ============================================================================
create or replace function public.payments_internal_secret(p_name text) returns text
language sql stable security definer set search_path = '' as $$
  select s.decrypted_secret from vault.decrypted_secrets s
  where s.name = p_name and p_name in ('payments_reconcile_secret', 'orange_money_callback_api_key');
$$;
revoke execute on function public.payments_internal_secret(text) from public, anon, authenticated;
grant execute on function public.payments_internal_secret(text) to service_role;
