-- ============================================================================
-- RETOUR ARRIÈRE de docs/sql/lancement-boutiques.sql
--
-- Rétablit les fonctions de production d'avant (24 nov. 2026) :
--   - activate_shop_if_ready() exige de nouveau description, téléphone et
--     quartier ou adresse ;
--   - prevent_seller_status_change() n'autorise plus que 'draft' → 'active'
--     (la correction de sécurité sur le drapeau NULL est conservée).
-- Supprime les deux déclencheurs et les fonctions d'activation automatique.
--
-- CONSERVÉ (aucune donnée perdue) : les boutiques déjà activées restent
-- actives, les notifications déjà envoyées restent. L'index anti-doublon est
-- supprimé (il ne sert plus).
-- ============================================================================

begin;

drop trigger if exists trg_activate_shops_on_email_confirmed on auth.users;
drop trigger if exists trg_activate_new_shop_if_owner_confirmed on public.shops;

-- Fonction de production d'avant (définition lue le 24 nov. 2026).
create or replace function public.activate_shop_if_ready()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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

-- Fonction de production d'avant (définition lue le 24 nov. 2026), en
-- GARDANT la correction de sécurité coalesce(..., '') : sans elle, le verrou
-- laisse passer un changement de statut fait directement par un vendeur
-- (voir lancement-boutiques.sql, section 2).
create or replace function public.prevent_seller_status_change()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if new.status is distinct from old.status
     and not exists (select 1 from public.admins where user_id = auth.uid())
     and not (old.status in ('draft', 'rejected') and new.status = 'pending')
     and not (old.status = 'draft' and new.status = 'active' and coalesce(current_setting('ezial.allow_shop_activation', true), '') = 'on')
     and not (old.status = 'active' and new.status = 'paused' and coalesce(current_setting('ezial.allow_shop_pause', true), '') = 'on')
     and not (old.status = 'paused' and new.status = 'active' and coalesce(current_setting('ezial.allow_shop_pause', true), '') = 'on')
     and not (new.status = 'deleted' and coalesce(current_setting('ezial.allow_shop_deletion', true), '') = 'on')
  then
    new.status := old.status;
  end if;
  return new;
end;
$function$;

drop function if exists public.activate_shops_on_email_confirmed();
drop function if exists public.activate_new_shop_if_owner_confirmed();
drop function if exists ezial_private.activate_shop_on_email_confirmed(uuid);

drop index if exists public.admin_notifications_shop_registered_once;

commit;
