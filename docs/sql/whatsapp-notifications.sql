-- Ezial — notifications WhatsApp automatiques : architecture prête, AUCUN envoi.
-- Ajoute une file d'attente (historique + anti-doublon), les déclencheurs
-- serveur, le rappel vendeur 24 h, le consentement et les fonctions que le
-- futur service d'envoi (Edge Function whatsapp-dispatch) utilisera.
-- Tant que ce service n'est ni déployé ni planifié, rien ne part : les
-- notifications restent « en attente » puis « expirées ».
-- Aucune table, colonne ou donnée existante n'est modifiée. Rejouable.
-- Toute erreur dans ces déclencheurs est absorbée : une commande, un paiement
-- ou un changement de statut ne peut jamais échouer à cause de WhatsApp.
begin;

create schema if not exists ezial_private;

-- 1. Réglages (une seule ligne, aucun secret : les clés restent dans les
--    secrets des Edge Functions).
create table if not exists public.whatsapp_settings (
  id boolean primary key default true check (id),
  -- false aujourd'hui : le paiement en ligne n'est pas encore actif, une
  -- commande est officiellement acceptée dès sa création par create_order
  -- (serveur). À passer à true quand Wave / Orange Money seront validés par
  -- webhook : la confirmation attendra alors payment_status = 'paid'.
  confirmation_requires_paid boolean not null default false,
  -- Écrits uniquement par le service d'envoi (état réel, jamais supposé).
  provider text,
  provider_ready boolean not null default false,
  last_dispatch_at timestamptz,
  last_dispatch_error text,
  updated_at timestamptz not null default now()
);
insert into public.whatsapp_settings (id) values (true) on conflict (id) do nothing;

-- 2. Consentement WhatsApp (par compte : acheteur et/ou vendeur).
create table if not exists public.whatsapp_consents (
  user_id uuid primary key,
  opted_in boolean not null default false,
  opted_in_at timestamptz,
  opted_out_at timestamptz,
  source text,
  updated_at timestamptz not null default now()
);

-- 3. File d'attente et historique. Pas de contenu de message stocké : il est
--    reconstruit au moment de l'envoi à partir de la commande. Le numéro
--    complet n'est gardé que tant que l'envoi est en attente.
create table if not exists public.whatsapp_notifications (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('buyer_order_confirmed', 'buyer_out_for_delivery', 'seller_new_order', 'seller_order_reminder')),
  dedupe_key text not null unique,
  order_id uuid not null references public.orders(id) on delete cascade,
  order_shop_id uuid references public.order_shops(id) on delete cascade,
  shop_id uuid,
  recipient_user_id uuid,
  recipient_phone text,
  recipient_masked text,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'skipped', 'expired')),
  skip_reason text,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  last_error text,
  provider text,
  provider_message_id text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists whatsapp_notifications_due_idx on public.whatsapp_notifications (next_attempt_at) where status in ('pending', 'sending');
create index if not exists whatsapp_notifications_order_idx on public.whatsapp_notifications (order_id);
create index if not exists whatsapp_notifications_order_shop_idx on public.whatsapp_notifications (order_shop_id);
create index if not exists whatsapp_notifications_kind_created_idx on public.whatsapp_notifications (kind, created_at);

-- 4. Accès : lecture réservée aux administrateurs ; aucune écriture directe
--    (uniquement via les fonctions ci-dessous).
alter table public.whatsapp_settings enable row level security;
alter table public.whatsapp_consents enable row level security;
alter table public.whatsapp_notifications enable row level security;
revoke all on public.whatsapp_settings, public.whatsapp_consents, public.whatsapp_notifications from anon, authenticated;
grant select on public.whatsapp_settings, public.whatsapp_notifications to authenticated;

drop policy if exists whatsapp_settings_admin_select on public.whatsapp_settings;
create policy whatsapp_settings_admin_select on public.whatsapp_settings for select to authenticated
  using (exists (select 1 from public.admins a where a.user_id = (select auth.uid())));
drop policy if exists whatsapp_notifications_admin_select on public.whatsapp_notifications;
create policy whatsapp_notifications_admin_select on public.whatsapp_notifications for select to authenticated
  using (exists (select 1 from public.admins a where a.user_id = (select auth.uid())));

