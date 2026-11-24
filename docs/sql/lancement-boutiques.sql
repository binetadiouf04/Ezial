-- ============================================================================
-- Lancement — activation automatique des boutiques (plus d'approbation admin)
--
-- Parcours : inscription vendeur → confirmation de l'e-mail → boutique active
-- → accès direct à Ezial Pro.
--
-- Ce que fait ce script (idempotent, peut être relancé sans effet de bord) :
--   1. Garde-fou anti-doublon : une seule notification « Nouvelle boutique
--      inscrite » par boutique (index unique partiel sur admin_notifications).
--   2. prevent_seller_status_change : autorise aussi 'pending' → 'active'
--      (en plus de 'draft' → 'active'), toujours uniquement quand la fonction
--      serveur d'activation lève le drapeau ezial.allow_shop_activation.
--   3. ezial_private.activate_shop_on_email_confirmed(shop_id) : LA fonction
--      unique d'activation automatique. N'active qu'une boutique 'draft' ou
--      'pending' dont le propriétaire a confirmé son e-mail. Ne touche JAMAIS
--      une boutique 'suspended', 'rejected', 'flagged', 'disabled', 'paused'
--      ou 'deleted'. Notifie les administrateurs (interne + push) une seule
--      fois, et le vendeur (« Votre boutique est en ligne »).
--   4. Déclencheurs :
--        - auth.users : à la confirmation de l'e-mail (email_confirmed_at passe
--          de NULL à une date) ;
--        - shops : à la création d'une boutique dont le propriétaire est déjà
--          confirmé (client existant qui devient vendeur, compte confirmé
--          automatiquement).
--      Une erreur dans l'activation n'empêche jamais la confirmation de
--      l'e-mail ni la création de la boutique (avertissement dans les logs,
--      et Ezial Pro retente via activate_shop_if_ready()).
--   5. activate_shop_if_ready() (appelée par Ezial Pro) : ne demande plus de
--      remplir description / téléphone / adresse ; active une boutique
--      'draft' dès que l'e-mail est confirmé (filet de sécurité).
--   6. Régularisation des boutiques existantes (section en fin de script,
--      précédée d'une requête d'aperçu en lecture seule).
--
-- Retour arrière : docs/sql/lancement-boutiques-retour.sql
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Une seule notification « nouvelle boutique » par boutique
-- ----------------------------------------------------------------------------
create unique index if not exists admin_notifications_shop_registered_once
  on public.admin_notifications (shop_id)
  where type = 'shop_registered';

-- ----------------------------------------------------------------------------
-- 2. Verrou de statut : 'pending' → 'active' autorisé avec le drapeau serveur
--    (la ligne « allow_shop_activation » accepte désormais 'draft' OU 'pending').
--    CORRECTION DE SÉCURITÉ : en production, current_setting(..., true) vaut
--    NULL sur une connexion où le drapeau n'a jamais été posé ; la condition
--    devenait alors NULL et le verrou laissait passer la modification. Un
--    vendeur pouvait ainsi, par une simple mise à jour de sa boutique via
--    l'API, passer de 'draft' à 'active', de 'active' à 'paused' (et retour)
--    ou mettre n'importe quel statut à 'deleted' (constaté sur une base de
--    test avec la fonction de production à l'identique). coalesce(..., '')
--    referme ce passage ; les transitions légitimes passent toujours par les
--    fonctions serveur qui posent le drapeau.
-- ----------------------------------------------------------------------------
create or replace function public.prevent_seller_status_change()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if new.status is distinct from old.status
     and not exists (select 1 from public.admins where user_id = auth.uid())
     and not (old.status in ('draft', 'rejected') and new.status = 'pending')
     and not (old.status in ('draft', 'pending') and new.status = 'active' and coalesce(current_setting('ezial.allow_shop_activation', true), '') = 'on')
     and not (old.status = 'active' and new.status = 'paused' and coalesce(current_setting('ezial.allow_shop_pause', true), '') = 'on')
     and not (old.status = 'paused' and new.status = 'active' and coalesce(current_setting('ezial.allow_shop_pause', true), '') = 'on')
     and not (new.status = 'deleted' and coalesce(current_setting('ezial.allow_shop_deletion', true), '') = 'on')
  then
    new.status := old.status;
  end if;
  return new;
