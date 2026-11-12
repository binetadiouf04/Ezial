-- Ezial — accès Ezial Plus OFFERTS par l'administration (3 ou 6 mois).
-- Ajoute une table d'historique (premium_grants), trois fonctions réservées
-- aux administrateurs (offrir, prolonger, mettre fin), l'expiration
-- automatique (dans le traitement horaire déjà en place) et protège l'essai
-- standard de 30 jours. Réutilise seller_subscriptions (plan, pro_until) :
-- la commission de 8 %, la limite de 30 produits et le badge fonctionnent donc
-- exactement comme pour l'essai et l'abonnement payant, sans toucher à ces règles.
-- Priorité des droits : abonnement payant valide > accès offert > essai
-- standard > Free. Un accès offert ne remplace JAMAIS un abonnement payant
-- valide, et ne réinitialise ni ne consomme l'essai de 30 jours.
-- Aucune donnée existante n'est modifiée ni supprimée. Rejouable, une transaction.
begin;

-- =====================================================================
-- 1. Table des accès offerts (historique et statut)
-- =====================================================================
create table if not exists public.premium_grants (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  granted_months smallint not null check (granted_months in (3, 6)),
  starts_at timestamptz not null,
  ends_at timestamptz not null,                 -- fin actuelle (déplacée par une prolongation)
  original_ends_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'expired', 'ended_early')),
  reason text,
  granted_by uuid not null,
  prior_pro_until timestamptz,                  -- fin de l'essai standard en cours à l'octroi, rétablie si l'accès est interrompu
  extended_months smallint not null default 0,
  ended_at timestamptz,
  ended_by uuid,
  end_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists premium_grants_one_active_per_shop on public.premium_grants (shop_id) where status = 'active';
create index if not exists premium_grants_shop_idx on public.premium_grants (shop_id, created_at desc);
create index if not exists premium_grants_due_idx on public.premium_grants (ends_at) where status = 'active';

alter table public.premium_grants enable row level security;
revoke all on public.premium_grants from anon, authenticated;
grant select on public.premium_grants to authenticated;
drop policy if exists premium_grants_admin_select on public.premium_grants;
create policy premium_grants_admin_select on public.premium_grants for select to authenticated
  using (exists (select 1 from public.admins a where a.user_id = (select auth.uid())));
drop policy if exists premium_grants_owner_select on public.premium_grants;
create policy premium_grants_owner_select on public.premium_grants for select to authenticated
  using (exists (select 1 from public.shops s where s.id = shop_id and s.owner_id = (select auth.uid())));

