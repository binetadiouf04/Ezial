-- Fonctions et déclencheurs de PRODUCTION concernés, tels que lus le
-- 24 nov. 2026 (pg_get_functiondef / pg_get_triggerdef), avant
-- docs/sql/lancement-boutiques.sql.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role text := new.raw_user_meta_data->>'role';
  v_base_slug text;
  v_slug text;
begin
  if v_role = 'customer' then
    insert into public.customer_profiles (id, first_name, last_name, phone, email)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'first_name', ''),
      coalesce(new.raw_user_meta_data->>'last_name', ''),
      nullif(new.raw_user_meta_data->>'phone', ''),
      new.email
    )
    on conflict (id) do nothing;

  elsif v_role = 'seller' then
    insert into public.profiles (id, role, email)
    values (new.id, 'seller', new.email)
    on conflict (id) do nothing;

    v_base_slug := lower(regexp_replace(regexp_replace(coalesce(new.raw_user_meta_data->>'shop_name', ''), '[^a-zA-Z0-9]+', '-', 'g'), '(^-+|-+$)', '', 'g'));
    if v_base_slug = '' then
      v_base_slug := 'boutique';
    end if;
    v_slug := v_base_slug;
    if exists (select 1 from public.shops where slug = v_slug) then
      v_slug := v_base_slug || '-' || substr(new.id::text, 1, 8);
    end if;

    insert into public.shops (owner_id, name, slug, seller_code, status)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'shop_name', ''),
      v_slug,
      new.raw_user_meta_data->>'username',
      'draft'
    )
    on conflict (owner_id) do nothing;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_seller_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.status is distinct from old.status
     and not exists (select 1 from public.admins where user_id = auth.uid())
     and not (old.status in ('draft', 'rejected') and new.status = 'pending')
     and not (old.status = 'draft' and new.status = 'active' and current_setting('ezial.allow_shop_activation', true) = 'on')
     and not (old.status = 'active' and new.status = 'paused' and current_setting('ezial.allow_shop_pause', true) = 'on')
     and not (old.status = 'paused' and new.status = 'active' and current_setting('ezial.allow_shop_pause', true) = 'on')
     and not (new.status = 'deleted' and current_setting('ezial.allow_shop_deletion', true) = 'on')
  then
    new.status := old.status;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION ezial_private.lock_shop_privileged_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_is_admin boolean;
  v_blocked text[] := array[]::text[];
begin
  if v_uid is null then return new; end if;
  v_is_admin := exists (select 1 from public.admins a where a.user_id = v_uid);

  if tg_op = 'INSERT' then
    if v_is_admin then return new; end if;
    if coalesce(new.is_official, false) then v_blocked := array_append(v_blocked, 'is_official'); new.is_official := false; end if;
    if new.status is distinct from 'draft' then
      if new.status in ('active', 'paused') then v_blocked := array_append(v_blocked, 'status'); end if;
      new.status := 'draft';
    end if;
    if new.active_product_limit is distinct from 25 then v_blocked := array_append(v_blocked, 'active_product_limit'); new.active_product_limit := 25; end if;
    if new.pin_hash is not null then v_blocked := array_append(v_blocked, 'pin_hash'); new.pin_hash := null; end if;
    if new.suspension_reason is not null then new.suspension_reason := null; end if;
  else
    if v_is_admin then
      if new.is_official is distinct from old.is_official then
        perform ezial_private.log_security_event('shop_official_changed', 'critical',
          jsonb_build_object('shop_id', new.id, 'shop_name', new.name, 'is_official', new.is_official));
      end if;
      return new;
    end if;
    if new.is_official is distinct from old.is_official then v_blocked := array_append(v_blocked, 'is_official'); new.is_official := old.is_official; end if;
    if new.active_product_limit is distinct from old.active_product_limit then v_blocked := array_append(v_blocked, 'active_product_limit'); new.active_product_limit := old.active_product_limit; end if;
    if new.owner_id is distinct from old.owner_id then v_blocked := array_append(v_blocked, 'owner_id'); new.owner_id := old.owner_id; end if;
    if new.pin_hash is distinct from old.pin_hash then v_blocked := array_append(v_blocked, 'pin_hash'); new.pin_hash := old.pin_hash; end if;
    if new.suspension_reason is distinct from old.suspension_reason then v_blocked := array_append(v_blocked, 'suspension_reason'); new.suspension_reason := old.suspension_reason; end if;
    if new.created_at is distinct from old.created_at then new.created_at := old.created_at; end if;
  end if;

  if array_length(v_blocked, 1) > 0 then
    perform ezial_private.log_security_event('privileged_column_attempt', 'high',
      jsonb_build_object('table', 'shops', 'shop_id', new.id, 'columns', to_jsonb(v_blocked), 'operation', tg_op));
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.notify_seller_shop_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if old.status is distinct from new.status and new.status = 'suspended' and new.owner_id is not null then
    perform public.notify_user(new.owner_id, 'seller_shop_suspended', 'Boutique suspendue',
      coalesce(new.suspension_reason, 'Votre boutique a été suspendue par EZIAL.'), '/pro/seller/boutique', null, null, null, new.id);
  elsif old.status is distinct from new.status and new.status = 'active' and old.status = 'suspended' and new.owner_id is not null then
    perform public.notify_user(new.owner_id, 'seller_shop_reactivated', 'Boutique réactivée',
      'Votre boutique est de nouveau active.', '/pro/seller/boutique', null, null, null, new.id);
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.grant_seller_trial_on_activation()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.push_notify(p_user_id uuid, p_title text, p_body text, p_url text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform net.http_post(
    url := 'https://lkqezdrdbogtborgjvlw.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-webhook-secret', (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'push_webhook_secret')),
    body := jsonb_build_object('userId', p_user_id, 'title', p_title, 'body', p_body, 'url', p_url));