end;
$function$;

-- ----------------------------------------------------------------------------
-- 3. Fonction unique d'activation automatique
--    Renvoie true si la boutique vient d'être activée, false sinon.
-- ----------------------------------------------------------------------------
create or replace function ezial_private.activate_shop_on_email_confirmed(p_shop_id uuid)
 returns boolean
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_shop record;
  v_prev_flag text;
  v_message text;
  v_url text;
  v_notification_id uuid;
  v_admin record;
begin
  select s.id, s.name, s.status, s.owner_id
    into v_shop
    from public.shops s
   where s.id = p_shop_id
   for update;

  -- Seules les boutiques jamais mises en ligne sont concernées : une boutique
  -- suspendue, refusée, signalée, désactivée, en pause ou supprimée n'est
  -- jamais réactivée automatiquement.
  if not found then
    return false;
  end if;
  if v_shop.owner_id is null or v_shop.status not in ('draft', 'pending') then
    return false;
  end if;

  if not exists (
    select 1 from auth.users u
     where u.id = v_shop.owner_id
       and u.email_confirmed_at is not null
  ) then
    return false;
  end if;

  v_prev_flag := current_setting('ezial.allow_shop_activation', true);
  perform set_config('ezial.allow_shop_activation', 'on', true);
  update public.shops set status = 'active' where id = v_shop.id;
  perform set_config('ezial.allow_shop_activation', coalesce(v_prev_flag, ''), true);

  -- Vérifie que le verrou de statut a bien laissé passer le changement.
  if not exists (select 1 from public.shops s where s.id = v_shop.id and s.status = 'active') then
    return false;
  end if;

  v_message := 'La boutique « ' || coalesce(nullif(btrim(v_shop.name), ''), 'sans nom') || ' » vient de rejoindre Ezial.';
  v_url := '/pro/admin/boutiques/' || v_shop.id::text;

  -- Notification interne admin : une seule par boutique (index unique partiel).
  insert into public.admin_notifications (type, message, shop_id, url)
  values ('shop_registered', v_message, v_shop.id, v_url)
  on conflict (shop_id) where type = 'shop_registered' do nothing
  returning id into v_notification_id;

  -- Push admin seulement si la notification vient d'être créée (pas de doublon).
  if v_notification_id is not null then
    for v_admin in
      select p.id from public.profiles p where p.role = 'admin' and not p.is_suspended
      union
      select a.user_id as id from public.admins a
    loop
      perform public.push_notify(v_admin.id, 'Nouvelle boutique inscrite', v_message, v_url);
    end loop;

    -- Vendeur : même message que l'ancienne activation (visible dans Ezial Pro).
    perform public.notify_user(
      v_shop.owner_id, 'shop_activated', 'Votre boutique est en ligne',
      'Votre boutique « ' || coalesce(nullif(btrim(v_shop.name), ''), 'Ezial') || ' » est maintenant active sur Ezial.',
      '/pro', null, null, null, v_shop.id
    );
  end if;

  return true;
end;
$function$;

revoke all on function ezial_private.activate_shop_on_email_confirmed(uuid) from public;

-- ----------------------------------------------------------------------------
-- 4a. Déclencheur : confirmation de l'e-mail (auth.users)
--     Fonction dans public comme handle_new_auth_user (même propriétaire,
--     même mode d'appel par le service d'authentification). Une fonction
--     déclencheur n'est pas appelable via l'API.
-- ----------------------------------------------------------------------------
create or replace function public.activate_shops_on_email_confirmed()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_shop_id uuid;
begin
  for v_shop_id in
    select s.id from public.shops s
     where s.owner_id = new.id and s.status in ('draft', 'pending')
  loop
    begin
      perform ezial_private.activate_shop_on_email_confirmed(v_shop_id);
    exception when others then
      -- Ne jamais bloquer la confirmation de l'e-mail.
      raise warning 'Activation automatique de la boutique % impossible : %', v_shop_id, sqlerrm;
    end;
  end loop;
  return null;
