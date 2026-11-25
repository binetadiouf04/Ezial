#!/usr/bin/env bash
# Génère docs/sql/promotions-2-retour-arriere.sql : les trois fonctions de PRODUCTION (create_order,
# trg_orders_on_paid, validate_promo_code) sont recopiées TELLES QUELLES depuis 10-production.sql
# (blocs « @@ restaure »), le texte exact lu en production (create_order le 25 nov. 2026, avec la livraison
# urgente) et contrôlé par empreinte md5.
set -euo pipefail
cd "$(dirname "$0")"
OUT=../../../docs/sql/promotions-2-retour-arriere.sql
cat > "$OUT" <<'HEAD'
-- ============================================================================
-- Ezial — Campagnes promotionnelles — RETOUR ARRIÈRE de la MIGRATION 2 (promotions-2-commande.sql)
-- Fichier GÉNÉRÉ par supabase/tests/promotions/build-rollback.sh (ne pas modifier à la main).
--
-- QUOI : rétablit EXACTEMENT les fonctions de production d'avant les campagnes (create_order AVEC la livraison
--   urgente, relue le 25 nov. 2026 ; ezial_private.trg_orders_on_paid, validate_promo_code : lues le 21 nov. 2026),
--   retire l'aperçu, la liste publique, le calcul, l'application et les déclencheurs d'annulation.
--   Les tables et colonnes (migration 1) et leurs données sont CONSERVÉES.
-- REFUSÉ (rien n'est modifié) si une commande non annulée utilise encore une campagne (utilisation « comptée ») :
--   l'argent engagé (réduction accordée, parts vendeurs déduites) serait perdu de vue. Pour vérifier :
--     select r.order_id, o.order_number, o.status from public.promotion_redemptions r join public.orders o on o.id = r.order_id
--      where r.status = 'counted' and o.status <> 'cancelled';
-- AVANT : exécuter docs/sql/promotions-3-retour-arriere.sql. Ensuite seulement : promotions-1-retour-arriere.sql.
-- ATTENTION : si create_order a été modifiée par une AUTRE migration après les campagnes, ce retour arrière
--   effacerait cette modification ; il le détecte quand la version d'origine enregistrée par la migration 2
--   diffère du texte ci-dessous, et s'arrête alors sans rien modifier.
-- LIVRAISON URGENTE : tant que les campagnes sont en place, NE PAS exécuter
--   docs/sql/lancement-livraison-urgente-retour-arriere.sql (il réécrit create_order entièrement et
--   effacerait les campagnes) : faire d'abord ce retour arrière-ci (3, 2, 1), puis seulement celui de l'urgence.
-- ============================================================================
begin;

do $$
declare v_used boolean := false;   -- requête dynamique : relançable une fois les tables supprimées
begin
  if to_regclass('public.promotion_redemptions') is not null then
    execute 'select exists (select 1 from public.promotion_redemptions r join public.orders o on o.id = r.order_id
              where r.status = ''counted'' and o.status <> ''cancelled'')' into v_used;
  end if;
  if v_used then
    raise exception 'Des commandes non annulées utilisent encore une campagne : retour arrière refusé (rien n''a été modifié).';
  end if;
end $$;

-- 1. Déclencheurs ajoutés
drop trigger if exists trg_promotions_order_cancelled on public.orders;

-- 2. Fonctions de production restaurées (texte exact)
HEAD
sed -n '/^-- @@ restaure : debut/,/^-- @@ restaure : fin/p' 10-production.sql | sed '1d;$d' >> "$OUT"
cat >> "$OUT" <<'TAIL'

-- 3. Contrôle : chaque fonction restaurée est identique (fins de ligne mises à part) à la version d'origine
--    enregistrée par la migration 2 ; sinon tout est annulé.
do $$
declare v record;
begin
  if to_regclass('ezial_private.promotions_saved_functions') is null then return; end if;
  for v in select s.sig, s.def from ezial_private.promotions_saved_functions s loop
    if md5(replace(v.def, chr(13), '')) <> md5(replace(pg_get_functiondef(v.sig::regprocedure), chr(13), '')) then
      raise exception '% avait une autre version avant les campagnes : retour arrière annulé, rien n''a été modifié.', v.sig;
    end if;
  end loop;
end $$;

-- 4. Fonctions ajoutées par la migration 2
drop function if exists public.promotions_preview(jsonb);
drop function if exists public.public_active_promotions();
drop function if exists ezial_private.promotion_apply_to_order(uuid, text, integer);
drop function if exists ezial_private.promotion_best_automatic(jsonb, uuid, integer, uuid, boolean);
drop function if exists ezial_private.promotion_compute(public.promotions, jsonb, uuid, integer, uuid, jsonb);
drop function if exists ezial_private.promotion_line_matches(uuid, jsonb);
drop function if exists ezial_private.promotion_fcfa(numeric);
drop function if exists ezial_private.promotion_release_order(uuid);
drop function if exists ezial_private.trg_promotions_order_cancelled();
drop table if exists ezial_private.promotions_saved_functions;

commit;

-- Vérification : « true » attendu deux fois.
select position('promotion_apply_to_order' in pg_get_functiondef('public.create_order(jsonb)'::regprocedure)) = 0 as create_order_restauree,
       position('promo_seller_share' in pg_get_functiondef('ezial_private.trg_orders_on_paid()'::regprocedure)) = 0 as paiement_restaure;
TAIL
echo "écrit : $OUT"
