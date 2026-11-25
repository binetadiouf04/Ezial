#!/usr/bin/env bash
# Commandes SIMULTANÉES (vrais processus psql en parallèle) sur la dernière utilisation, le budget, une campagne
# automatique, et annulations simultanées.
set -uo pipefail
export PGHOST="${PGHOST:-/tmp}" PGPORT="${PGPORT:-54555}" PGUSER="${PGUSER:-postgres}"
DB="${DB:-ezial_promo_test}"
TMPD=$(mktemp -d)
Q() { psql -qXtA -d "$DB" -c "$1" 2>/dev/null; }
fail=0
ok() { echo "OK    : $1"; }
ko() { echo "ÉCHEC : $1"; fail=1; }
client() { printf "00000000-0000-4000-8000-0000000001%02d" "$1"; }
run12() {   # $1 = extra jsonb ; lance 12 commandes de 12 clients différents en même temps
  for i in $(seq 1 12); do Q "select tests.try_buy_msg('$(client "$i")', jsonb_build_array(tests.it('1')), '$1')" > "$TMPD/$i.out" & done; wait
}

# 1. Dernière utilisation : limite totale 1, 12 commandes simultanées -> une seule passe
Q "select tests.reset_promo(); update public.product_variants set stock = 100; select tests.new_promo('DERNIERE', 'percent', 10, '{\"max_uses_total\": 1}');" >/dev/null
run12 '{"promoCode": "DERNIERE"}'
okc=$(cat "$TMPD"/*.out | grep -c '^ok$'); refus=$(cat "$TMPD"/*.out | grep -c "^Ce code n'est plus disponible.$"); rm -f "$TMPD"/*.out
[ "$okc" = "1" ] && [ "$refus" = "11" ] && ok "Concurrence : 12 commandes simultanées sur la dernière utilisation -> 1 acceptée, 11 refusées (« plus disponible »)" || ko "Concurrence : $okc acceptées, $refus refus"
[ "$(Q "select uses_count || '/' || budget_used || '/' || (select count(*) from public.promotion_redemptions where status = 'counted') || '/' || (select count(*) from public.orders) from public.promotions where code = 'DERNIERE'")" = "1/1000/1/1" ] \
  && ok "Concurrence : uses_count 1, budget 1 000, 1 utilisation, 1 commande (aucune commande orpheline)" || ko "Concurrence : compteurs incohérents"

# 2. Budget : 1 000 de budget, chaque commande coûte 1 000 -> une seule passe
Q "select tests.reset_promo(); update public.product_variants set stock = 100; select tests.new_promo('BUDGET1', 'percent', 10, '{\"budget_max\": 1000}');" >/dev/null
run12 '{"promoCode": "BUDGET1"}'
okc=$(cat "$TMPD"/*.out | grep -c '^ok$'); rm -f "$TMPD"/*.out
[ "$okc" = "1" ] && [ "$(Q "select budget_used from public.promotions where code = 'BUDGET1'")" = "1000" ] && ok "Concurrence : budget jamais dépassé (12 simultanées -> 1 acceptée, budget 1 000/1 000)" || ko "Concurrence : budget $okc acceptées"

# 3. Campagne automatique limitée à 1 : les 12 commandes passent, une seule reçoit la campagne
Q "select tests.reset_promo(); update public.product_variants set stock = 100; select tests.new_promo(null, 'free_delivery', 0, '{\"max_uses_total\": 1}');" >/dev/null
run12 '{}'
okc=$(cat "$TMPD"/*.out | grep -c '^ok$'); rm -f "$TMPD"/*.out
[ "$okc" = "12" ] && [ "$(Q "select count(*) from public.orders where promotion_id is not null")" = "1" ] && [ "$(Q "select uses_count from public.promotions where code is null")" = "1" ] \
  && ok "Concurrence : campagne automatique limitée -> 12 commandes acceptées, 1 seule avec la livraison offerte" || ko "Concurrence : automatique ($okc commandes)"

# 4. Annulations simultanées de la même commande -> utilisation, budget et compensation rendus une fois
Q "select tests.reset_promo(); update public.product_variants set stock = 100; select tests.new_promo('ANNUL', 'percent', 10);" >/dev/null
oid=$(Q "select tests.buy_code('$(client 1)', jsonb_build_array(tests.it('1'), tests.it('2')), 'ANNUL')->>'id'")
Q "select tests.buy_code('$(client 2)', jsonb_build_array(tests.it('1')), 'ANNUL')" >/dev/null
for i in $(seq 1 10); do Q "update public.orders set status = 'cancelled', updated_at = now() where id = '$oid'" >/dev/null & done; wait
[ "$(Q "select uses_count || '/' || budget_used from public.promotions where code = 'ANNUL'")" = "1/1000" ] && ok "Concurrence : 10 annulations simultanées -> rendu une seule fois (2 -> 1 utilisation, budget 4 000 -> 1 000)" || ko "Concurrence : annulation $(Q "select uses_count || '/' || budget_used from public.promotions where code = 'ANNUL'")"
[ "$(Q "select count(*) from public.finance_audit_log where action = 'promotion_released'")" = "1" ] && [ "$(Q "select string_agg(status, ',' order by shop_id) from public.promotion_compensations where order_id = '$oid'")" = "cancelled,cancelled" ] \
  && ok "Concurrence : une seule restitution, compensations annulées" || ko "Concurrence : restitutions multiples"

# 5. Impayés Orange Money annulés par plusieurs passages simultanés -> rendus une fois
Q "select tests.reset_promo(); update public.product_variants set stock = 100; update public.payment_settings set orange_money_enabled = true; select tests.new_promo('IMPAYE', 'fixed', 1000);" >/dev/null
for i in 1 2 3; do Q "select tests.buy_code('$(client "$i")', jsonb_build_array(tests.it('1')), 'IMPAYE', '{}', 'orange_money')" >/dev/null; done
Q "update public.orders set payment_deadline = now() - interval '1 hour', payment_grace_until = now() - interval '5 minutes'" >/dev/null
for i in $(seq 1 8); do Q "select ezial_private.orders_finalize_unpaid()" > "$TMPD/$i.out" & done; wait
total=$(cat "$TMPD"/*.out | paste -sd+ | bc); rm -f "$TMPD"/*.out
[ "$total" = "3" ] && [ "$(Q "select uses_count || '/' || budget_used from public.promotions where code = 'IMPAYE'")" = "0/0" ] \
  && [ "$(Q "select count(*) from public.promotion_redemptions where status = 'cancelled'")" = "3" ] \
  && ok "Concurrence : 8 passages simultanés de l'annulation des impayés -> 3 annulations, utilisations et budget rendus une fois (0/0)" || ko "Concurrence : impayés ($total, $(Q "select uses_count || '/' || budget_used from public.promotions where code = 'IMPAYE'"))"
# 6. Limite PAR CLIENT : le même client envoie 6 commandes simultanées (limite 1 par client, aucune limite totale)
Q "select tests.reset_promo(); update public.product_variants set stock = 100; select tests.new_promo('UNPARCLIENT', 'percent', 10, '{\"max_uses_per_customer\": 1}');" >/dev/null
for i in $(seq 1 6); do Q "select tests.try_buy_msg('$(client 1)', jsonb_build_array(tests.it('1')), '{\"promoCode\": \"UNPARCLIENT\"}')" > "$TMPD/$i.out" & done; wait
okc=$(cat "$TMPD"/*.out | grep -c '^ok$'); refus=$(cat "$TMPD"/*.out | grep -c "^Vous avez déjà utilisé ce code.$"); rm -f "$TMPD"/*.out
[ "$okc" = "1" ] && [ "$refus" = "5" ] && [ "$(Q "select uses_count || '/' || (select count(*) from public.orders) from public.promotions where code = 'UNPARCLIENT'")" = "1/1" ] \
  && ok "Concurrence : même client, 6 commandes simultanées, limite 1 par client -> 1 acceptée, 5 refusées (« déjà utilisé »), 1 utilisation" \
  || ko "Concurrence : limite par client ($okc acceptées, $refus refus)"
# Un autre client peut toujours l'utiliser
[ "$(Q "select tests.try_buy_msg('$(client 2)', jsonb_build_array(tests.it('1')), '{\"promoCode\": \"UNPARCLIENT\"}')")" = "ok" ] \
  && ok "Concurrence : limite par client -> un autre client peut encore utiliser le code" || ko "Concurrence : limite par client bloque un autre client"

# 7. Nouveaux clients : un client sans commande envoie 6 commandes simultanées avec un code « nouveaux clients »
Q "select tests.reset_promo(); update public.product_variants set stock = 100; select tests.new_promo('BIENVENUE', 'fixed', 1000, '{\"audience\": \"new_customers\"}');" >/dev/null
for i in $(seq 1 6); do Q "select tests.try_buy_msg('$(client 3)', jsonb_build_array(tests.it('1')), '{\"promoCode\": \"BIENVENUE\"}')" > "$TMPD/$i.out" & done; wait
okc=$(cat "$TMPD"/*.out | grep -c '^ok$'); refus=$(cat "$TMPD"/*.out | grep -c "^Ce code est réservé aux nouveaux clients.$"); rm -f "$TMPD"/*.out
[ "$okc" = "1" ] && [ "$refus" = "5" ] && ok "Concurrence : nouveau client, 6 commandes simultanées -> 1 seule avec le code « nouveaux clients », 5 refusées" \
  || ko "Concurrence : nouveaux clients ($okc acceptées, $refus refus)"

rmdir "$TMPD" 2>/dev/null
exit $fail
