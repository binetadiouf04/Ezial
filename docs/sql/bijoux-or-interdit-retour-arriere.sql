-- Retour arrière de docs/sql/bijoux-or-interdit.sql : retire la règle côté
-- serveur « pas de bijoux en or véritable » et ses fonctions.
-- Ne réactive AUCUN produit : les produits désactivés par le script d'origine
-- restent désactivés (la réactivation se fait produit par produit, depuis
-- l'espace vendeur « Activer », une fois la règle retirée).
begin;

drop trigger if exists trg_block_real_gold_jewelry on public.products;
drop function if exists ezial_private.block_real_gold_jewelry();
drop function if exists ezial_private.is_real_gold_jewelry(text, text, text, jsonb);
drop function if exists ezial_private.is_real_gold_material(text);
drop function if exists ezial_private.mentions_real_gold(text);
drop function if exists ezial_private.fold_text(text);

commit;

-- Vérification : 1 ligne « ok » attendue.
select 'règle « or véritable » retirée' as element,
       case when not exists (select 1 from pg_trigger where tgname = 'trg_block_real_gold_jewelry' and not tgisinternal)
             and not exists (select 1 from pg_proc where proname in ('block_real_gold_jewelry', 'is_real_gold_jewelry', 'is_real_gold_material', 'mentions_real_gold') and pronamespace = 'ezial_private'::regnamespace)
            then 'ok' else 'À VÉRIFIER' end as etat;
