-- Ezial — boutiques supprimées : la suppression de compte d'un vendeur
-- anonymise enfin sa boutique. Deux obstacles bloquaient l'anonymisation :
--   1. la contrainte shops_status_check n'acceptait pas le statut 'deleted' ;
--   2. le déclencheur prevent_seller_status_change remettait silencieusement
--      l'ancien statut pour tout appelant non administrateur.
-- Ajoute aussi la fonction serveur qui anonymise une boutique et retire ses
-- produits de la vente (archivés, jamais supprimés : l'historique des
-- commandes en dépend), puis rattrape les 6 boutiques déjà anonymisées avant
-- ce correctif (« Boutique supprimée » restées en brouillon / suspendue,
-- avec leur ancien nom d'utilisateur toujours occupé).
-- Aucune ligne n'est supprimée. Rejouable, une transaction.
begin;

-- 1. Le statut 'deleted' est autorisé.
do $$
declare c text;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.shops'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%status%' and pg_get_constraintdef(oid) ilike '%draft%'
  loop
    execute format('alter table public.shops drop constraint %I', c);
  end loop;
end $$;
alter table public.shops add constraint shops_status_check
  check (status = any (array['draft', 'pending', 'active', 'suspended', 'rejected', 'flagged', 'disabled', 'paused', 'deleted']));

-- 2. Le déclencheur laisse passer la suppression, uniquement quand la
--    fonction serveur ci-dessous l'a demandé dans sa propre transaction.
create or replace function public.prevent_seller_status_change()
returns trigger
language plpgsql
as $function$
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

-- 3. Anonymisation d'une boutique (appelée par la fonction de suppression de
--    compte, avec la clé serveur uniquement).
create or replace function public.anonymize_deleted_shop(p_shop_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('ezial.allow_shop_deletion', 'on', true);
  update public.shops set
    name = 'Boutique supprimée',
    description = null, phone = null, address_text = null,
    logo_url = null, cover_url = null, neighborhood = null,
    latitude = null, longitude = null,
    status = 'deleted',
    -- libère le nom d'utilisateur choisi par le vendeur
    seller_code = 'supprime-' || left(id::text, 8)
  where id = p_shop_id;
  -- Ses produits quittent la vente (archivés comme quand un vendeur supprime
  -- un produit ayant un historique) ; rien n'est effacé.
  update public.products set status = 'disabled', archived_at = coalesce(archived_at, now())
   where shop_id = p_shop_id and (status <> 'disabled' or archived_at is null);
end;
$$;
revoke all on function public.anonymize_deleted_shop(uuid) from public, anon, authenticated;
grant execute on function public.anonymize_deleted_shop(uuid) to service_role;

-- 4. Rattrapage des boutiques déjà anonymisées avant ce correctif.
select public.anonymize_deleted_shop(id) from public.shops
 where name = 'Boutique supprimée' and status <> 'deleted';

commit;

-- Vérification : 4 lignes « ok » attendues.
select 'statut « deleted » autorisé' as element,
       case when exists (select 1 from pg_constraint where conname = 'shops_status_check' and pg_get_constraintdef(oid) ilike '%deleted%') then 'ok' else 'À VÉRIFIER' end as etat
union all
select 'anciennes boutiques supprimées rattrapées',
       case when not exists (select 1 from public.shops where name = 'Boutique supprimée' and status <> 'deleted') then 'ok' else 'À VÉRIFIER' end
union all
select 'aucun produit actif dans une boutique supprimée',
       case when not exists (select 1 from public.products p join public.shops s on s.id = p.shop_id where s.status = 'deleted' and p.status = 'active') then 'ok' else 'À VÉRIFIER' end
union all
select 'anonymisation : clé serveur seulement',
       case when not has_function_privilege('authenticated', 'public.anonymize_deleted_shop(uuid)', 'execute')
             and not has_function_privilege('anon', 'public.anonymize_deleted_shop(uuid)', 'execute') then 'ok' else 'À VÉRIFIER' end;