-- =====================================================================
-- 2. Offrir un accès (administrateur)
-- =====================================================================
create or replace function public.admin_grant_premium(p_shop_id uuid, p_months integer, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  sh public.shops; sub public.seller_subscriptions; g public.premium_grants;
  v_start timestamptz := now(); v_end timestamptz; v_active_pro boolean; v_prior timestamptz; v_id uuid;
begin
  if not exists (select 1 from public.admins a where a.user_id = (select auth.uid())) then
    raise exception 'Accès refusé.' using errcode = 'P0001';
  end if;
  if p_months not in (3, 6) then raise exception 'Choisissez 3 ou 6 mois.' using errcode = 'P0001'; end if;
  select * into sh from public.shops where id = p_shop_id;
  if sh.id is null or sh.status = 'deleted' then raise exception 'Boutique introuvable.' using errcode = 'P0001'; end if;
  if coalesce(sh.is_official, false) then raise exception 'La boutique officielle Ezial est déjà toujours Ezial Plus.' using errcode = 'P0001'; end if;

  select * into sub from public.seller_subscriptions where shop_id = p_shop_id for update;
  select * into g from public.premium_grants where shop_id = p_shop_id and status = 'active';
  if g.id is not null then
    raise exception 'Un accès offert est déjà actif jusqu''au % : prolongez-le plutôt.', to_char(g.ends_at, 'DD/MM/YYYY') using errcode = 'P0001';
  end if;
  if sub.id is not null and sub.plan = 'pro' and sub.pro_until is not null and sub.pro_until > now() and sub.billing_period is not null then
    raise exception 'Cette boutique a déjà un abonnement Ezial Plus payant valide jusqu''au % : il ne peut pas être remplacé. Offrez l''accès après cette date.', to_char(sub.pro_until, 'DD/MM/YYYY') using errcode = 'P0001';
  end if;

  v_end := v_start + make_interval(months => p_months);
  v_active_pro := sub.id is not null and sub.plan = 'pro' and sub.pro_until is not null and sub.pro_until > now();   -- essai standard en cours
  v_prior := case when v_active_pro then sub.pro_until end;

  if sub.id is null then
    insert into public.seller_subscriptions (shop_id, plan, pro_until, pro_started_at, plan_chosen)
    values (p_shop_id, 'pro', v_end, v_start, true);
  else
    update public.seller_subscriptions
       set plan = 'pro', pro_until = greatest(v_end, coalesce(v_prior, v_end)),
           pro_started_at = case when v_active_pro then pro_started_at else v_start end,
           billing_period = null, expiry_warned_at = null, cancel_requested_at = null, plan_chosen = true, updated_at = now()
     where shop_id = p_shop_id;
    -- trial_used / trial_start / trial_end / premium_paid_ever : inchangés (l'essai standard n'est ni consommé ni réinitialisé).
  end if;

  insert into public.premium_grants (shop_id, granted_months, starts_at, ends_at, original_ends_at, reason, granted_by, prior_pro_until)
  values (p_shop_id, p_months, v_start, v_end, v_end, nullif(left(trim(p_reason), 300), ''), (select auth.uid()), v_prior)
  returning id into v_id;

  perform ezial_private.audit('admin', 'premium_grant_created', 'premium_grant', v_id,
    jsonb_build_object('shop_id', p_shop_id, 'months', p_months, 'starts_at', v_start, 'ends_at', v_end, 'reason', nullif(left(trim(p_reason), 300), ''), 'prior_pro_until', v_prior));
  if sh.owner_id is not null then
    perform public.notify_user(sh.owner_id, 'premium_grant_started', 'Ezial Plus offert',
      'Ezial vous offre l''accès Ezial Plus jusqu''au ' || to_char(v_end, 'DD/MM/YYYY') || ' : jusqu''à 30 produits publiés et commission de 8 %. Aucun paiement n''est demandé.',
      '/pro/seller/abonnement', null, null, null, p_shop_id);
  end if;
  return jsonb_build_object('grantId', v_id, 'startsAt', v_start, 'endsAt', v_end);
end;
$$;

-- =====================================================================
-- 3. Prolonger / mettre fin (administrateur)
-- =====================================================================
create or replace function public.admin_extend_premium_grant(p_grant_id uuid, p_months integer, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare g public.premium_grants; sub public.seller_subscriptions; v_new timestamptz; v_owner uuid;
begin
  if not exists (select 1 from public.admins a where a.user_id = (select auth.uid())) then
    raise exception 'Accès refusé.' using errcode = 'P0001';
  end if;
  if p_months not in (3, 6) then raise exception 'Choisissez 3 ou 6 mois.' using errcode = 'P0001'; end if;
  select * into g from public.premium_grants where id = p_grant_id for update;
  if g.id is null or g.status <> 'active' then raise exception 'Seul un accès offert encore actif peut être prolongé.' using errcode = 'P0001'; end if;
  select * into sub from public.seller_subscriptions where shop_id = g.shop_id for update;
  if sub.id is null or sub.billing_period is not null then
    raise exception 'Cette boutique a souscrit un abonnement payant : l''accès offert ne peut plus être prolongé. Il prendra fin le % sans effet sur son abonnement.', to_char(g.ends_at, 'DD/MM/YYYY') using errcode = 'P0001';
  end if;

  v_new := g.ends_at + make_interval(months => p_months);
  update public.premium_grants set ends_at = v_new, extended_months = (g.extended_months + p_months)::smallint, updated_at = now() where id = g.id;
  update public.seller_subscriptions set pro_until = greatest(coalesce(pro_until, v_new), v_new), expiry_warned_at = null, updated_at = now() where shop_id = g.shop_id;

  perform ezial_private.audit('admin', 'premium_grant_extended', 'premium_grant', g.id,
    jsonb_build_object('shop_id', g.shop_id, 'months', p_months, 'previous_ends_at', g.ends_at, 'ends_at', v_new, 'reason', nullif(left(trim(p_reason), 300), '')));
  select owner_id into v_owner from public.shops where id = g.shop_id;
  if v_owner is not null then
    perform public.notify_user(v_owner, 'premium_grant_extended', 'Ezial Plus offert prolongé',
      'Votre accès Ezial Plus offert est prolongé jusqu''au ' || to_char(v_new, 'DD/MM/YYYY') || '. Aucun paiement n''est demandé.',
      '/pro/seller/abonnement', null, null, null, g.shop_id);
  end if;
  return jsonb_build_object('endsAt', v_new);
end;
$$;

create or replace function public.admin_end_premium_grant(p_grant_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare g public.premium_grants; sub public.seller_subscriptions; sh public.shops; v_keep boolean; v_unpublished integer := 0;
begin
  if not exists (select 1 from public.admins a where a.user_id = (select auth.uid())) then
    raise exception 'Accès refusé.' using errcode = 'P0001';
  end if;
  select * into g from public.premium_grants where id = p_grant_id for update;
  if g.id is null or g.status <> 'active' then raise exception 'Seul un accès offert encore actif peut être interrompu.' using errcode = 'P0001'; end if;
  select * into sub from public.seller_subscriptions where shop_id = g.shop_id for update;
  if sub.id is null or sub.billing_period is not null then
    raise exception 'Cette boutique a souscrit un abonnement payant : l''accès offert ne peut plus être interrompu. Il prendra fin le % sans effet sur son abonnement.', to_char(g.ends_at, 'DD/MM/YYYY') using errcode = 'P0001';
  end if;
  select * into sh from public.shops where id = g.shop_id;

  -- L'essai standard qui était en cours avant l'octroi est rétabli s'il court encore.
  v_keep := g.prior_pro_until is not null and g.prior_pro_until > now();
  update public.premium_grants set status = 'ended_early', ended_at = now(), ended_by = (select auth.uid()), end_reason = nullif(left(trim(p_reason), 300), ''), updated_at = now() where id = g.id;
  if v_keep then
    update public.seller_subscriptions set pro_until = g.prior_pro_until, expiry_warned_at = null, updated_at = now() where shop_id = g.shop_id;
  else
    update public.seller_subscriptions set plan = 'free', pro_until = now(), expiry_warned_at = null, downgraded_at = now(), updated_at = now() where shop_id = g.shop_id;
    v_unpublished := ezial_private.unpublish_products_over_limit(g.shop_id, 10);
  end if;

  perform ezial_private.audit('admin', 'premium_grant_ended', 'premium_grant', g.id,
    jsonb_build_object('shop_id', g.shop_id, 'back_to_free', not v_keep, 'unpublished', v_unpublished, 'reason', nullif(left(trim(p_reason), 300), '')));
  if sh.owner_id is not null then
    perform public.notify_user(sh.owner_id, 'premium_grant_ended', 'Accès Ezial Plus offert terminé',
      case when v_keep then 'Votre accès Ezial Plus offert a pris fin ; votre essai Ezial Plus en cours continue jusqu''à sa date de fin.'
           else 'Votre accès Ezial Plus offert a pris fin : votre boutique est repassée au forfait Free (10 produits publiés, commission de 10 % sur les nouvelles ventes).'
                || case when v_unpublished > 0 then ' ' || v_unpublished || case when v_unpublished > 1 then ' produits ont été mis hors ligne' else ' produit a été mis hors ligne' end || ' (rien n''est supprimé) : choisissez ceux à garder en ligne dans « Produits ».' else '' end
                || ' Aucun prélèvement n''a été effectué.' end,
      case when v_unpublished > 0 then '/pro/seller/produits/selection' else '/pro/seller/abonnement' end, null, null, null, g.shop_id);
  end if;
  return jsonb_build_object('status', 'ended_early', 'backToFree', not v_keep);
end;
$$;

revoke all on function public.admin_grant_premium(uuid, integer, text), public.admin_extend_premium_grant(uuid, integer, text),
  public.admin_end_premium_grant(uuid, text) from public, anon;
grant execute on function public.admin_grant_premium(uuid, integer, text), public.admin_extend_premium_grant(uuid, integer, text),
  public.admin_end_premium_grant(uuid, text) to authenticated;

-- =====================================================================
-- 4. L'essai standard ne peut plus raccourcir un accès offert ni un abonnement payant
-- =====================================================================
create or replace function public.activate_seller_trial(p_shop_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_launch constant timestamptz := '2026-12-12 00:00:00+00';
  v_owner uuid; v_trial_used boolean; v_trial_start timestamptz; v_trial_end timestamptz; v_rows_affected integer;
begin
  select owner_id into v_owner from public.shops where id = p_shop_id;
  if v_owner is null or v_owner <> auth.uid() then raise exception 'Boutique introuvable ou accès refusé.'; end if;
  select trial_used into v_trial_used from public.seller_subscriptions where shop_id = p_shop_id;
  if coalesce(v_trial_used, false) then return jsonb_build_object('alreadyUsed', true); end if;

  -- Un accès offert ou un abonnement payant valide ne doit jamais être écrasé.
  if exists (select 1 from public.premium_grants g where g.shop_id = p_shop_id and g.status = 'active') then
    raise exception 'Votre boutique bénéficie déjà d''un accès Ezial Plus offert.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.seller_subscriptions ss where ss.shop_id = p_shop_id and ss.plan = 'pro' and ss.pro_until > now() and ss.billing_period is not null) then
    raise exception 'Votre boutique a déjà un abonnement Ezial Plus actif.' using errcode = 'P0001';
  end if;

  v_trial_start := case when now() < v_launch then v_launch else now() end;
  v_trial_end := v_trial_start + interval '30 days';

  insert into public.seller_subscriptions (shop_id, plan, trial_used, trial_start, trial_end, pro_until, pro_started_at, plan_chosen)
  values (p_shop_id, 'pro', true, v_trial_start, v_trial_end, v_trial_end, v_trial_start, true)
  on conflict (shop_id) do update set
    plan = 'pro', trial_used = true, trial_start = v_trial_start, trial_end = v_trial_end,
    pro_until = v_trial_end, pro_started_at = v_trial_start, expiry_warned_at = null, updated_at = now(), plan_chosen = true
  where public.seller_subscriptions.trial_used = false;

  get diagnostics v_rows_affected = row_count;
  if v_rows_affected = 0 then return jsonb_build_object('alreadyUsed', true); end if;

  perform public.notify_user(v_owner, 'subscription_trial_activated', 'Essai Ezial Plus activé',
    'Votre essai gratuit de 30 jours est actif jusqu''au ' || to_char(v_trial_end, 'DD/MM/YYYY') || '.',
    '/pro/seller/abonnement', null, null, null, p_shop_id);
  return jsonb_build_object('trialEnd', v_trial_end);
end;
$function$;

-- =====================================================================
-- 5. Expiration automatique (traitement horaire existant)
-- =====================================================================
create or replace function public.process_subscription_expirations()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_row record; v_unpublished integer; v_gift record;
begin
  -- 0. Fin des accès Ezial Plus offerts : abonnement payant (ou autre période) encore
  --    valide → Premium conservé ; sinon retour automatique à Free, sans prélèvement.
  for v_gift in
    select g.id as grant_id, g.shop_id, g.ends_at, s.owner_id, s.name as shop_name, coalesce(s.is_official, false) as is_official,
           ss.pro_until, ss.billing_period
      from public.premium_grants g
      join public.shops s on s.id = g.shop_id
      left join public.seller_subscriptions ss on ss.shop_id = g.shop_id
     where g.status = 'active' and g.ends_at <= now()
  loop
    if v_gift.pro_until is not null and v_gift.pro_until > now() then
      update public.premium_grants set status = 'expired', ended_at = v_gift.ends_at, updated_at = now() where id = v_gift.grant_id;
      perform ezial_private.audit('system', 'premium_grant_expired', 'premium_grant', v_gift.grant_id,
        jsonb_build_object('shop_id', v_gift.shop_id, 'back_to_free', false, 'paid_subscription', v_gift.billing_period is not null));
    else
      update public.seller_subscriptions set plan = 'free', billing_period = null, expiry_warned_at = null, downgraded_at = now(), updated_at = now() where shop_id = v_gift.shop_id;
      v_unpublished := case when v_gift.is_official then 0 else ezial_private.unpublish_products_over_limit(v_gift.shop_id, 10) end;
      update public.premium_grants set status = 'expired', ended_at = v_gift.ends_at, updated_at = now() where id = v_gift.grant_id;
      perform ezial_private.audit('system', 'premium_grant_expired', 'premium_grant', v_gift.grant_id,
        jsonb_build_object('shop_id', v_gift.shop_id, 'back_to_free', true, 'unpublished', v_unpublished));
      if v_gift.owner_id is not null then
        perform public.notify_user(v_gift.owner_id, 'subscription_expired', 'Votre accès Ezial Plus offert est terminé',
          'Votre boutique "' || coalesce(v_gift.shop_name, '') || '" est repassée au forfait Free : 10 produits publiés maximum et commission de 10 % sur les nouvelles ventes. Aucun prélèvement n''a été effectué.'
            || case when v_unpublished > 0 then ' ' || v_unpublished || case when v_unpublished > 1 then ' produits ont été mis hors ligne' else ' produit a été mis hors ligne' end
                 || ' (rien n''est supprimé) : choisissez à tout moment lesquels garder en ligne, dans « Produits ».' else '' end
            || ' Vous pouvez vous abonner à Ezial Plus à tout moment.',
          case when v_unpublished > 0 then '/pro/seller/produits/selection' else '/pro/seller/abonnement' end,
          null, null, null, v_gift.shop_id);
      end if;
    end if;
  end loop;

  -- 1. Rappels sept jours avant la fin.
  for v_row in
    select ss.id, ss.shop_id, ss.pro_until, ss.billing_period, s.owner_id, s.name as shop_name,
           exists (select 1 from public.premium_grants g where g.shop_id = ss.shop_id and g.status = 'active') as has_gift
      from public.seller_subscriptions ss join public.shops s on s.id = ss.shop_id
     where ss.plan = 'pro' and ss.pro_until is not null and ss.pro_until > now()
       and ss.pro_until <= now() + interval '7 days' and ss.expiry_warned_at is null and ss.cancel_requested_at is null
  loop
    if v_row.has_gift and v_row.billing_period is null then
      perform public.notify_user(v_row.owner_id, 'subscription_expiring_soon', 'Votre accès Ezial Plus offert se termine bientôt',
        'Votre accès Ezial Plus offert pour "' || coalesce(v_row.shop_name, 'votre boutique') || '" se termine le '
          || to_char(v_row.pro_until, 'DD/MM/YYYY') || '. Ensuite, la boutique repasse à Ezial Free (10 produits publiés, commission de 10 %), sans aucun prélèvement. Abonnez-vous pour conserver vos 30 produits et vos avantages.',
        '/pro/seller/abonnement', null, null, null, v_row.shop_id);
    elsif v_row.billing_period is null then
      perform public.notify_user(v_row.owner_id, 'subscription_expiring_soon', 'Votre essai Ezial Plus se termine bientôt',
        'Votre essai Ezial Plus pour "' || coalesce(v_row.shop_name, 'votre boutique') || '" se termine le '
          || to_char(v_row.pro_until, 'DD/MM/YYYY') || '. Abonnez-vous (tous les 3 mois ou à l''année) pour conserver vos 30 produits et vos avantages. Sans abonnement, seuls 10 produits resteront en ligne.',
        '/pro/seller/abonnement', null, null, null, v_row.shop_id);
    else
      perform public.notify_user(v_row.owner_id, 'subscription_expiring_soon', 'Votre abonnement Ezial Plus expire bientôt',
        'Votre abonnement Ezial Plus ' || case v_row.billing_period when 'annual' then 'annuel' else 'trimestriel' end
          || ' pour "' || coalesce(v_row.shop_name, 'votre boutique') || '" expire le '
          || to_char(v_row.pro_until, 'DD/MM/YYYY') || '. Renouvelez pour conserver vos 30 produits et vos avantages.',
        '/pro/seller/abonnement', null, null, null, v_row.shop_id);
    end if;
    update public.seller_subscriptions set expiry_warned_at = now() where id = v_row.id;
  end loop;

  -- 2. Fin d'essai / d'abonnement payant (inchangé).
  for v_row in
    select ss.id, ss.shop_id, ss.pro_until, ss.premium_paid_ever, ss.billing_period, s.owner_id, s.name as shop_name,
           coalesce(s.is_official, false) as is_official
      from public.seller_subscriptions ss join public.shops s on s.id = ss.shop_id
     where ss.plan = 'pro' and ss.pro_until is not null and ss.pro_until <= now()
       and (ss.downgraded_at is null or ss.downgraded_at < ss.pro_until)
  loop
    v_unpublished := case when v_row.is_official then 0 else ezial_private.unpublish_products_over_limit(v_row.shop_id, 10) end;

    if v_row.premium_paid_ever then
      update public.seller_subscriptions set expiry_warned_at = null, downgraded_at = now(), updated_at = now() where id = v_row.id;
    else
      update public.seller_subscriptions set plan = 'free', expiry_warned_at = null, downgraded_at = now(), updated_at = now() where id = v_row.id;
    end if;

    perform public.notify_user(v_row.owner_id, 'subscription_expired',
      case when v_row.billing_period is null and not v_row.premium_paid_ever then 'Votre essai Ezial Plus est terminé' else 'Votre abonnement Ezial Plus a expiré' end,
      'Votre boutique "' || coalesce(v_row.shop_name, '') || '" est repassée au forfait Free : 10 produits publiés maximum et commission de 10 % sur les nouvelles ventes.'
        || case when v_unpublished > 0 then ' ' || v_unpublished || case when v_unpublished > 1 then ' produits ont été mis hors ligne' else ' produit a été mis hors ligne' end
             || ' (rien n''est supprimé) : choisissez à tout moment lesquels garder en ligne, dans « Produits ».' else '' end
        || ' Vous pouvez vous abonner à Ezial Plus à tout moment.',
      case when v_unpublished > 0 then '/pro/seller/produits/selection' else '/pro/seller/abonnement' end,
      null, null, null, v_row.shop_id);
  end loop;
end;
$function$;
revoke all on function public.process_subscription_expirations() from public, anon, authenticated;
grant execute on function public.process_subscription_expirations() to service_role;

commit;

-- Vérification : 6 lignes « ok » attendues.
select 'table des accès offerts' as element,
       case when to_regclass('public.premium_grants') is not null then 'ok' else 'À VÉRIFIER' end as etat
union all
select 'aucun accès offert créé par la migration',
       case when not exists (select 1 from public.premium_grants) then 'ok' else 'À VÉRIFIER' end
union all
select 'octroi réservé aux administrateurs connectés',
       case when has_function_privilege('authenticated', 'public.admin_grant_premium(uuid, integer, text)', 'execute')
             and not has_function_privilege('anon', 'public.admin_grant_premium(uuid, integer, text)', 'execute')
             and not has_table_privilege('authenticated', 'public.premium_grants', 'INSERT') then 'ok' else 'À VÉRIFIER' end
union all
select 'expiration automatique des accès offerts',
       case when position('premium_grants' in pg_get_functiondef('public.process_subscription_expirations()'::regprocedure)) > 0
             and exists (select 1 from cron.job where jobname = 'process-subscription-expirations' and active) then 'ok' else 'À VÉRIFIER' end
union all
select 'essai standard protégé contre l''écrasement',
       case when position('premium_grants' in pg_get_functiondef('public.activate_seller_trial(uuid)'::regprocedure)) > 0 then 'ok' else 'À VÉRIFIER' end
union all
select 'abonnements existants inchangés',
       case when not exists (select 1 from public.seller_subscriptions where plan = 'pro' and billing_period is null and trial_end is null and pro_until is not null) then 'ok' else 'À VÉRIFIER' end;
