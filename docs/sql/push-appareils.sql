-- Ezial — notifications Web Push : enregistrement fiable des appareils.
-- PROPOSITION, NON EXÉCUTÉE. À lancer par la propriétaire dans Supabase
-- (SQL Editor) quand elle le décide. Rejouable, une transaction, aucune
-- suppression de données, aucun envoi déclenché.
--
-- Ce que ça change :
--   1. push_subscriptions garde l'appareil (navigateur) et la date du dernier
--      enregistrement (user_agent, last_seen_at) : utile pour l'assistance et
--      pour repérer les abonnements abandonnés.
--   2. public.register_push_subscription() : rattache l'appareil au compte
--      CONNECTÉ (auth.uid()), y compris s'il était lié à un autre compte avant
--      (téléphone partagé, changement de compte). Sans cette fonction, la RLS
--      refuse la mise à jour d'une ligne appartenant à un autre compte et
--      l'activation échoue. Le site l'utilise automatiquement dès qu'elle existe
--      (src/lib/supabasePush.ts), sinon il garde l'enregistrement actuel.
--
-- Ce que ça ne change pas : les déclencheurs de notification, push_notify,
-- les fonctions send-push / send-push-campaign, les règles d'accès existantes.
-- Retour arrière : docs/sql/push-appareils-retour-arriere.sql
begin;

alter table public.push_subscriptions add column if not exists user_agent text;
alter table public.push_subscriptions add column if not exists last_seen_at timestamptz not null default now();

create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

create or replace function public.register_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Connexion requise.' using errcode = '42501';
  end if;
  -- Un abonnement Web Push est une adresse https fournie par le navigateur
  -- (Apple, Google, Mozilla…) et deux clés publiques : rien d'autre n'est accepté.
  if p_endpoint is null or p_endpoint !~ '^https://' or length(p_endpoint) > 1000
     or coalesce(length(p_p256dh), 0) not between 20 and 200
     or coalesce(length(p_auth), 0) not between 10 and 100 then
    raise exception 'Abonnement invalide.' using errcode = 'P0001';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, last_seen_at)
  values (v_uid, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300), now())
  on conflict (endpoint) do update
     set user_id = excluded.user_id,
         p256dh = excluded.p256dh,
         auth = excluded.auth,
         user_agent = excluded.user_agent,
         last_seen_at = now();
end;
$$;

revoke all on function public.register_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text, text) to authenticated;

commit;

-- Vérification : 3 lignes « ok » attendues.
select 'fonction d''enregistrement réservée aux comptes connectés' as element,
       case when has_function_privilege('authenticated', 'public.register_push_subscription(text, text, text, text)', 'execute')
             and not has_function_privilege('anon', 'public.register_push_subscription(text, text, text, text)', 'execute')
            then 'ok' else 'À VÉRIFIER' end as etat
union all
select 'colonnes appareil ajoutées',
       case when (select count(*) from information_schema.columns
                   where table_schema = 'public' and table_name = 'push_subscriptions'
                     and column_name in ('user_agent', 'last_seen_at')) = 2 then 'ok' else 'À VÉRIFIER' end
union all
select 'abonnements existants conservés',
       case when (select count(*) from public.push_subscriptions) >= 0 then 'ok' else 'À VÉRIFIER' end;
