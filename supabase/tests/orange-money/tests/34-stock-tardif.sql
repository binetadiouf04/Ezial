-- RESTITUTION DU STOCK (une seule fois, périmètre) ET PAIEMENT TARDIF.
select tests.reset();
update public.payment_settings set orange_money_enabled = true;
select tests.put('w', to_jsonb(tests.place('wave', false)));
select tests.put('p', to_jsonb(tests.place('orange_money', false)));
select tests.put('x', to_jsonb(tests.place('orange_money', false, 3)));
do $$
declare r text; t public.payment_transactions;
begin
  perform tests.check(tests.stock() = 20 - 1 - 1 - 3, 'Départ : 5 unités réservées');
  update public.orders set status = 'cancelled' where id = tests.getid('w');
  perform tests.check(ezial_private.restock_order(tests.getid('w')) = 'not_applicable' and tests.stock() = 15, 'Restitution : jamais pour une commande Wave ou existante');
  perform tests.check(ezial_private.restock_order(tests.getid('p')) = 'not_cancelled', 'Restitution : refusée tant que la commande n''est pas annulée');
  -- commande payée puis annulée par un humain : pas de restitution automatique
  t := public.payments_create_transaction(tests.getid('p'), 'orange_money', '00000000-0000-4000-8000-0000000000c1');
  perform public.payments_record_verification(t.id, 'confirmed', tests.total(tests.getid('p')));
  update public.orders set status = 'cancelled' where id = tests.getid('p');
  perform tests.check(ezial_private.restock_order(tests.getid('p')) = 'paid_order' and tests.stock() = 15, 'Restitution : jamais pour une commande payée');
  -- commande x : annulée, restituée une seule fois (3 unités)
  update public.orders set status = 'cancelled' where id = tests.getid('x');
  r := ezial_private.restock_order(tests.getid('x'));
  perform tests.check(r = 'released' and tests.stock() = 18, 'Restitution : 3 unités rendues');
  for r in select ezial_private.restock_order(tests.getid('x')) from generate_series(1, 10) loop null; end loop;
  perform tests.check(tests.stock() = 18 and (select stock_released_at from public.orders where id = tests.getid('x')) is not null, 'Restitution : 10 rappels, toujours rendue UNE seule fois');
  perform tests.check(ezial_private.restock_order(tests.getid('x')) = 'already_released', 'Restitution : rappel -> « déjà restituée »');
end $$;
-- Contrainte de sécurité : le stock ne peut jamais être négatif
do $$
declare ok boolean := false;
begin
  begin update public.product_variants set stock = -1 where id = '00000000-0000-4000-8000-0000000000f1'; exception when check_violation then ok := true; end;
  perform tests.check(ok, 'Filet : un stock négatif est refusé par la base');
end $$;
-- PAIEMENT TARDIF sur commande annulée : jamais de réactivation automatique
select tests.reset();
update public.payment_settings set orange_money_enabled = true;
select tests.put('l', to_jsonb(tests.place('orange_money', true)));
do $$
declare l uuid := tests.getid('l'); t public.payment_transactions; n integer;
begin
  t := public.payments_create_transaction(l, 'orange_money', '00000000-0000-4000-8000-0000000000c1');
  perform public.payments_set_pending(t.id, t.id::text, null, now() + interval '20 minutes');
  perform tests.put('tl', to_jsonb(t.id));
  perform public.payments_record_verification(t.id, 'expired');
  update public.orders set payment_grace_until = now() - interval '1 minute';
  n := ezial_private.orders_finalize_unpaid();
  perform tests.check((select status from public.orders where id = l) = 'cancelled' and tests.stock() = 20, 'Tardif : commande annulée et stock restitué (départ)');
end $$;
do $$
declare l uuid := tests.getid('l'); r text; n integer; s jsonb;
begin
  -- Orange annonce finalement un paiement réussi pour cette tentative (statut final tardif)
  update public.payment_transactions set status = 'pending', provider_closed_at = null where id = tests.getid('tl');
  r := public.payments_record_verification(tests.getid('tl'), 'confirmed', tests.total(l), 'MP1');
  perform tests.check(r = 'confirm:confirmed_on_cancelled_order', 'Tardif : le paiement est reconnu mais la commande n''est PAS réactivée');
  perform tests.check((select status from public.orders where id = l) = 'cancelled' and tests.stock() = 20, 'Tardif : commande toujours annulée, stock toujours restitué (jamais re-réservé automatiquement)');
  perform tests.check((select count(*) from public.payment_anomalies where kind = 'late_payment_on_cancelled_order' and status = 'open') = 1, 'Tardif : anomalie ouverte pour l''administrateur (remboursement manuel)');
  s := tests.summary(l);
  perform tests.check((s->>'seller_notifs')::int = 0 and (s->>'sales')::int = 0 and (s->>'customer_confirmed')::int = 0, 'Tardif : aucun vendeur notifié, aucune part vendeur, aucune confirmation client');
  perform tests.check(ezial_private.restock_order(l) = 'already_released', 'Tardif : pas de seconde restitution');
  for n in 1..4 loop r := public.payments_record_verification(tests.getid('tl'), 'confirmed', tests.total(l)); end loop;
  perform tests.check((select count(*) from public.payment_anomalies where kind = 'late_payment_on_cancelled_order') = 1, 'Tardif répété : une seule anomalie');
  perform tests.check((select count(*) from public.ezial_events where event_type = 'finance.anomaly') >= 1, 'Tardif : événement d''alerte émis');
end $$;
