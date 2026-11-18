-- Retour arrière de docs/sql/push-appareils.sql. Les abonnements restent ;
-- seules la fonction d'enregistrement et les deux colonnes ajoutées sont retirées.
-- Le site revient automatiquement à l'enregistrement direct (src/lib/supabasePush.ts).
begin;

drop function if exists public.register_push_subscription(text, text, text, text);
drop index if exists public.push_subscriptions_user_id_idx;
alter table public.push_subscriptions drop column if exists last_seen_at;
alter table public.push_subscriptions drop column if exists user_agent;

commit;
