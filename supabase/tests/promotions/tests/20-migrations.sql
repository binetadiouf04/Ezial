-- MIGRATIONS : relançables, reprise d'EZI10, quartiers, changement CIBLÉ de create_order et trg_orders_on_paid.
do $$
declare v_removed text[]; v_added text[]; n integer; p jsonb;
begin
  -- Seconde application : aucune fonction ne change, rien n'est dupliqué
  select count(*) into n from tests.after_first a full join (select p.oid::regprocedure::text sig, md5(pg_get_functiondef(p.oid)) h from pg_proc p
     where p.pronamespace in ('public'::regnamespace, 'ezial_private'::regnamespace)) b using (sig) where a.h is distinct from b.h;
  perform tests.check(n = 0, 'Migrations : la seconde application ne change aucune fonction');
  perform tests.check(to_regclass('public.delivery_neighborhoods') is null and to_regclass('public.promotion_neighborhoods') is null, 'Migration 1 : aucune table de quartiers (livraison : toute la région de Dakar)');
  perform tests.check((select count(*) from public.promotions) = 1, 'Migration 1 : EZI10 repris une seule fois');
  p := tests.promo('EZI10');
  perform tests.check(p->>'status' = 'paused' and p->>'kind' = 'percent' and (p->>'value')::numeric = 10 and (p->>'min_amount')::int = 0
    and (p->>'ends_at')::timestamptz = '2026-12-31 00:00:00+00' and (p->>'starts_at')::timestamptz = '2026-09-24 02:45:34+00' and p->>'code' = 'EZI10',
    'Migration 1 : EZI10 repris en campagne SUSPENDUE, 10 %, dates reprises');
  perform tests.check((select count(*) from public.promo_codes where code = 'EZI10' and not is_active) = 1, 'Migration 1 : promo_codes intacte');
  perform tests.check((select count(*) from public.orders where promo_discount <> 0 or delivery_discount <> 0 or promotion_id is not null) = 0
    and (select count(*) from public.order_shops where promo_allocation <> 0 or promo_seller_share <> 0) = 0, 'Migration 1 : commandes existantes inchangées (0 / vide)');

  -- create_order : seules les lignes du bloc « code promo » changent (comparaison ligne à ligne avec la production)
  select array_agg(l) into v_removed from (
    select l, row_number() over (partition by l) k from regexp_split_to_table((select def from tests.base_defs where sig = 'create_order(jsonb)'), E'\n') l
    except select l, row_number() over (partition by l) from regexp_split_to_table(pg_get_functiondef('public.create_order(jsonb)'::regprocedure), E'\n') l) x;
  select array_agg(l) into v_added from (
    select l, row_number() over (partition by l) k from regexp_split_to_table(pg_get_functiondef('public.create_order(jsonb)'::regprocedure), E'\n') l
    except select l, row_number() over (partition by l) from regexp_split_to_table((select def from tests.base_defs where sig = 'create_order(jsonb)'), E'\n') l) x;
  perform tests.check(cardinality(v_removed) = 9 and (select bool_and(l ~ '(promo|^\s*else$|^\s*end if;$|^total_amount =)') from unnest(v_removed) l),
    'create_order : 9 lignes retirées, toutes dans le bloc « code promo » (' || array_to_string(v_removed, ' ¦ ') || ')');
  perform tests.check(cardinality(v_added) = 9 and (select bool_and(l ~ '(promo|^--|^promotion_id|^delivery_discount|^total_amount =)') from unnest(v_added) l),
    'create_order : 9 lignes ajoutées, toutes dans le bloc campagnes');
  -- trg_orders_on_paid : 2 lignes seulement
  select count(*) into n from (
    select l from regexp_split_to_table((select def from tests.base_defs where sig = 'ezial_private.trg_orders_on_paid()'), E'\n') l
    except select l from regexp_split_to_table(pg_get_functiondef('ezial_private.trg_orders_on_paid()'::regprocedure), E'\n') l) x;
  perform tests.check(n = 2 and position('round(s.subtotal - s.promo_seller_share - s.commission_amount)::integer' in pg_get_functiondef('ezial_private.trg_orders_on_paid()'::regprocedure)) > 0,
    'trg_orders_on_paid : seules les 2 lignes de montant de la vente changent');
  -- Les droits d'exécution des fonctions remplacées sont conservés
  select count(*) into n from tests.base_defs b join pg_proc p on p.oid::regprocedure::text = b.sig where b.acl <> coalesce(p.proacl::text, '');
  perform tests.check(n = 0, 'Migrations : droits des fonctions existantes inchangés');
end $$;
