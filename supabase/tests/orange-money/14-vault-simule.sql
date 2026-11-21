-- Coffre Supabase (Vault) SIMULÉ pour le banc local : seule la vue lue par payments_internal_secret existe.
-- Les valeurs sont fictives (aucun vrai secret).
create schema if not exists vault;
create table if not exists vault.secrets_test (name text primary key, decrypted_secret text);
create or replace view vault.decrypted_secrets as select name, decrypted_secret from vault.secrets_test;
insert into vault.secrets_test values
  ('payments_reconcile_secret', 'fictif-reconcile'), ('orange_money_callback_api_key', 'fictif-orange'),
  ('wave_webhook_secret', 'fictif-wave'), ('autre_secret', 'fictif-autre') on conflict do nothing;
