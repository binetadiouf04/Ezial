-- État de PRODUCTION du 25 nov. 2026 des objets d'abonnement et de remboursement que la migration abonnement-om.sql lit ou remplace.
-- Textes des fonctions copiés de pg_get_functiondef en production (lecture seule) ; les trois fonctions remplacées par la migration
-- sont vérifiées par empreinte md5 (texte sans retours chariot). Écarts avec la production : tables réduites aux colonnes utiles,
-- ezial_private.unpublish_products_over_limit remplacée par une version vide (hors périmètre : pas de catalogue complet dans ce banc).

-- Tables
alter table public.seller_subscriptions
  add column id uuid default gen_random_uuid(), add column trial_used boolean not null default false, add column trial_start timestamptz,
  add column trial_end timestamptz, add column expiry_warned_at timestamptz, add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now(), add column pro_started_at timestamptz, add column premium_paid_ever boolean not null default false,
  add column plan_chosen boolean not null default false, add column billing_period text check (billing_period is null or billing_period in ('quarterly', 'annual')),
  add column cancel_requested_at timestamptz, add column downgraded_at timestamptz;
alter table public.seller_subscriptions add constraint seller_subscriptions_shop_fk foreign key (shop_id) references public.shops(id) on delete cascade;
alter table public.seller_subscriptions alter column plan set default 'free';
alter table public.seller_subscriptions alter column plan set not null;
alter table public.seller_subscriptions add constraint seller_subscriptions_plan_check check (plan in ('free', 'pro'));
alter table public.seller_subscriptions enable row level security;
create policy seller_subscriptions_select_own on public.seller_subscriptions for select using (exists (select 1 from public.shops s where s.id = seller_subscriptions.shop_id and s.owner_id = auth.uid()));
create policy seller_subscriptions_select_admin on public.seller_subscriptions for select using ((exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin' and not profiles.is_suspended)) or (exists (select 1 from public.admins where admins.user_id = auth.uid())));

create table public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  amount integer not null default 6000,
  payment_method text not null check (payment_method in ('wave', 'orange_money')),
  reference text,
  status text not null default 'pending_review' check (status in ('pending_review', 'confirmed', 'rejected')),
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  period_start timestamptz, period_end timestamptz,
  created_at timestamptz not null default now(),
  billing_period text not null default 'quarterly' check (billing_period in ('quarterly', 'annual')),
  constraint subscription_payments_amount_check check (((billing_period = 'quarterly' and amount = any (array[5000, 6000])) or (billing_period = 'annual' and amount = 20000))));
create index subscription_payments_shop_id_idx on public.subscription_payments (shop_id);
alter table public.subscription_payments enable row level security;
create policy subscription_payments_insert_own on public.subscription_payments for insert with check ((exists (select 1 from public.shops s where s.id = subscription_payments.shop_id and s.owner_id = auth.uid())) and status = 'pending_review');
create policy subscription_payments_select_admin on public.subscription_payments for select using ((exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin' and not profiles.is_suspended)) or (exists (select 1 from public.admins where admins.user_id = auth.uid())));
create policy subscription_payments_select_own on public.subscription_payments for select using (exists (select 1 from public.shops s where s.id = subscription_payments.shop_id and s.owner_id = auth.uid()));

create table public.premium_grants (id uuid primary key default gen_random_uuid(), shop_id uuid references public.shops(id), status text, granted_months integer, ends_at timestamptz, ended_at timestamptz, updated_at timestamptz default now());

create table public.order_shop_cancellations (
  id uuid primary key default gen_random_uuid(), order_id uuid references public.orders(id), shop_id uuid references public.shops(id),
  part_amount integer not null default 0 check (part_amount >= 0),
  refund_status text not null default 'none' check (refund_status in ('none', 'to_refund', 'refunded')),
  refunded_at timestamptz, refund_method text, refund_reference text, refund_note text, refunded_by uuid,
  constraint order_shop_cancellations_check check (refund_status <> 'refunded' or (refunded_at is not null and refund_method is not null)),
  constraint order_shop_cancellations_refund_method_check check (refund_method is null or refund_method = any (array['orange_money', 'wave', 'especes', 'virement', 'autre'])));

alter table public.admin_notifications add column message text, add column shop_id uuid, add column claim_id uuid, add column mission_id uuid, add column is_read boolean not null default false;
drop function public.notify_admins(text, text, text, uuid);
create function public.notify_admins(p_type text, p_message text, p_url text, p_order_id uuid default null, p_claim_id uuid default null, p_mission_id uuid default null, p_shop_id uuid default null)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  v_admin record;
begin
  insert into public.admin_notifications (type, message, shop_id, order_id, claim_id, mission_id, url)
  values (p_type, p_message, p_shop_id, p_order_id, p_claim_id, p_mission_id, p_url);

  for v_admin in
    select id from public.profiles where role = 'admin' and not is_suspended
    union
    select user_id as id from public.admins
  loop
    perform public.push_notify(v_admin.id, 'EZIAL Admin', p_message, p_url);
  end loop;
end;
$function$;
revoke execute on function public.notify_admins(text, text, text, uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.notify_user(uuid, text, text, text, text, uuid, uuid, uuid, uuid) from public, anon, authenticated;

create function ezial_private.unpublish_products_over_limit(p_shop uuid, p_limit integer) returns integer language sql as $$ select 0 $$;

-- Fonctions de production
create function public.subscription_plan_interval(p_billing_period text) returns interval language sql immutable set search_path to 'public' as
$function$ select case p_billing_period when 'quarterly' then interval '3 months' when 'annual' then interval '12 months' end; $function$;
create function public.subscription_plan_price(p_billing_period text) returns integer language sql immutable set search_path to 'public' as
$function$ select case p_billing_period when 'quarterly' then 6000 when 'annual' then 20000 end; $function$;

create function public.enforce_subscription_payment_amount() returns trigger language plpgsql set search_path to 'public' as $function$
begin
  if tg_op = 'INSERT' then
    if public.subscription_plan_price(new.billing_period) is null then
      raise exception 'Périodicité d''abonnement invalide.';
    end if;
    new.amount := public.subscription_plan_price(new.billing_period);
  elsif new.amount is distinct from old.amount or new.billing_period is distinct from old.billing_period then
    raise exception 'Le montant et la périodicité d''un paiement ne peuvent pas être modifiés.';
  end if;
  return new;
end;
$function$;
create trigger trg_enforce_subscription_payment_amount before insert or update on public.subscription_payments for each row execute function enforce_subscription_payment_amount();

create function public.notify_admin_new_subscription_payment() returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare v_shop_name text;
begin
  select name into v_shop_name from public.shops where id = new.shop_id;
  perform public.notify_admins('subscription_payment_pending',
    'Nouvelle demande d''activation Ezial Plus : ' || coalesce(v_shop_name, 'boutique')
      || ' (' || new.amount || ' FCFA, ' || case new.billing_period when 'annual' then 'annuel' else 'trimestriel' end
      || ', via ' || new.payment_method || ')',
    '/pro/admin/abonnements', null, null, null, new.shop_id);
  return new;
end;
$function$;
create trigger trg_notify_admin_new_subscription_payment after insert on public.subscription_payments for each row execute function notify_admin_new_subscription_payment();

create function public.seller_subscriptions_clear_cancel_on_renewal() returns trigger language plpgsql set search_path to '' as $function$
begin
  if old.pro_until is not null and new.pro_until is not null and new.pro_until > old.pro_until
     and new.cancel_requested_at is not distinct from old.cancel_requested_at then
    new.cancel_requested_at := null;
  end if;
  return new;
end;
$function$;
create trigger trg_clear_cancel_on_renewal before update on public.seller_subscriptions for each row execute function seller_subscriptions_clear_cancel_on_renewal();

create function public.confirm_subscription_payment(p_payment_id uuid) returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_is_admin boolean; v_payment public.subscription_payments; v_sub public.seller_subscriptions;
  v_period_start timestamptz; v_period_end timestamptz; v_owner_id uuid; v_is_fresh boolean; v_formula text;
begin
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin' and not is_suspended
    union select 1 from public.admins where user_id = auth.uid()
  ) into v_is_admin;
  if not v_is_admin then raise exception 'Accès réservé aux administrateurs.'; end if;

  select * into v_payment from public.subscription_payments where id = p_payment_id for update;
  if v_payment.id is null then raise exception 'Demande de paiement introuvable.'; end if;
  if v_payment.status <> 'pending_review' then
    return jsonb_build_object('alreadyProcessed', true, 'status', v_payment.status);
  end if;

  select * into v_sub from public.seller_subscriptions where shop_id = v_payment.shop_id for update;
  v_is_fresh := not (v_sub.id is not null and v_sub.plan = 'pro' and v_sub.pro_until is not null and v_sub.pro_until > now());
  if v_is_fresh then v_period_start := now(); else v_period_start := v_sub.pro_until; end if;
  v_period_end := v_period_start + public.subscription_plan_interval(v_payment.billing_period);
  v_formula := case v_payment.billing_period when 'annual' then 'annuel (12 mois)' else 'trimestriel (3 mois)' end;

  update public.subscription_payments
     set status = 'confirmed', reviewed_at = now(), reviewed_by = auth.uid(), period_start = v_period_start, period_end = v_period_end
   where id = p_payment_id;

  if v_sub.id is null then
    insert into public.seller_subscriptions (shop_id, plan, pro_until, trial_used, pro_started_at, premium_paid_ever, plan_chosen, billing_period)
    values (v_payment.shop_id, 'pro', v_period_end, true, v_period_start, true, true, v_payment.billing_period);
  else
    update public.seller_subscriptions
       set plan = 'pro', pro_until = v_period_end, expiry_warned_at = null, updated_at = now(),
           pro_started_at = case when v_is_fresh then v_period_start else pro_started_at end,
           premium_paid_ever = true, plan_chosen = true, billing_period = v_payment.billing_period
     where shop_id = v_payment.shop_id;
  end if;

  select owner_id into v_owner_id from public.shops where id = v_payment.shop_id;
  if v_owner_id is not null then
    perform public.notify_user(v_owner_id, 'subscription_confirmed', 'Abonnement Ezial Plus activé',
      'Votre paiement a été confirmé. Votre abonnement Ezial Plus ' || v_formula || ' est valide jusqu''au ' || to_char(v_period_end, 'DD/MM/YYYY') || '.',
      '/pro/seller/abonnement', null, null, null, v_payment.shop_id);
  end if;
  return jsonb_build_object('alreadyProcessed', false, 'periodEnd', v_period_end, 'billingPeriod', v_payment.billing_period);
end;
$function$;

create function public.admin_mark_refunded(p_id uuid, p_method text, p_reference text default null::text, p_note text default null::text)
returns jsonb language plpgsql security definer set search_path to '' as $function$
declare c public.order_shop_cancellations;
begin
  if not exists (select 1 from public.admins a where a.user_id = (select auth.uid())) then
    raise exception 'Accès réservé aux administrateurs.' using errcode = 'P0001';
  end if;
  if p_method is null or p_method not in ('orange_money', 'wave', 'especes', 'virement', 'autre') then
    raise exception 'Choisissez le moyen utilisé pour le remboursement.' using errcode = 'P0001';
  end if;
  select * into c from public.order_shop_cancellations where id = p_id for update;
  if c.id is null or c.refund_status = 'none' then raise exception 'Remboursement introuvable.' using errcode = 'P0001'; end if;
  if c.refund_status = 'refunded' then
    return jsonb_build_object('success', true, 'already', true, 'refunded_at', c.refunded_at);
  end if;
  update public.order_shop_cancellations
     set refund_status = 'refunded', refunded_at = now(), refund_method = p_method,
         refund_reference = nullif(left(btrim(coalesce(p_reference, '')), 120), ''),
         refund_note = nullif(left(btrim(coalesce(p_note, '')), 300), ''), refunded_by = (select auth.uid())
   where id = c.id returning * into c;
  update public.admin_notifications set is_read = true
   where type = 'refund_to_make' and order_id = c.order_id and shop_id is not distinct from c.shop_id and not is_read;
  perform ezial_private.audit('admin', 'refund_marked_done', 'order_shop_cancellation', c.id,
    jsonb_build_object('order_id', c.order_id, 'amount', c.part_amount, 'method', p_method));
  return jsonb_build_object('success', true, 'already', false, 'refunded_at', c.refunded_at);
end;
$function$;

create function public.process_subscription_expirations() returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_row record; v_unpublished integer; v_gift record;
begin
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
revoke execute on function public.process_subscription_expirations() from public, anon, authenticated;
