-- DÉLAI, GRÂCE, ANNULATION PRUDENTE ET RESTITUTION DU STOCK.
select tests.reset();
update public.payment_settings set orange_money_enabled = true;
select tests.put('a', to_jsonb(tests.place('orange_money', true)));      -- A : une tentative, statut incertain
select tests.put('b', to_jsonb(tests.place('orange_money', false)));     -- B : jamais de tentative
select tests.put('c', to_jsonb(tests.place('orange_money', false)));     -- C : tentative close chez Orange
do $$
declare a uuid := tests.getid('a'); c uuid := '00000000-0000-4000-8000-0000000000c1'; t public.payment_transactions; n integer;
begin
  t := public.payments_create_transaction(a, 'orange_money', c);
  perform public.payments_set_pending(t.id, t.id::text, null, now() + interval '25 minutes');
  perform tests.put('ta', to_jsonb(t.id));
  t := public.payments_create_transaction(tests.getid('c'), 'orange_money', c);
  perform public.payments_set_pending(t.id, t.id::text, null, now() + interval '25 minutes');
  perform tests.put('tc', to_jsonb(t.id));
  perform tests.check(tests.stock() = 20 - 2 - 1 - 1, 'Départ : stock réservé pour 3 commandes (A: 2 articles, B: 1, C: 1)');
  -- Dans la fenêtre / dans la grâce : rien ne se passe
  update public.orders set payment_deadline = now() - interval '5 minutes', payment_grace_until = now() + interval '10 minutes';
  n := ezial_private.orders_finalize_unpaid();
  perform tests.check(n = 0 and (select count(*) from public.orders where status = 'cancelled') = 0, 'Grâce : aucune annulation pendant le délai de grâce');
end $$;
do $$
declare n integer; r text;
begin
  -- Délai de grâce dépassé
  update public.orders set payment_grace_until = now() - interval '1 minute';
  n := ezial_private.orders_finalize_unpaid();
  perform tests.check((select status from public.orders where id = tests.getid('b')) = 'cancelled', 'B : sans aucune tentative, annulée après la grâce');
  perform tests.check((select status from public.orders where id = tests.getid('a')) <> 'cancelled', 'A : statut Orange NON vérifié -> JAMAIS annulée sur la seule horloge locale');
  perform tests.check((select status from public.orders where id = tests.getid('c')) <> 'cancelled', 'C : tentative non vérifiée chez Orange -> jamais annulée');
  perform tests.check(tests.stock() = 20 - 2 - 1 - 1 + 1, 'B : stock restitué (+1), A et C inchangés');
  -- Orange répond « en attente » : toujours rien
  r := public.payments_record_verification(tests.getid('ta'), 'pending');
  n := ezial_private.orders_finalize_unpaid();
  perform tests.check((select status from public.orders where id = tests.getid('a')) <> 'cancelled', 'A : Orange « en attente » -> pas d''annulation');
  -- « introuvable » trop tôt (le QR est encore valable) : pas de clôture
  r := public.payments_record_verification(tests.getid('ta'), 'not_found');
  perform tests.check(r = 'waiting' and (select provider_closed_at from public.payment_transactions where id = tests.getid('ta')) is null, 'A : « introuvable » avant la fin de validité du QR -> pas de clôture');
  -- C : Orange confirme l'échec / l'expiration
  r := public.payments_record_verification(tests.getid('tc'), 'expired');
  perform tests.check(r = 'fail:expired' and (select provider_closed_at from public.payment_transactions where id = tests.getid('tc')) is not null, 'C : Orange confirme l''expiration -> tentative close');
  n := ezial_private.orders_finalize_unpaid();
  perform tests.check(n = 1 and (select status from public.orders where id = tests.getid('c')) = 'cancelled', 'C : annulée après vérification Orange + grâce dépassée');
  perform tests.check((select payment_status from public.orders where id = tests.getid('c')) = 'failed' and (select payment_cancel_reason from public.orders where id = tests.getid('c')) = 'unpaid_after_grace', 'C : motif d''annulation enregistré');
  perform tests.check(tests.stock() = 20 - 2 - 1 - 1 + 1 + 1, 'C : stock restitué (+1)');