-- 5. Outils internes.
-- Numéro au format international E.164. Sénégal : mobile 7X uniquement
-- (un fixe 33 ne reçoit pas WhatsApp). Autres pays : E.164 générique.
create or replace function ezial_private.normalize_whatsapp_phone(p_raw text)
returns text language plpgsql immutable set search_path = '' as $$
declare v text;
begin
  if p_raw is null then return null; end if;
  v := regexp_replace(p_raw, '[\s.\-()/]', '', 'g');
  if v ~ '^00' then v := '+' || substr(v, 3); end if;
  if v ~ '^7\d{8}$' then v := '+221' || v; end if;
  if v ~ '^221\d{9}$' then v := '+' || v; end if;
  if v ~ '^\+221' then
    return case when v ~ '^\+2217\d{8}$' then v else null end;
  end if;
  return case when v ~ '^\+[1-9]\d{7,14}$' then v else null end;
end;
$$;

create or replace function ezial_private.mask_phone(p_phone text)
returns text language sql immutable set search_path = '' as $$
  select case when p_phone is null then null else left(p_phone, 6) || '•••' || right(p_phone, 2) end;
$$;

create or replace function ezial_private.whatsapp_enqueue(
  p_kind text, p_dedupe_key text, p_order_id uuid, p_order_shop_id uuid, p_shop_id uuid,
  p_user_id uuid, p_raw_phone text, p_validity interval
) returns void language plpgsql security definer set search_path = '' as $$
declare v_phone text; v_status text := 'pending'; v_reason text;
begin
  v_phone := ezial_private.normalize_whatsapp_phone(p_raw_phone);
  if p_user_id is null or not exists (select 1 from public.whatsapp_consents c where c.user_id = p_user_id and c.opted_in) then
    v_status := 'skipped'; v_reason := 'no_consent';
  elsif v_phone is null then
    v_status := 'skipped'; v_reason := 'invalid_phone';
  end if;
  insert into public.whatsapp_notifications
    (kind, dedupe_key, order_id, order_shop_id, shop_id, recipient_user_id, recipient_phone, recipient_masked, status, skip_reason, expires_at)
  values
    (p_kind, p_dedupe_key, p_order_id, p_order_shop_id, p_shop_id, p_user_id,
     case when v_status = 'pending' then v_phone end, ezial_private.mask_phone(v_phone), v_status, v_reason, now() + p_validity)
  on conflict (dedupe_key) do nothing;
end;
$$;

