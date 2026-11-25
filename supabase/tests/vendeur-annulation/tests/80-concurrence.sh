#!/usr/bin/env bash
# Accès simultanés : deux sessions réelles, verrous de lignes. Chaque scénario vérifie des invariants quel que soit l'ordre d'arrivée.
set -uo pipefail
export PGHOST="${PGHOST:-/tmp}" PGPORT="${PGPORT:-54555}" PGUSER="${PGUSER:-postgres}"
DB=${DB:-ezial_annulation_test}
Q() { psql -qXtA -d $DB "$@" 2>&1; }
ok() { echo "OK    : $1"; }
ko() { echo "ÉCHEC : $1"; }
chk() { if [ "$2" = "t" ]; then ok "$1"; else ko "$1 (obtenu : $2)"; fi; }
AS() { echo "set local role authenticated; select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000$1', true);"; }
CANCEL() { echo "select 'R=' || coalesce((select 'ok' from (select public.seller_cancel_order_shop('$1', 'out_of_stock', null)) x), '');"; }

# 1. Double clic simultané (deux sessions) : un seul effet
Q -c "select tests.reset_a(); select tests.put('o', to_jsonb(tests.mk_paid('1')))" >/dev/null
O=$(Q -c "select tests.getid('o')"); OS=$(Q -c "select tests.os('$O', '1')")
for i in 1 2 3 4; do
  ( Q -c "begin; $(AS d1) select (public.seller_cancel_order_shop('$OS', 'other', null))->>'already'; commit;" > /tmp/cc_$i.out ) &
done
wait
chk "double clic simultané (4 sessions) : une annulation, une alerte, une notification, stock rendu une fois" \
  "$(Q -c "select (select count(*) from public.order_shop_cancellations where order_id = '$O') = 1 and tests.alerts('$O') = 1 and tests.notifs('$O', 'order_cancelled') = 1 and tests.stock_of('f1') = 10 and (select count(*) from public.finance_audit_log where action = 'order_shop_cancelled_by_seller') = 1")"
chk "double clic simultané : exactement une session « false » (première) et trois « true » (déjà annulée)" \
  "$(Q -c "select $(cat /tmp/cc_*.out | grep -c '^false$') = 1 and $(cat /tmp/cc_*.out | grep -c '^true$') = 3")"

# 2. Le livreur récupère le colis en même temps : soit refus, soit annulation et arrêt retiré — jamais les deux
for variante in livreur_d_abord vendeur_d_abord; do
  Q -c "select tests.reset_a(); select tests.put('o', to_jsonb(tests.mk_paid('12'))); select tests.ready('1', tests.getid('o')); select tests.ready('2', tests.getid('o')); select tests.accept(tests.getid('o'))" >/dev/null
  O=$(Q -c "select tests.getid('o')"); OS=$(Q -c "select tests.os('$O', '2')"); M=$(Q -c "select id from public.delivery_missions where order_id = '$O'")
  if [ $variante = livreur_d_abord ]; then
    ( Q -c "begin; $(AS e9) update public.delivery_stops set status = 'picked_up', picked_up_at = now() where mission_id = '$M' and shop_id = '00000000-0000-4000-8000-0000000000b2'; select pg_sleep(1.5); commit;" >/dev/null ) &
    sleep 0.5
    R=$(Q -c "begin; $(AS d2) select tests.err('select public.seller_cancel_order_shop(''$OS'', ''other'', null)'); commit;" | tail -1)
  else
    ( Q -c "begin; $(AS d2) select public.seller_cancel_order_shop('$OS', 'other', null); select pg_sleep(1.5); commit;" >/dev/null ) &
    sleep 0.5
    Q -c "begin; $(AS e9) update public.delivery_stops set status = 'picked_up', picked_up_at = now() where mission_id = '$M' and shop_id = '00000000-0000-4000-8000-0000000000b2'; commit;" >/dev/null
    R="ok"
  fi
  wait
  if [ $variante = livreur_d_abord ]; then
    chk "livreur récupère d'abord : annulation refusée, arrêt récupéré, part intacte" \
      "$(Q -c "select '$R' like 'Le livreur a déjà récupéré ce colis%' and (select status from public.delivery_stops where mission_id = '$M' and shop_id = tests.uid('b2')) = 'picked_up' and not exists (select 1 from public.order_shop_cancellations where order_id = '$O') and tests.stock_of('f2') = 9")"
  else
    chk "vendeur annule d'abord : arrêt retiré, la mise à jour du livreur n'a plus d'arrêt à modifier, jamais « récupéré » ET « annulé »" \
      "$(Q -c "select not exists (select 1 from public.delivery_stops where mission_id = '$M' and shop_id = tests.uid('b2')) and exists (select 1 from public.order_shop_cancellations where order_id = '$O') and tests.stock_of('f2') = 10")"
  fi
