-- Ezial — pas de bijoux en or véritable.
-- La vente de bijoux en or massif ou véritable (18K, 21K, 22K, 24K…) n'est plus
-- autorisée : fluctuation du prix de l'or et contraintes de vente. Les bijoux
-- plaqués or, dorés, fantaisie, en acier inoxydable et les autres accessoires
-- restent autorisés (« plaqué or », « doré », « couleur or » ne sont PAS bloqués).
--
-- Ce script :
--   1. ajoute la règle côté serveur, qui ne peut pas être contournée depuis
--      l'API : un produit de la catégorie « bijoux » dont la matière est « Or »
--      ou dont le nom / la description / une caractéristique annonce de l'or
--      véritable (or massif, or véritable, or 18K, or 21 carats, 18 carats
--      d'or, or 750, solid gold, 18K gold…) ne peut plus être enregistré
--      autrement qu'au statut « disabled » (désactivé) ;
--   2. désactive (statut « disabled ») les produits en or véritable déjà
--      enregistrés. Rien n'est supprimé : fiche, photos, stock, historique de
--      commandes et avis restent intacts, et le vendeur les voit toujours dans
--      son espace (il ne peut simplement plus les réactiver).
-- Aucune commande, aucune autre catégorie touchée. Rejouable, une transaction.
-- Retour arrière : docs/sql/bijoux-or-interdit-retour-arriere.sql
-- Même raisonnement que src/lib/goldJewelry.ts (testé des deux côtés sur les mêmes cas).
begin;

-- Minuscules, sans accents, apostrophes droites, espaces simples.
create or replace function ezial_private.fold_text(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(translate(replace(replace(lower(p_text), 'œ', 'oe'), 'æ', 'ae'), 'àâäáãåçéèêëíìîïñóòôöõúùûüýÿ’‘`´', 'aaaaaaceeeeiiiinooooouuuuyy'''''''''), '\s+', ' ', 'g'))
$$;

-- Vrai si le texte annonce de l'or véritable (et pas du plaqué, du doré ou de la couleur or).
create or replace function ezial_private.mentions_real_gold(p_text text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  t text;
begin
  if p_text is null or btrim(p_text) = '' then return false; end if;
  t := ezial_private.fold_text(p_text);
  -- Formulations expressément autorisées : retirées avant la recherche.
  t := regexp_replace(t, '\yplaque(?:e|es|s)?\s+(?:en\s+|d''\s*)?or\y(?:\s+(?:jaune|blanc|rose|fin))?(?:\s*(?:8|9|10|14|18|21|22|24)\s*(?:k|kt|ct|carats?|karats?)\y)?', ' ', 'g');
  t := regexp_replace(t, '\ydore(?:e|es|s)?\s+a\s+l''\s*or\y(?:\s+fin)?(?:\s*(?:8|9|10|14|18|21|22|24)\s*(?:k|kt|ct|carats?|karats?)\y)?', ' ', 'g');
  t := regexp_replace(t, '\ygold[\s-]*(?:plated|filled|tone)\y', ' ', 'g');
  t := regexp_replace(t, '\y(?:couleur|effet|ton|teinte|finition|aspect|imitation|style|facon|nuance|type)\s+(?:d''\s*)?or\y', ' ', 'g');
  return t ~ '\yor\s+(?:massif|veritable|pur|fin|natif)\y'
      or t ~ '\yvraie?\s+or\y'
      or t ~ '\yor\s+(?:(?:jaune|blanc|gris|rose)\s+)?(?:de\s+)?(?:8|9|10|14|18|21|22|24)\s*(?:k|kt|ct|carats?|karats?)\y'
      or t ~ '\y(?:8|9|10|14|18|21|22|24)\s*(?:k|kt|ct|carats?|karats?)\s+(?:d''\s*)?(?:or|gold)\y'
      or t ~ '\ygold\s+(?:8|9|10|14|18|21|22|24)\s*(?:k|kt|ct|carats?|karats?)\y'
      or t ~ '\y(?:solid|real|pure)\s+gold\y'
      or t ~ '\yor\s+(?:375|585|750|916|999)\y';
end;
$$;

-- Vrai si la valeur d'une caractéristique « Matière » est de l'or véritable.
create or replace function ezial_private.is_real_gold_material(p_value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select ezial_private.fold_text(p_value) ~ '^or(?:\s+(?:jaune|blanc|gris|rose|massif|fin|pur))?$'
      or ezial_private.mentions_real_gold(p_value)
$$;

-- Vrai si le produit est un bijou en or véritable (catégorie « bijoux » seulement :
-- « gold 24K » est courant en cosmétique).
create or replace function ezial_private.is_real_gold_jewelry(
  p_category text, p_name text, p_description text, p_attributes jsonb
) returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_category = 'bijoux'
     and (
       ezial_private.mentions_real_gold(p_name)
       or ezial_private.mentions_real_gold(p_description)
       or exists (
         select 1
           from jsonb_each(case when jsonb_typeof(p_attributes) = 'object' then p_attributes else '{}'::jsonb end) e(k, v),
                jsonb_array_elements_text(case when jsonb_typeof(e.v) = 'array' then e.v else jsonb_build_array(e.v) end) val
          where case
                  when ezial_private.fold_text(e.k) in ('matiere', 'matieres', 'material')
                    then ezial_private.is_real_gold_material(val)
                  else ezial_private.mentions_real_gold(val)
                end
       )
     )
$$;

-- Règle appliquée à chaque création / modification de produit, pour tous les
-- rôles (vendeur, application, API). Un produit désactivé reste modifiable.
create or replace function ezial_private.block_real_gold_jewelry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from 'disabled'
     and ezial_private.is_real_gold_jewelry(new.category, new.name, new.description, new.descriptive_attributes) then
    raise exception 'La vente de bijoux en or véritable n’est pas autorisée sur Ezial.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function ezial_private.fold_text(text) from public, anon, authenticated;
revoke all on function ezial_private.mentions_real_gold(text) from public, anon, authenticated;
revoke all on function ezial_private.is_real_gold_material(text) from public, anon, authenticated;
revoke all on function ezial_private.is_real_gold_jewelry(text, text, text, jsonb) from public, anon, authenticated;
revoke all on function ezial_private.block_real_gold_jewelry() from public, anon, authenticated;

drop trigger if exists trg_block_real_gold_jewelry on public.products;
create trigger trg_block_real_gold_jewelry
  before insert or update on public.products
  for each row execute function ezial_private.block_real_gold_jewelry();

-- Produits en or véritable déjà enregistrés : désactivés, jamais supprimés.
update public.products p
   set status = 'disabled'
 where p.status is distinct from 'disabled'
   and ezial_private.is_real_gold_jewelry(p.category, p.name, p.description, p.descriptive_attributes);

commit;

-- Vérification : 4 lignes « ok » attendues.
select 'règle serveur installée' as element,
       case when exists (select 1 from pg_trigger where tgname = 'trg_block_real_gold_jewelry' and tgrelid = 'public.products'::regclass and not tgisinternal) then 'ok' else 'À VÉRIFIER' end as etat
union all
select 'plus aucun bijou en or véritable en vente',
       case when not exists (select 1 from public.products p where p.status <> 'disabled'
                              and ezial_private.is_real_gold_jewelry(p.category, p.name, p.description, p.descriptive_attributes)) then 'ok' else 'À VÉRIFIER' end
union all
select 'plaqué or, perles, acier et accessoires toujours en vente',
       case when (select count(*) from public.products where category = 'bijoux' and status = 'active') >= 1 then 'ok' else 'À VÉRIFIER' end
union all
select 'aucun produit supprimé : fiches conservées',
       case when (select count(*) from public.products where category = 'bijoux') >= 1 then 'ok' else 'À VÉRIFIER' end;
