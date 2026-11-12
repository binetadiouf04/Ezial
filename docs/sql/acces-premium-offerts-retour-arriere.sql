-- Retour arrière des accès Ezial Plus offerts (3 et 6 mois).
-- Supprime les trois fonctions d'administration et remet les deux fonctions
-- modifiées dans leur état d'avant la migration (versions de production du
-- 12/11/2026). La table premium_grants est CONSERVÉE (historique et audit) :
-- les abonnements en cours (plan 'pro' + pro_until) continuent de fonctionner
-- jusqu'à leur date de fin, puis expirent par le traitement habituel.
-- À exécuter dans l'éditeur SQL de Supabase. Rejouable.

begin;

drop function if exists public.admin_grant_premium(uuid, integer, text);
drop function if exists public.admin_extend_premium_grant(uuid, integer, text);
drop function if exists public.admin_end_premium_grant(uuid, text);

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

create or replace function public.process_subscription_expirations()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_row record; v_unpublished integer;
begin
  for v_row in
    select ss.id, ss.shop_id, ss.pro_until, ss.billing_period, s.owner_id, s.name as shop_name
      from public.seller_subscriptions ss join public.shops s on s.id = ss.shop_id
     where ss.plan = 'pro' and ss.pro_until is not null and ss.pro_until > now()
       and ss.pro_until <= now() + interval '7 days' and ss.expiry_warned_at is null and ss.cancel_requested_at is null
  loop
    if v_row.billing_period is null then
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

select 'fonctions d''octroi supprimées' as verification,
       case when not exists (select 1 from pg_proc where proname in ('admin_grant_premium','admin_extend_premium_grant','admin_end_premium_grant')) then 'ok' else 'ERREUR' end as resultat;