done

# 3. Le client paie en même temps (Wave, tentative ouverte) : jamais d'encaissement pour une part annulée sans remboursement prévu
for variante in paiement_d_abord annulation_d_abord; do
  Q -c "select tests.reset_a(); update public.payment_settings set collections_enabled = true; select tests.put('o', to_jsonb(tests.mk_unpaid('12')))" >/dev/null
  O=$(Q -c "select tests.getid('o')"); OS=$(Q -c "select tests.os('$O', '2')")
  T=$(Q -c "insert into public.payment_transactions (order_id, provider, status, amount, idempotency_key) values ('$O', 'wave', 'pending', tests.total('$O'), 'k-$O') returning id")
  if [ $variante = paiement_d_abord ]; then
    ( Q -c "begin; select public.payments_record_verification('$T', 'confirmed', tests.total('$O'), 'W-REF'); select pg_sleep(1.5); commit;" >/dev/null ) &
    sleep 0.5
    Q -c "begin; $(AS d2) select tests.err('select public.seller_cancel_order_shop(''$OS'', ''other'', null)'); commit;" >/dev/null
  else
    ( Q -c "begin; $(AS d2) select tests.err('select public.seller_cancel_order_shop(''$OS'', ''other'', null)'); select pg_sleep(1.5); commit;" >/dev/null ) &
    sleep 0.5
    Q -c "begin; select public.payments_record_verification('$T', 'confirmed', tests.total('$O'), 'W-REF'); commit;" >/dev/null
  fi
  wait
  # Invariant : (commande payée ET part annulée) => remboursement « à effectuer » du montant de la part ; sinon part non annulée
  chk "paiement simultané ($variante) : cohérent (payée+annulée => remboursement prévu ; sinon la part est intacte et le paiement complet)" \
    "$(Q -c "select case when exists (select 1 from public.order_shop_cancellations where order_id = '$O') then (select o.payment_status = 'paid' or o.total_amount < 31500 from public.orders o where o.id = '$O') and ((select order_was_paid from public.order_shop_cancellations where order_id = '$O') = (select payment_status = 'paid' from public.orders where id = '$O')) and ((select refund_status = 'to_refund' from public.order_shop_cancellations where order_id = '$O') = (select order_was_paid and part_amount > 0 from public.order_shop_cancellations where order_id = '$O')) else (select payment_status = 'paid' from public.orders where id = '$O') end")"
done

# 4. Une autre boutique passe « prête » pendant l'annulation : la mission ne contient jamais l'arrêt d'une boutique annulée
for variante in prete_d_abord annulation_d_abord; do
  Q -c "select tests.reset_a(); select tests.put('o', to_jsonb(tests.mk_paid('12'))); select tests.ready('1', tests.getid('o')); select tests.seller_move('2', tests.getid('o'), 'preparing')" >/dev/null
  O=$(Q -c "select tests.getid('o')"); OS1=$(Q -c "select tests.os('$O', '1')")
  if [ $variante = prete_d_abord ]; then
    ( Q -c "begin; $(AS d2) update public.order_shops set status = 'ready' where id = tests.os('$O', '2'); select pg_sleep(1.5); commit;" >/dev/null ) &
    sleep 0.5
    Q -c "begin; $(AS d1) select public.seller_cancel_order_shop('$OS1', 'other', null); commit;" >/dev/null
  else
    ( Q -c "begin; $(AS d1) select public.seller_cancel_order_shop('$OS1', 'other', null); select pg_sleep(1.5); commit;" >/dev/null ) &
    sleep 0.5
    Q -c "begin; $(AS d2) update public.order_shops set status = 'ready' where id = tests.os('$O', '2'); commit;" >/dev/null
  fi
  wait
  chk "boutique prête pendant l'annulation ($variante) : mission unique, un seul arrêt (b2), jamais l'arrêt de la boutique annulée" \
    "$(Q -c "select (select count(*) from public.delivery_missions where order_id = '$O') = 1 and tests.stops('$O') = 1 and not exists (select 1 from public.delivery_stops where shop_id = tests.uid('b1')) and (select status from public.delivery_missions where order_id = '$O') = 'available'")"
done
