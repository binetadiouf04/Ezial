#!/usr/bin/env bash
# Accès simultanés (processus psql réels en parallèle) : stock, restitution, confirmations.
set -uo pipefail
export PGHOST="${PGHOST:-/tmp}" PGPORT="${PGPORT:-54555}" PGUSER="${PGUSER:-postgres}"
DB=ezial_om_test
Q() { psql -qXtA -d $DB -c "$1" 2>/dev/null; }
fail=0
ok()  { echo "OK    : $1"; }
ko()  { echo "ÉCHEC : $1"; fail=1; }

# 1. Survente : stock 5, 14 acheteurs simultanés d'une unité -> exactement 5 réussites, jamais de stock négatif
Q "select tests.reset(); update public.product_variants set stock = 5 where id = '00000000-0000-4000-8000-0000000000f1';" >/dev/null
for i in $(seq 1 14); do Q "select tests.try_buy(1)" > /tmp/claude-conc-$i.out & done; wait
okc=$(cat /tmp/claude-conc-*.out | grep -c '^ok$'); rm -f /tmp/claude-conc-*.out
stock=$(Q "select stock from public.product_variants where id = '00000000-0000-4000-8000-0000000000f1'")
[ "$okc" = "5" ] && ok "Concurrence : 14 achats simultanés pour 5 unités -> 5 commandes exactement" || ko "Concurrence : $okc commandes réussies au lieu de 5"
[ "$stock" = "0" ] && ok "Concurrence : stock final 0, jamais négatif" || ko "Concurrence : stock final $stock"
[ "$(Q "select count(*) from public.orders")" = "5" ] && ok "Concurrence : 5 commandes en base, aucune en trop" || ko "Concurrence : nombre de commandes incorrect"

# 2. Restitution : 12 appels simultanés sur la même commande annulée -> stock rendu UNE seule fois
Q "select tests.reset(); update public.payment_settings set orange_money_enabled = true;" >/dev/null
oid=$(Q "select tests.place('orange_money', false, 4)")
Q "update public.orders set status = 'cancelled' where id = '$oid'" >/dev/null
[ "$(Q "select stock from public.product_variants where id = '00000000-0000-4000-8000-0000000000f1'")" = "6" ] || ko "Concurrence : stock de départ inattendu"
for i in $(seq 1 12); do Q "select ezial_private.restock_order('$oid')" > /tmp/claude-conc-$i.out & done; wait
released=$(cat /tmp/claude-conc-*.out | grep -c '^released$'); rm -f /tmp/claude-conc-*.out
stock=$(Q "select stock from public.product_variants where id = '00000000-0000-4000-8000-0000000000f1'")
[ "$released" = "1" ] && ok "Concurrence : 12 restitutions simultanées -> une seule effective" || ko "Concurrence : $released restitutions effectives"
[ "$stock" = "10" ] && ok "Concurrence : stock restitué une seule fois (6 -> 10)" || ko "Concurrence : stock final $stock au lieu de 10"

# 3. Confirmations simultanées du même paiement (notification répétée) -> une seule prise en compte
Q "select tests.reset(); update public.payment_settings set orange_money_enabled = true;" >/dev/null
oid=$(Q "select tests.place('orange_money', true)")
tot=$(Q "select total_amount from public.orders where id = '$oid'")
tid=$(Q "select id from public.payments_create_transaction('$oid', 'orange_money', '00000000-0000-4000-8000-0000000000c1')")
for i in $(seq 1 10); do Q "select public.payments_record_verification('$tid', 'confirmed', $tot, 'MPX')" > /tmp/claude-conc-$i.out & done; wait
okc=$(cat /tmp/claude-conc-*.out | grep -c '^confirm:confirmed$'); rm -f /tmp/claude-conc-*.out
[ "$okc" = "1" ] && ok "Concurrence : 10 confirmations simultanées -> une seule effective" || ko "Concurrence : $okc confirmations effectives"
sn=$(Q "select count(*) from public.notifications where order_id = '$oid' and type = 'seller_new_order'")
sales=$(Q "select count(*) from public.seller_transactions where order_id = '$oid'")
[ "$sn" = "2" ] && [ "$sales" = "2" ] && ok "Concurrence : vendeurs notifiés une fois (2) et 2 parts vendeur, sans doublon" || ko "Concurrence : notifications=$sn parts=$sales"

# 4. Annulation automatique en parallèle de la restitution : une seule annulation, un seul remboursement de stock
Q "select tests.reset(); update public.payment_settings set orange_money_enabled = true;" >/dev/null
oid=$(Q "select tests.place('orange_money', false, 3)")
Q "update public.orders set payment_deadline = now() - interval '1 hour', payment_grace_until = now() - interval '5 minutes'" >/dev/null
for i in $(seq 1 8); do Q "select ezial_private.orders_finalize_unpaid()" > /tmp/claude-conc-$i.out & done; wait
total=$(cat /tmp/claude-conc-*.out | paste -sd+ | bc); rm -f /tmp/claude-conc-*.out
stock=$(Q "select stock from public.product_variants where id = '00000000-0000-4000-8000-0000000000f1'")
[ "$total" = "1" ] && ok "Concurrence : 8 passages simultanés de l'annulation -> une seule annulation" || ko "Concurrence : $total annulations"
[ "$stock" = "10" ] && ok "Concurrence : stock restitué une seule fois après annulation simultanée" || ko "Concurrence : stock $stock"
[ "$(Q "select count(*) from public.notifications where order_id = '$oid' and type = 'order_cancelled'")" = "1" ] && ok "Concurrence : le client n'est prévenu qu'une fois" || ko "Concurrence : notifications d'annulation en double"
exit $fail