end;
$function$;

revoke all on function public.activate_shops_on_email_confirmed() from public, anon, authenticated;

drop trigger if exists trg_activate_shops_on_email_confirmed on auth.users;
create trigger trg_activate_shops_on_email_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.activate_shops_on_email_confirmed();

-- ----------------------------------------------------------------------------
-- 4b. Déclencheur : boutique créée pour un compte déjà confirmé (shops)
-- ----------------------------------------------------------------------------
create or replace function public.activate_new_shop_if_owner_confirmed()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if new.owner_id is not null and new.status in ('draft', 'pending') then
    begin
      perform ezial_private.activate_shop_on_email_confirmed(new.id);
    exception when others then
      -- Ne jamais bloquer la création de la boutique.
      raise warning 'Activation automatique de la boutique % impossible : %', new.id, sqlerrm;
    end;
  end if;
  return null;
end;
$function$;

revoke all on function public.activate_new_shop_if_owner_confirmed() from public, anon, authenticated;

drop trigger if exists trg_activate_new_shop_if_owner_confirmed on public.shops;
create trigger trg_activate_new_shop_if_owner_confirmed
  after insert on public.shops
  for each row
  execute function public.activate_new_shop_if_owner_confirmed();

-- ----------------------------------------------------------------------------
-- 5. activate_shop_if_ready() : plus de champs obligatoires, seulement
--    l'e-mail confirmé. Même signature et même forme de réponse qu'avant
--    (le frontend actuellement en ligne continue de fonctionner).
--    Une boutique 'pending' (renvoyée après un refus) n'est pas activée ici.
-- ----------------------------------------------------------------------------
create or replace function public.activate_shop_if_ready()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_shop public.shops;
begin
  select * into v_shop from public.shops where owner_id = auth.uid();
  if v_shop.id is null then
    raise exception 'Boutique introuvable.';
  end if;
  if v_shop.status <> 'draft' then
    return jsonb_build_object('alreadyActive', v_shop.status = 'active', 'status', v_shop.status);
  end if;

  if ezial_private.activate_shop_on_email_confirmed(v_shop.id) then
    return jsonb_build_object('ready', true, 'activated', true);
  end if;
  return jsonb_build_object('ready', false, 'reason', 'email_not_confirmed');
end;
$function$;

commit;

-- ============================================================================
-- 6. RÉGULARISATION DES BOUTIQUES EXISTANTES
-- ============================================================================

-- 6a. APERÇU (lecture seule) : boutiques qui seraient activées.
--     Attendu en production au 24 nov. 2026 : aucune ligne (4 actives,
--     7 supprimées, aucune en brouillon ni en attente).
select s.id, s.name, s.status, s.created_at, u.email_confirmed_at
  from public.shops s
  join auth.users u on u.id = s.owner_id
 where s.status in ('draft', 'pending')
   and u.email_confirmed_at is not null
 order by s.created_at;

-- Pour information : boutiques non actives qui NE seront PAS touchées.
select s.status, count(*)
  from public.shops s
 where s.status <> 'active'
 group by s.status
 order by s.status;

-- 6b. RÉGULARISATION : active les boutiques listées par l'aperçu ci-dessus
--     (chacune génère une notification admin « Nouvelle boutique inscrite »,
--     une seule fois). Les boutiques suspendues, refusées, en pause ou
--     supprimées ne sont jamais concernées. Relançable sans doublon.
select s.id, s.name, ezial_private.activate_shop_on_email_confirmed(s.id) as activee
  from public.shops s
  join auth.users u on u.id = s.owner_id
 where s.status in ('draft', 'pending')
   and u.email_confirmed_at is not null;
