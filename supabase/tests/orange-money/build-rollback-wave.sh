#!/usr/bin/env bash
# Génère docs/sql/wave-retour-arriere.sql : suppression de ce que wave-1-commandes.sql ajoute,
# puis restauration des fonctions de PRODUCTION d'avant Wave (13-baseline-pre-wave.sql).
set -euo pipefail
cd "$(dirname "$0")"
OUT=../../../docs/sql/wave-retour-arriere.sql
cat > "$OUT" <<'HEAD'
-- ============================================================================
-- Wave Checkout — RETOUR ARRIÈRE de wave-1-commandes.sql
-- Rétablit exactement les fonctions de production d'avant Wave (Orange Money inchangé).
-- AVANT de l'exécuter :
--   1. éteindre l'interrupteur :  update public.payment_settings set wave_enabled = false;
--   2. retirer les testeurs Wave :  update public.payment_testers set providers = array_remove(providers, 'wave');
--      puis supprimer les comptes restés sans aucun moyen :  delete from public.payment_testers where cardinality(providers) = 0;
--   3. aucune commande Wave « à payer » ni tentative Wave ouverte ne doit rester (le script le vérifie et s'arrête sinon).
-- La colonne payment_settings.wave_enabled et la colonne payment_testers.providers sont CONSERVÉES (aucune donnée perdue) :
-- voir la fin du script pour les supprimer, ce qui est irréversible.
-- ============================================================================
begin;

do $$
begin
  if exists (select 1 from public.payment_settings where wave_enabled) then
    raise exception 'wave_enabled est encore à true : l''éteindre avant le retour arrière.';
  end if;
  if exists (select 1 from public.payment_testers where not ('orange_money' = any (providers))) then
    raise exception 'Des testeurs Wave sont encore inscrits : les retirer avant le retour arrière.';
  end if;
  if exists (select 1 from public.orders where payment_method = 'wave' and payment_required and paid_processed_at is null and status <> 'cancelled') then
    raise exception 'Des commandes Wave attendent encore un paiement : retour arrière refusé.';
  end if;
  if exists (select 1 from public.payment_transactions where provider = 'wave' and provider_closed_at is null and status in ('initiated', 'pending', 'superseded')) then
    raise exception 'Des tentatives Wave ne sont pas encore closes : retour arrière refusé.';
  end if;
end $$;

-- 1. Nouvelle signature de la vérification périodique supprimée (l'ancienne est restaurée plus bas)
drop function if exists public.payments_reconcile_candidates(integer, text);

-- 2. Fonctions de production restaurées
HEAD
sed -e '/^-- Versions de PRODUCTION/,/^$/d' 13-baseline-pre-wave.sql >> "$OUT"
cat >> "$OUT" <<'TAIL'

-- 3. Droits d'exécution d'origine de la fonction de vérification périodique (réservée au serveur)
revoke execute on function public.payments_reconcile_candidates(integer) from public, anon, authenticated;
grant execute on function public.payments_reconcile_candidates(integer) to service_role;

-- 4. Fonctions ajoutées, supprimées en dernier (plus aucune fonction restaurée ne s'en sert)
drop function if exists ezial_private.is_payment_tester(uuid, text);
drop function if exists ezial_private.payment_provider_label(text);
alter table public.payment_testers drop constraint if exists payment_testers_providers_check;

notify pgrst, 'reload schema';

commit;

-- ============================================================================
-- OPTIONNEL ET IRRÉVERSIBLE : supprimer aussi les colonnes ajoutées (perte de leurs données).
-- ============================================================================
-- begin;
-- alter table public.payment_settings drop column if exists wave_enabled;
-- alter table public.payment_testers drop column if exists providers;
-- commit;
TAIL
echo "écrit : $OUT"