end $$;
do $$
declare r text; n integer; ta uuid := tests.getid('ta');
begin
  -- A : la fin de validité du QR + 5 minutes est passée et Orange ne connaît aucune transaction
  update public.payment_transactions set expires_at = now() - interval '10 minutes' where id = ta;
  r := public.payments_record_verification(ta, 'not_found');
  perform tests.check(r = 'closed:expired', 'A : « introuvable » après la fin de validité + 5 min -> tentative close');
  n := ezial_private.orders_finalize_unpaid();
  perform tests.check((select status from public.orders where id = tests.getid('a')) = 'cancelled', 'A : annulée une fois toutes les tentatives closes chez Orange');
  perform tests.check(tests.stock() = 20, 'Stock : tout est restitué, exactement une fois (20)');
  perform tests.check((select count(*) from public.order_shops where order_id = tests.getid('a') and status = 'cancelled') = 2, 'A : toutes les boutiques de la commande annulées');
  -- Vendeurs : jamais informés d'une commande qu'ils n'ont jamais vue
  perform tests.check((select count(*) from public.notifications where type in ('seller_new_order', 'seller_order_cancelled')) = 0, 'Vendeurs : aucune notification (ni nouvelle commande ni annulation)');
  perform tests.check((select count(*) from public.notifications where type = 'order_cancelled') = 3, 'Client : informé de l''annulation (3 commandes)');
  perform tests.check((select count(*) from public.whatsapp_queue) = 0, 'WhatsApp : rien pour des commandes jamais payées');
  perform tests.check((select count(*) from public.seller_transactions) = 0, 'Soldes vendeurs : aucune ligne créée pour des commandes jamais payées');
  -- Rejeu de l'annulation : rien de plus
  n := ezial_private.orders_finalize_unpaid(); n := ezial_private.orders_finalize_unpaid();
  perform tests.check(tests.stock() = 20 and (select count(*) from public.notifications where type = 'order_cancelled') = 3, 'Rejeu : pas de seconde restitution ni de seconde notification');
end $$;
-- Statut incertain très longtemps : anomalie, jamais d'annulation
select tests.reset();
update public.payment_settings set orange_money_enabled = true;
select tests.put('u', to_jsonb(tests.place('orange_money', false)));
do $$
declare t public.payment_transactions; n integer;
begin
  t := public.payments_create_transaction(tests.getid('u'), 'orange_money', '00000000-0000-4000-8000-0000000000c1');
  perform public.payments_set_pending(t.id, t.id::text, null, now() + interval '20 minutes');
  update public.orders set payment_deadline = now() - interval '2 days', payment_grace_until = now() - interval '25 hours';
  n := ezial_private.orders_finalize_unpaid(); n := ezial_private.orders_finalize_unpaid();
  perform tests.check((select status from public.orders where id = tests.getid('u')) <> 'cancelled', 'Incertain 24 h : la commande n''est JAMAIS annulée automatiquement');
  perform tests.check((select count(*) from public.payment_anomalies where kind = 'payment_uncertain') = 1, 'Incertain 24 h : une seule anomalie pour l''administrateur');
  perform tests.check(tests.stock() = 19, 'Incertain 24 h : stock non restitué');
  perform tests.check((select count(*) from public.payment_transactions where order_id = tests.getid('u') and status = 'confirmed') = 0, 'Incertain 24 h : aucune confirmation inventée');
end $$;
-- Commande payée juste pendant la grâce : acceptée
select tests.reset();
update public.payment_settings set orange_money_enabled = true;
select tests.put('g', to_jsonb(tests.place('orange_money', false)));
do $$
declare t public.payment_transactions; r text;
begin
  t := public.payments_create_transaction(tests.getid('g'), 'orange_money', '00000000-0000-4000-8000-0000000000c1');
  update public.orders set payment_deadline = now() - interval '5 minutes', payment_grace_until = now() + interval '5 minutes';
  r := public.payments_record_verification(t.id, 'confirmed', tests.total(tests.getid('g')));
  perform tests.check(r = 'confirm:confirmed' and (select payment_status from public.orders where id = tests.getid('g')) = 'paid', 'Grâce : un paiement confirmé pendant la grâce est accepté');
  update public.orders set payment_grace_until = now() - interval '1 minute';
  perform tests.check(ezial_private.orders_finalize_unpaid() = 0 and tests.stock() = 19, 'Grâce : une commande payée n''est jamais annulée');
end $$;
