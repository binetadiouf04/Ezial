#!/usr/bin/env bash
# Accès simultanés côté Wave (processus psql réels en parallèle) : confirmations et restitution.
set -uo pipefail
export PGHOST="${PGHOST:-/tmp}" PGPORT="${PGPORT:-54555}" PGUSER="${PGUSER:-postgres}"
DB="${DB:-ezial_wave_test}"
Q() { psql -qXtA -d $DB -c "$1" 2>/dev/null; }
fail=0
ok()  { echo "OK    : $1"; }
ko()  { echo "ÉCHEC : $1"; fail=1; }

# 1. 12 confirmations simultanées d'une même tentative Wave -> UN paiement, UNE série de notifications, UNE série de parts vendeurs
Q "select tests.reset_wave(); update public.payment_settings set wave_enabled = true;" >/dev/null
oid=$(Q "select tests.place('wave', true)")
tid=$(Q "select (public.payments_create_transaction('$oid', 'wave', '00000000-0000-4000-8000-0000000000c1')).id")
total=$(Q "select total_amount from public.orders where id = '$oid'")
for i in $(seq 1 12); do Q "select public.payments_record_verification('$tid', 'confirmed', $total)" > /tmp/claude-wconc-$i.out & done; wait
conf=$(cat /tmp/claude-wconc-*.out | grep -c '^confirm:confirmed$'); rm -f /tmp/claude-wconc-*.out
[ "$conf" = "1" ] && ok "Concurrence Wave : 12 confirmations simultanées -> une seule effective" || ko "Concurrence Wave : $conf confirmations effectives"
[ "$(Q "select (tests.summary('$oid')->>'seller_notifs')::int || ',' || (tests.summary('$oid')->>'customer_confirmed') || ',' || (tests.summary('$oid')->>'sales')")" = "2,1,2" ] \
  && ok "Concurrence Wave : notifications et parts vendeurs créées une seule fois" || ko "Concurrence Wave : doublons de notifications ou de parts vendeurs"

# 2. Restitution du stock d'une commande Wave « à payer » annulée : 12 appels simultanés -> une seule restitution
Q "select tests.reset_wave(); update public.payment_settings set wave_enabled = true;" >/dev/null
oid=$(Q "select tests.place('wave', false, 4)")
Q "update public.orders set status = 'cancelled' where id = '$oid'" >/dev/null
for i in $(seq 1 12); do Q "select ezial_private.restock_order('$oid')" > /tmp/claude-wconc-$i.out & done; wait
released=$(cat /tmp/claude-wconc-*.out | grep -c '^released$'); rm -f /tmp/claude-wconc-*.out
[ "$released" = "1" ] && [ "$(Q "select stock from public.product_variants where id = '00000000-0000-4000-8000-0000000000f1'")" = "10" ] \
  && ok "Concurrence Wave : 12 restitutions simultanées -> stock rendu une seule fois (6 -> 10)" || ko "Concurrence Wave : $released restitutions, stock incorrect"

# 3. Deux annulations simultanées par la tâche planifiée : une seule annulation, un seul message client
Q "select tests.reset_wave(); update public.payment_settings set wave_enabled = true;" >/dev/null
oid=$(Q "select tests.place('wave', false, 2)")
Q "update public.orders set payment_deadline = now() - interval '2 hours', payment_grace_until = now() - interval '1 hour'" >/dev/null
for i in $(seq 1 8); do Q "select ezial_private.orders_finalize_unpaid()" > /tmp/claude-wconc-$i.out & done; wait
total_n=$(cat /tmp/claude-wconc-*.out | awk '{s+=$1} END {print s}'); rm -f /tmp/claude-wconc-*.out
[ "$total_n" = "1" ] && [ "$(Q "select count(*) from public.notifications where order_id = '$oid' and type = 'order_cancelled'")" = "1" ] && [ "$(Q "select stock from public.product_variants where id = '00000000-0000-4000-8000-0000000000f1'")" = "10" ] \
  && ok "Concurrence Wave : 8 annulations simultanées -> une seule, stock restitué une fois" || ko "Concurrence Wave : annulation en double ($total_n)"
exit $fail