exception when others then
  null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.notify_user(p_user_id uuid, p_type text, p_title text, p_body text, p_url text, p_order_id uuid DEFAULT NULL::uuid, p_claim_id uuid DEFAULT NULL::uuid, p_mission_id uuid DEFAULT NULL::uuid, p_shop_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.notifications (user_id, type, title, body, url, order_id, claim_id, mission_id, shop_id)
  values (p_user_id, p_type, p_title, p_body, p_url, p_order_id, p_claim_id, p_mission_id, p_shop_id);
  perform public.push_notify(p_user_id, p_title, p_body, p_url);
end;
$function$;

CREATE OR REPLACE FUNCTION public.activate_shop_if_ready()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_shop public.shops;
begin
  select * into v_shop from public.shops where owner_id = auth.uid() for update;
  if v_shop.id is null then
    raise exception 'Boutique introuvable.';
  end if;
  if v_shop.status <> 'draft' then
    return jsonb_build_object('alreadyActive', v_shop.status = 'active', 'status', v_shop.status);
  end if;
  if coalesce(trim(v_shop.description), '') = ''
     or coalesce(trim(v_shop.phone), '') = ''
     or (coalesce(trim(v_shop.neighborhood), '') = '' and coalesce(trim(v_shop.address_text), '') = '')
  then
    return jsonb_build_object('ready', false);
  end if;

  perform set_config('ezial.allow_shop_activation', 'on', true);
  update public.shops set status = 'active' where id = v_shop.id;

  perform public.notify_user(
    auth.uid(), 'shop_activated', 'Votre boutique est en ligne',
    'Votre boutique « ' || v_shop.name || ' » est maintenant active sur Ezial.',
    '/pro', null, null, null, v_shop.id
  );

  return jsonb_build_object('ready', true, 'activated', true);
end;
$function$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();
CREATE TRIGGER trg_grant_seller_trial_on_activation AFTER UPDATE OF status ON public.shops FOR EACH ROW EXECUTE FUNCTION grant_seller_trial_on_activation();
CREATE TRIGGER trg_lock_shop_privileged_columns BEFORE INSERT OR UPDATE ON public.shops FOR EACH ROW EXECUTE FUNCTION ezial_private.lock_shop_privileged_columns();
CREATE TRIGGER trg_mark_seo_catalog_changed AFTER INSERT OR DELETE OR UPDATE ON public.shops FOR EACH STATEMENT EXECUTE FUNCTION ezial_private.mark_catalog_changed();
CREATE TRIGGER trg_notify_seller_shop_status AFTER UPDATE ON public.shops FOR EACH ROW WHEN ((old.status IS DISTINCT FROM new.status)) EXECUTE FUNCTION notify_seller_shop_status();
CREATE TRIGGER trg_prevent_seller_status_change BEFORE UPDATE ON public.shops FOR EACH ROW EXECUTE FUNCTION prevent_seller_status_change();

-- Droits comme en production.
revoke all on function public.push_notify(uuid, text, text, text) from public;
grant execute on function public.activate_shop_if_ready() to anon, authenticated;