-- 6. Événement « commande acceptée » : confirmation acheteur + nouvelle
--    commande pour chaque boutique (sa propre partie seulement).
create or replace function ezial_private.whatsapp_on_order_accepted(p_order_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_order record; v_requires_paid boolean; v_os record;
begin
  select o.id, o.status, o.payment_status, o.customer_id, o.phone into v_order from public.orders o where o.id = p_order_id;
  if v_order.id is null or v_order.status = 'cancelled' then return; end if;
  select s.confirmation_requires_paid into v_requires_paid from public.whatsapp_settings s where s.id;
  if coalesce(v_requires_paid, false) and v_order.payment_status is distinct from 'paid' then return; end if;

  perform ezial_private.whatsapp_enqueue('buyer_order_confirmed', 'buyer_order_confirmed:' || v_order.id, v_order.id, null, null,
    v_order.customer_id, v_order.phone, interval '24 hours');

  for v_os in
    select os.id, os.shop_id, sh.owner_id, sh.phone
      from public.order_shops os join public.shops sh on sh.id = os.shop_id
     where os.order_id = v_order.id and os.status <> 'cancelled'
  loop
    perform ezial_private.whatsapp_enqueue('seller_new_order', 'seller_new_order:' || v_os.id, v_order.id, v_os.id, v_os.shop_id,
      v_os.owner_id, v_os.phone, interval '24 hours');
  end loop;
end;
$$;

create or replace function ezial_private.trg_whatsapp_order_accepted()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform ezial_private.whatsapp_on_order_accepted(new.id);
  exception when others then
    raise warning 'whatsapp_on_order_accepted(%) : %', new.id, sqlerrm;
  end;
  return null;
end;
$$;

-- Différé à la fin de la transaction : create_order insère la commande puis
-- ses sous-commandes ; le déclencheur s'exécute quand tout est enregistré.
drop trigger if exists trg_whatsapp_order_inserted on public.orders;
create constraint trigger trg_whatsapp_order_inserted
  after insert on public.orders deferrable initially deferred
  for each row execute function ezial_private.trg_whatsapp_order_accepted();
drop trigger if exists trg_whatsapp_order_updated on public.orders;
create constraint trigger trg_whatsapp_order_updated
  after update on public.orders deferrable initially deferred
  for each row when (old.status is distinct from new.status or old.payment_status is distinct from new.payment_status)
  execute function ezial_private.trg_whatsapp_order_accepted();

-- 7. Événement « en cours de livraison » : le livreur passe réellement la
--    mission au statut out_for_delivery (une seule fois par commande).
create or replace function ezial_private.trg_whatsapp_out_for_delivery()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_order record;
begin
  begin
    select o.id, o.status, o.customer_id, o.phone into v_order from public.orders o where o.id = new.order_id;
    if v_order.id is not null and v_order.status <> 'cancelled' then
      perform ezial_private.whatsapp_enqueue('buyer_out_for_delivery', 'buyer_out_for_delivery:' || v_order.id, v_order.id, null, null,
        v_order.customer_id, v_order.phone, interval '3 hours');
    end if;
  exception when others then
    raise warning 'whatsapp out_for_delivery (%) : %', new.order_id, sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists trg_whatsapp_out_for_delivery on public.delivery_missions;
create trigger trg_whatsapp_out_for_delivery
  after update on public.delivery_missions
  for each row when (new.status = 'out_for_delivery' and old.status is distinct from new.status)
  execute function ezial_private.trg_whatsapp_out_for_delivery();

-- 8. Tâche planifiée (toutes les 15 min) : rappel vendeur 24 h après la
--    notification initiale si la sous-commande n'est toujours pas prise en
--    charge, expiration des envois périmés, reprise des envois bloqués.
create or replace function public.whatsapp_maintenance()
returns void language plpgsql security definer set search_path = '' as $$
declare v record;
begin
  for v in
    select n.order_id, n.order_shop_id, n.shop_id, sh.owner_id, sh.phone
      from public.whatsapp_notifications n
      join public.order_shops os on os.id = n.order_shop_id
      join public.orders o on o.id = n.order_id
      join public.shops sh on sh.id = n.shop_id
     where n.kind = 'seller_new_order'
       and n.created_at <= now() - interval '24 hours'
       and n.created_at > now() - interval '72 hours'
       and os.status = 'confirmed' and o.status <> 'cancelled'
       and not exists (select 1 from public.whatsapp_notifications r where r.dedupe_key = 'seller_order_reminder:' || n.order_shop_id)
  loop
    perform ezial_private.whatsapp_enqueue('seller_order_reminder', 'seller_order_reminder:' || v.order_shop_id, v.order_id, v.order_shop_id, v.shop_id,
      v.owner_id, v.phone, interval '12 hours');
  end loop;

  update public.whatsapp_notifications
     set status = 'pending', locked_until = null, updated_at = now()
   where status = 'sending' and locked_until < now();

  update public.whatsapp_notifications
     set status = 'expired', recipient_phone = null, updated_at = now()
   where status = 'pending' and expires_at <= now();
end;
$$;
revoke all on function public.whatsapp_maintenance() from public, anon, authenticated;

select cron.schedule('whatsapp-maintenance', '*/15 * * * *', 'select public.whatsapp_maintenance();');

-- 9. Fonctions du service d'envoi (clé service_role uniquement, jamais le site).
create or replace function public.whatsapp_claim_batch(p_limit integer default 20)
returns setof public.whatsapp_notifications language sql security definer set search_path = '' as $$
  with due as (
    select n.id from public.whatsapp_notifications n
     where n.status = 'pending' and n.next_attempt_at <= now() and n.expires_at > now()
     order by n.created_at
     limit greatest(1, least(coalesce(p_limit, 20), 100))
     for update skip locked
  )
  update public.whatsapp_notifications n
     set status = 'sending', attempts = n.attempts + 1, locked_until = now() + interval '5 minutes', updated_at = now()
    from due where n.id = due.id
  returning n.*;
$$;

-- Données fraîches pour composer le message, et re-vérification du statut
-- réel juste avant l'envoi (commande annulée, déjà prise en charge…).
create or replace function public.whatsapp_message_context(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  n public.whatsapp_notifications; o public.orders; os public.order_shops;
  v_requires_paid boolean; v_items jsonb; v_link text;
begin
  select * into n from public.whatsapp_notifications where id = p_id;
  if n.id is null then return jsonb_build_object('relevant', false, 'reason', 'not_found'); end if;
  select * into o from public.orders where id = n.order_id;
  if o.id is null or o.status = 'cancelled' then return jsonb_build_object('relevant', false, 'reason', 'order_cancelled'); end if;
  if n.order_shop_id is not null then select * into os from public.order_shops where id = n.order_shop_id; end if;

  if n.kind = 'buyer_order_confirmed' then
    select s.confirmation_requires_paid into v_requires_paid from public.whatsapp_settings s where s.id;
    if coalesce(v_requires_paid, false) and o.payment_status is distinct from 'paid' then
      return jsonb_build_object('relevant', false, 'reason', 'payment_not_confirmed');
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('name', oi.product_name, 'quantity', oi.quantity) order by oi.created_at), '[]'::jsonb)
      into v_items from public.order_items oi where oi.order_id = o.id;
    return jsonb_build_object('relevant', true, 'kind', n.kind, 'to', n.recipient_phone, 'params', jsonb_build_object(
      'firstName', coalesce(nullif(trim(o.first_name), ''), ''),
      'orderNumber', o.order_number,
      'items', v_items,
      'totalFcfa', o.total_amount,
      'delivery', case when o.fulfillment_type = 'pickup' then 'Retrait en boutique'
                       else coalesce(nullif(trim(o.neighborhood), ''), nullif(trim(o.delivery_address), ''), 'Adresse indiquée lors de la commande') end));
  elsif n.kind = 'buyer_out_for_delivery' then
    if not exists (select 1 from public.delivery_missions m where m.order_id = o.id and m.status = 'out_for_delivery') then
      return jsonb_build_object('relevant', false, 'reason', 'not_out_for_delivery');
    end if;
    return jsonb_build_object('relevant', true, 'kind', n.kind, 'to', n.recipient_phone, 'params', jsonb_build_object(
      'firstName', coalesce(nullif(trim(o.first_name), ''), ''), 'orderNumber', o.order_number));
  else
    if os.id is null or os.status = 'cancelled' then return jsonb_build_object('relevant', false, 'reason', 'order_shop_cancelled'); end if;
    if n.kind = 'seller_order_reminder' and os.status <> 'confirmed' then
      return jsonb_build_object('relevant', false, 'reason', 'already_handled');
    end if;
    -- Lien vers SA sous-commande uniquement ; aucune donnée de l'acheteur.
    v_link := 'https://ezial.net/pro/seller/commandes/' || os.id;
    return jsonb_build_object('relevant', true, 'kind', n.kind, 'to', n.recipient_phone, 'params', jsonb_build_object(
      'orderNumber', o.order_number, 'link', v_link));
  end if;
