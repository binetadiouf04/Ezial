-- Annulation AVANT paiement (Wave, paiement non requis comme aujourd'hui en production) : aucune alerte de remboursement.
select tests.reset_a();
do $$
declare o uuid; r jsonb; c public.order_shop_cancellations; n_cust integer;
begin
  o := tests.mk_unpaid('1');
  perform tests.check(tests.stock_of('f1') = 9 and tests.sale_status(o, '1') = 'pending', 'départ : stock 9, vente vendeur en attente');
  r := tests.cancel('1', o, 'out_of_stock', '  plus de taille M ');
  perform tests.check((r->>'success')::boolean and not (r->>'already')::boolean and not (r->>'refund_required')::boolean and (r->>'order_cancelled')::boolean, 'avant paiement : annulation acceptée, aucun remboursement, commande entière annulée (une seule boutique)');
  perform tests.check((select status from public.order_shops where id = tests.os(o, '1')) = 'cancelled'
    and (select status || '/' || payment_status || '/' || payment_cancel_reason from public.orders where id = o) = 'cancelled/failed/seller_cancelled', 'avant paiement : part annulée, commande annulée, paiement « failed » (jamais encaissé)');
  perform tests.check(tests.stock_of('f1') = 10, 'avant paiement : stock rendu (9 -> 10)');
  perform tests.check(tests.sale_status(o, '1') = 'cancelled', 'avant paiement : vente vendeur annulée (aucune commission due)');
  c := tests.cancellation(o, '1');
  perform tests.check(c.reason = 'out_of_stock' and c.note = 'plus de taille M' and not c.order_was_paid and c.refund_status = 'none' and c.part_amount = 10000 + 1500 and c.stock_released_at is not null,
    'avant paiement : ligne d''annulation (motif, note nettoyée, part 10 000 + livraison 1 500, aucun remboursement)');
  perform tests.check(tests.alerts(o) = 0, 'avant paiement : aucune alerte administratrice de remboursement');
  perform tests.check((select total_amount from public.orders where id = o) = 0, 'avant paiement : montant restant dû = 0 (jamais d''encaissement pour la part annulée)');
  perform tests.check(tests.notifs(o, 'order_cancelled') = 1 and (select body from public.notifications where order_id = o and type = 'order_cancelled') like '%Boutique Un%rupture de stock%rien à payer%',
    'avant paiement : UNE notification client, avec boutique, motif et « rien à payer »');
  perform tests.check(tests.notifs(o, 'seller_order_cancelled') = 0, 'avant paiement : le vendeur n''est pas prévenu de sa propre annulation');
  perform tests.check((select count(*) from public.finance_audit_log where action = 'order_shop_cancelled_by_seller' and entity_id = tests.os(o, '1')) = 1
    and (select actor_id from public.finance_audit_log where action = 'order_shop_cancelled_by_seller') = tests.uid('d1'), 'avant paiement : journal d''audit (acteur = le vendeur)');
  -- Un client qui voudrait payer ensuite : commande annulée, aucune tentative possible
  update public.payment_settings set collections_enabled = true;
  perform tests.check(tests.err(format('select public.payments_create_transaction(%L, ''wave'', %L)', o, tests.uid('c1'))) = 'Cette commande est annulée.',
    'avant paiement : commande annulée -> impossible de la payer ensuite');
end $$;

-- Deux boutiques, non payée : la part de b2 sort du montant dû, la commande continue pour b1 ; la mission part avec b1 seul.
select tests.reset_a();
do $$
declare o uuid; r jsonb; before_total integer; m public.delivery_missions;
begin
  o := tests.mk_unpaid('12');
  before_total := tests.total(o);
  perform tests.check(before_total = 30000 + 1500, 'départ : 31 500 (10 000 + 20 000 + livraison 1 500)');
  perform tests.ready('1', o);
  perform tests.check(not exists (select 1 from public.delivery_missions where order_id = o), 'départ : pas de mission tant que b2 n''est pas prête');
  perform tests.seller_move('2', o, 'preparing');
  r := tests.cancel('2', o, 'item_unavailable');
  perform tests.check(not (r->>'order_cancelled')::boolean and not (r->>'refund_required')::boolean and (r->>'refund_amount')::int = 20000, 'deux boutiques : part de b2 = 20 000, la livraison reste due (b1 est encore livrée)');
  perform tests.check(tests.total(o) = before_total - 20000 and (select status from public.orders where id = o) = 'confirmed', 'deux boutiques : montant dû réduit de 20 000, commande toujours active');
  perform tests.check(tests.stock_of('f2') = 10 and tests.stock_of('f1') = 9, 'deux boutiques : stock rendu pour b2 seulement');
  perform tests.check(tests.sale_status(o, '2') = 'cancelled' and tests.sale_status(o, '1') = 'pending', 'deux boutiques : vente de b2 annulée, celle de b1 intacte');
  m := tests.mission(o);
  perform tests.check(m.id is not null and m.status = 'available' and tests.stops(o) = 1 and exists (select 1 from public.delivery_stops where mission_id = m.id and shop_id = tests.uid('b1')),
    'deux boutiques : b2 était la seule à ne pas être prête -> mission créée pour b1 seule (1 arrêt)');
  perform tests.check(tests.notifs(o, 'order_cancelled') = 1 and (select body from public.notifications where order_id = o and type = 'order_cancelled') like '%Le reste de votre commande continue%', 'deux boutiques : client prévenu, le reste continue');
  perform tests.check(tests.alerts(o) = 0, 'deux boutiques non payée : aucune alerte de remboursement');
end $$;

-- Sans annulation : la mission attend TOUTES les boutiques livrées (comportement de production inchangé)
select tests.reset_a();
do $$
declare o uuid;
begin
  o := tests.mk_unpaid('12');
  perform tests.ready('1', o);
  perform tests.check(not exists (select 1 from public.delivery_missions where order_id = o), 'sans annulation : une boutique prête ne suffit pas');
  perform tests.ready('2', o);
  perform tests.check(tests.stops(o) = 2 and (select status from public.delivery_missions where order_id = o) = 'available', 'sans annulation : mission créée avec 2 arrêts quand tout est prêt');
end $$;
