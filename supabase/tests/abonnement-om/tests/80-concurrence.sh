#!/usr/bin/env bash
# Accès simultanés (processus psql réels en parallèle) : une seule activation par paiement, une seule par boutique.
set -uo pipefail
export PGHOST="${PGHOST:-/tmp}" PGPORT="${PGPORT:-54555}" PGUSER="${PGUSER:-postgres}"
DB=${DB:-ezial_abo_test}
Q() { psql -qXtA -d $DB -c "$1" 2>/dev/null; }
fail=0
ok()  { echo "OK    : $1"; }
ko()  { echo "ÉCHEC : $1"; fail=1; }
T=$(mktemp -d)

# 1. Le même paiement confirmé 12 fois en même temps (callback + rapprochement + rejeux)
Q "select tests.reset_abo()" >/dev/null
shop=$(Q "select tests.mkshop()"); a=$(Q "select tests.attempt('$shop', 'quarterly')")
for i in $(seq 1 12); do Q "select public.subscription_payments_record_verification('$a', 'confirmed', 6000, 'MPC')" > $T/$i.out & done; wait
okc=$(cat $T/*.out | grep -c '^confirm:confirmed$'); rm -f $T/*.out
[ "$okc" = "1" ] && ok "Concurrence : 12 confirmations simultanées du même paiement -> une seule activation" || ko "Concurrence : $okc activations"
[ "$(Q "select count(*) from public.subscription_payments where shop_id = '$shop'")" = "1" ] && ok "Concurrence : une seule ligne de paiement" || ko "Concurrence : lignes de paiement en double"
[ "$(Q "select (select count(*) from public.notifications where shop_id = '$shop' and type = 'subscription_confirmed') || '/' || (select count(*) from public.admin_notifications where shop_id = '$shop' and type = 'subscription_payment_confirmed')")" = "1/1" ] && ok "Concurrence : une notification vendeur, une alerte administratrice" || ko "Concurrence : notifications en double"
[ "$(Q "select (pro_until between now() + interval '3 months' - interval '1 minute' and now() + interval '3 months' + interval '1 minute') from public.seller_subscriptions where shop_id = '$shop'")" = "t" ] && ok "Concurrence : une seule prolongation de 3 mois" || ko "Concurrence : prolongation incorrecte"

# 2. Deux QR de la même boutique payés en même temps : une activation, un doublon
Q "select tests.reset_abo()" >/dev/null
shop=$(Q "select tests.mkshop()"); a=$(Q "select tests.attempt('$shop', 'quarterly')"); Q "update public.subscription_payment_attempts set expires_at = now() + interval '30 seconds' where id = '$a'" >/dev/null; b=$(Q "select tests.attempt('$shop', 'quarterly')")
for i in 1 2 3 4 5 6; do
  Q "select public.subscription_payments_record_verification('$a', 'confirmed', 6000, 'MPA')" > $T/a$i.out &
  Q "select public.subscription_payments_record_verification('$b', 'confirmed', 6000, 'MPB')" > $T/b$i.out &
done; wait
conf=$(cat $T/*.out | grep -c '^confirm:confirmed$'); dup=$(cat $T/*.out | grep -c '^confirm:duplicate_payment$'); rm -f $T/*.out
[ "$conf" = "1" ] && ok "Concurrence : deux QR payés simultanément -> une seule activation" || ko "Concurrence : $conf activations pour deux QR"
[ "$dup" -ge "1" ] && ok "Concurrence : l'autre paiement est signalé « double paiement »" || ko "Concurrence : aucun double paiement signalé"
[ "$(Q "select count(*) from public.subscription_payments where shop_id = '$shop'")" = "1" ] && ok "Concurrence : une seule ligne d'historique pour la boutique" || ko "Concurrence : plusieurs lignes d'historique"
[ "$(Q "select count(*) from public.payment_anomalies where kind = 'double_payment' and subscription_attempt_id in ('$a', '$b')")" = "1" ] && ok "Concurrence : une seule anomalie de double paiement" || ko "Concurrence : anomalies en double"

# 3. Initiations simultanées : une seule tentative ouverte
Q "select tests.reset_abo()" >/dev/null
shop=$(Q "select tests.mkshop()")
for i in $(seq 1 10); do Q "select (public.subscription_payments_create_attempt('$shop', 'quarterly', 'orange_money', '00000000-0000-4000-8000-0000000000d1')).id" > $T/$i.out & done; wait
distinct=$(cat $T/*.out | sort -u | wc -l); rm -f $T/*.out
[ "$distinct" = "1" ] && ok "Concurrence : 10 clics simultanés sur « Payer » -> une seule tentative" || ko "Concurrence : $distinct tentatives distinctes"
[ "$(Q "select count(*) from public.subscription_payment_attempts where shop_id = '$shop' and status in ('initiated','pending')")" = "1" ] && ok "Concurrence : une seule tentative ouverte en base" || ko "Concurrence : plusieurs tentatives ouvertes"
rmdir $T 2>/dev/null
exit $fail