end;
$$;

-- Résultat d'un envoi. Idempotent : n'agit que sur un envoi en cours.
-- p_outcome : 'sent' | 'retry' (erreur temporaire) | 'failed' (définitive) |
-- 'skipped' (plus pertinent ; p_error = raison).
create or replace function public.whatsapp_complete(p_id uuid, p_outcome text, p_provider text default null, p_provider_message_id text default null, p_error text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare n public.whatsapp_notifications; v_delay interval;
begin
  select * into n from public.whatsapp_notifications where id = p_id for update;
  if n.id is null or n.status <> 'sending' then return coalesce(n.status, 'not_found'); end if;

  if p_outcome = 'sent' then
    update public.whatsapp_notifications set status = 'sent', sent_at = now(), provider = p_provider, provider_message_id = p_provider_message_id,
      last_error = null, recipient_phone = null, locked_until = null, updated_at = now() where id = p_id;
    return 'sent';
  elsif p_outcome = 'retry' and n.attempts < 5 and n.expires_at > now() then
    v_delay := case n.attempts when 1 then interval '1 minute' when 2 then interval '5 minutes' when 3 then interval '15 minutes' else interval '1 hour' end;
    update public.whatsapp_notifications set status = 'pending', next_attempt_at = now() + v_delay, last_error = left(p_error, 500),
      provider = p_provider, locked_until = null, updated_at = now() where id = p_id;
    return 'pending';
  elsif p_outcome = 'skipped' then
    update public.whatsapp_notifications set status = 'skipped', skip_reason = left(coalesce(p_error, 'no_longer_relevant'), 100),
      recipient_phone = null, locked_until = null, updated_at = now() where id = p_id;
    return 'skipped';
  else
    update public.whatsapp_notifications set status = 'failed', last_error = left(coalesce(p_error, 'échec'), 500), provider = p_provider,
      recipient_phone = null, locked_until = null, updated_at = now() where id = p_id;
    return 'failed';
  end if;
end;
$$;

-- État réel du service d'envoi, écrit à chaque passage (jamais supposé).
create or replace function public.whatsapp_record_dispatch(p_provider text, p_ready boolean, p_error text default null)
returns void language sql security definer set search_path = '' as $$
  update public.whatsapp_settings set provider = p_provider, provider_ready = coalesce(p_ready, false),
    last_dispatch_at = now(), last_dispatch_error = left(p_error, 500), updated_at = now() where id;
$$;

revoke all on function public.whatsapp_claim_batch(integer) from public, anon, authenticated;
revoke all on function public.whatsapp_message_context(uuid) from public, anon, authenticated;
revoke all on function public.whatsapp_complete(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.whatsapp_record_dispatch(text, boolean, text) from public, anon, authenticated;
grant execute on function public.whatsapp_claim_batch(integer), public.whatsapp_message_context(uuid),
  public.whatsapp_complete(uuid, text, text, text, text), public.whatsapp_record_dispatch(text, boolean, text) to service_role;

revoke all on function ezial_private.whatsapp_enqueue(text, text, uuid, uuid, uuid, uuid, text, interval) from public, anon, authenticated;
revoke all on function ezial_private.whatsapp_on_order_accepted(uuid) from public, anon, authenticated;

-- 10. Consentement depuis le site (le compte connecté, pour lui-même).
create or replace function public.get_my_whatsapp_consent()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('optedIn', coalesce(c.opted_in, false), 'updatedAt', c.updated_at)
    from (select 1) x left join public.whatsapp_consents c on c.user_id = (select auth.uid());
$$;

create or replace function public.set_my_whatsapp_consent(p_opt_in boolean, p_source text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Connexion requise.' using errcode = 'P0001'; end if;
  insert into public.whatsapp_consents (user_id, opted_in, opted_in_at, opted_out_at, source, updated_at)
  values (v_uid, coalesce(p_opt_in, false),
          case when p_opt_in then now() end, case when not coalesce(p_opt_in, false) then now() end,
          case when p_source in ('compte', 'boutique') then p_source end, now())
  on conflict (user_id) do update set
    opted_in = excluded.opted_in,
    opted_in_at = case when excluded.opted_in then now() else public.whatsapp_consents.opted_in_at end,
    opted_out_at = case when not excluded.opted_in then now() else public.whatsapp_consents.opted_out_at end,
    source = coalesce(excluded.source, public.whatsapp_consents.source),
    updated_at = now();
  -- Retrait du consentement : plus aucun envoi en attente pour ce compte.
  if not coalesce(p_opt_in, false) then
    update public.whatsapp_notifications set status = 'skipped', skip_reason = 'consent_withdrawn', recipient_phone = null, updated_at = now()
     where recipient_user_id = v_uid and status = 'pending';
  end if;
  return jsonb_build_object('optedIn', coalesce(p_opt_in, false));
end;
$$;
revoke all on function public.get_my_whatsapp_consent() from public, anon;
revoke all on function public.set_my_whatsapp_consent(boolean, text) from public, anon;
grant execute on function public.get_my_whatsapp_consent(), public.set_my_whatsapp_consent(boolean, text) to authenticated;

commit;

-- Vérification : 8 lignes « ok » attendues.
select 'tables' as element,
       case when to_regclass('public.whatsapp_notifications') is not null and to_regclass('public.whatsapp_consents') is not null
             and to_regclass('public.whatsapp_settings') is not null then 'ok' else 'À VÉRIFIER' end as etat
union all
select 'déclencheurs commandes et livraison',
       case when (select count(*) from pg_trigger where tgname in ('trg_whatsapp_order_inserted', 'trg_whatsapp_order_updated', 'trg_whatsapp_out_for_delivery')) = 3 then 'ok' else 'À VÉRIFIER' end
union all
select 'tâche planifiée (rappel 24 h, expiration)',
       case when exists (select 1 from cron.job where jobname = 'whatsapp-maintenance' and active) then 'ok' else 'À VÉRIFIER' end
union all
select 'service d''envoi : clé serveur uniquement',
       case when not has_function_privilege('authenticated', 'public.whatsapp_claim_batch(integer)', 'execute')
             and not has_function_privilege('anon', 'public.whatsapp_complete(uuid, text, text, text, text)', 'execute') then 'ok' else 'À VÉRIFIER' end
union all
select 'consentement : connecté seulement',
       case when has_function_privilege('authenticated', 'public.set_my_whatsapp_consent(boolean, text)', 'execute')
             and not has_function_privilege('anon', 'public.set_my_whatsapp_consent(boolean, text)', 'execute') then 'ok' else 'À VÉRIFIER' end
union all
select 'lecture réservée aux administrateurs',
       case when (select count(*) from pg_policies where tablename in ('whatsapp_notifications', 'whatsapp_settings')) = 2
             and (select relrowsecurity from pg_class where oid = 'public.whatsapp_consents'::regclass) then 'ok' else 'À VÉRIFIER' end
union all
select 'aucun envoi : service non configuré',
       case when not (select provider_ready from public.whatsapp_settings) then 'ok' else 'À VÉRIFIER' end
union all
select 'confirmation : commande acceptée par le serveur',
       case when (select confirmation_requires_paid from public.whatsapp_settings) = false then 'ok' else 'À VÉRIFIER' end;
