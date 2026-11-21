-- WAVE : DÉLAI, GRÂCE, ANNULATION PRUDENTE, STOCK RESTITUÉ UNE FOIS, PAIEMENT TARDIF.
select tests.reset_wave();
update public.payment_settings set wave_enabled = true, orange_money_enabled = true;
select tests.put('a', to_jsonb(tests.place('wave', true)));          -- A : session Wave non vérifiée
select tests.put('b', to_jsonb(tests.place('wave', false)));         -- B : jamais de tentative
select tests.put('c', to_jsonb(tests.place('wave', false)));         -- C : session close chez Wave
select tests.put('oo', to_jsonb(tests.place('orange_money', false))); -- commande Orange Money, même délai
do $$
declare c uuid := '00000000-0000-4000-8000-0000000000c1'; t public.payment_transactions; n integer;
begin
  t := public.payments_create_transaction(tests.getid('a'), 'wave', c);
  perform public.payments_set_pending(t.id, 'cos_a', null, now() + interval '25 minutes'); perform tests.put('ta', to_jsonb(t.id));
  t := public.payments_create_transaction(tests.getid('c'), 'wave', c);
  perform public.payments_set_pending(t.id, 'cos_c', null, now() + interval '25 minutes'); perform tests.put('tc', to_jsonb(t.id));
  t := public.payments_create_transaction(tests.getid('oo'), 'orange_money', c);
  perform public.payments_set_pending(t.id, t.id::text, null, now() + interval '25 minutes'); perform tests.put('to', to_jsonb(t.id));
  perform tests.check(tests.stock() = 20 - 2 - 1 - 1 - 1, 'Départ : stock réservé pour 4 commandes');
  update public.orders set payment_deadline = now() - interval '5 minutes', payment_grace_until = now() + interval '10 minutes';
  n := ezial_private.orders_finalize_unpaid();
  perform tests.check(n = 0 and (select count(*) from public.orders where status = 'cancelled') = 0, 'Grâce : aucune annulation pendant le délai de grâce');
end $$;
do $$
declare n integer; r text;
begin
  update public.orders set payment_grace_until = now() - interval '1 minute';
  n := ezial_private.orders_finalize_unpaid();
  perform tests.check((select status from public.orders where id = tests.getid('b')) = 'cancelled', 'B (Wave) : sans tentative, annulée après la grâce');
  perform tests.check((select status from public.orders where id = tests.getid('a')) <> 'cancelled', 'A (Wave) : session NON vérifiée -> jamais annulée sur la seule horloge locale');
  perform tests.check((select status from public.orders where id = tests.getid('c')) <> 'cancelled', 'C (Wave) : session non vérifiée chez Wave -> jamais annulée');
  perform tests.check(tests.stock() = 20 - 2 - 1 - 1 - 1 + 1, 'B : stock restitué (+1), les autres inchangés');
  r := public.payments_record_verification(tests.getid('ta'), 'pending');
  n := ezial_private.orders_finalize_unpaid();
  perform tests.check((select status from public.orders where id = tests.getid('a')) <> 'cancelled', 'A : Wave « en attente » -> pas d''annulation');
  r := public.payments_record_verification(tests.getid('tc'), 'expired');
  perform tests.check(r = 'fail:expired' and (select provider_closed_at from public.payment_transactions where id = tests.getid('tc')) is not null, 'C : Wave confirme l''expiration -> session close');
  n := ezial_private.orders_finalize_unpaid();
  perform tests.check(n = 1 and (select status from public.orders where id = tests.getid('c')) = 'cancelled', 'C : annulée après vérification Wave + grâce dépassée');
  perform tests.check((select payment_status from public.orders where id = tests.getid('c')) = 'failed' and (select payment_cancel_reason from public.orders where id = tests.getid('c')) = 'unpaid_after_grace', 'C : motif d''annulation enregistré');
  perform tests.check(tests.stock() = 20 - 2 - 1 - 1 - 1 + 1 + 1, 'C : stock restitué (+1)');
end $$;
do $$
declare r text; n integer; ta uuid := tests.getid('ta');
begin
  update public.payment_transactions set expires_at = now() - interval '10 minutes' where id = ta;
  r := public.payments_record_verification(ta, 'not_found');
  perform tests.check(r = 'closed:expired', 'A : « introuvable » après la fin de validité + 5 min -> session close');
  n := ezial_private.orders_finalize_unpaid();
  perform tests.check((select status from public.orders where id = tests.getid('a')) = 'cancelled' and (select count(*) from public.order_shops where order_id = tests.getid('a') and status = 'cancelled') = 2,
    'A : annulée une fois toutes les sessions closes chez Wave (2 boutiques annulées)');
  perform tests.check(tests.stock() = 19, 'Stock : tout est restitué sauf la commande Orange en attente (19)');
  perform tests.check((select count(*) from public.notifications where type in ('seller_new_order', 'seller_order_cancelled')) = 0, 'Vendeurs : aucune notification (ni nouvelle commande ni annulation)');
  perform tests.check((select count(*) from public.notifications where type = 'order_cancelled') = 3, 'Client : informé de l''annulation (3 commandes Wave)');
  perform tests.check((select count(*) from public.whatsapp_queue) = 0 and (select count(*) from public.seller_transactions) = 0, 'WhatsApp et soldes vendeurs : rien pour des commandes jamais payées');
  n := ezial_private.orders_finalize_unpaid(); n := ezial_private.orders_finalize_unpaid();
  perform tests.check(tests.stock() = 19 and (select count(*) from public.notifications where type = 'order_cancelled') = 3, 'Rejeu : pas de seconde restitution ni de seconde notification');
  perform tests.check((select status from public.orders where id = tests.getid('oo')) <> 'cancelled', 'Orange Money : sa commande, session non vérifiée, n''est pas annulée (inchangé)');
end $$;
-- Statut incertain 24 h : anomalie au libellé du moyen de paiement, jamais d'annulation
select tests.reset_wave();
update public.payment_settings set wave_enabled = true, orange_money_enabled = true;
select tests.put('uw', to_jsonb(tests.place('wave')));
select tests.put('uo', to_jsonb(tests.place('orange_money')));
do $$
declare c uuid := '00000000-0000-4000-8000-0000000000c1'; t public.payment_transactions; n integer;
begin
  t := public.payments_create_transaction(tests.getid('uw'), 'wave', c); perform public.payments_set_pending(t.id, 'cos_u', null, now() + interval '20 minutes');
  t := public.payments_create_transaction(tests.getid('uo'), 'orange_money', c); perform public.payments_set_pending(t.id, t.id::text, null, now() + interval '20 minutes');
  update public.orders set payment_deadline = now() - interval '2 days', payment_grace_until = now() - interval '25 hours';
  n := ezial_private.orders_finalize_unpaid(); n := ezial_private.orders_finalize_unpaid();
  perform tests.check((select count(*) from public.orders where status = 'cancelled') = 0 and tests.stock() = 18, 'Incertain 24 h : aucune commande annulée, stock non restitué');
  perform tests.check((select details->>'reason' from public.payment_anomalies where order_id = tests.getid('uw') and kind = 'payment_uncertain') = 'Statut Wave toujours incertain 24 h après le délai de grâce.', 'Incertain 24 h : anomalie Wave au libellé « Wave »');
  perform tests.check((select details->>'reason' from public.payment_anomalies where order_id = tests.getid('uo') and kind = 'payment_uncertain') = 'Statut Orange Money toujours incertain 24 h après le délai de grâce.', 'Incertain 24 h : anomalie Orange Money IDENTIQUE à avant');
  perform tests.check((select count(*) from public.payment_anomalies where kind = 'payment_uncertain') = 2, 'Incertain 24 h : une seule anomalie par commande');
end $$;
-- Maintenance locale : Wave et Orange Money n'expirent jamais ; une commande Wave d'avant l'activation n'est jamais annulée
select tests.reset_wave();
select tests.put('legacy', to_jsonb(tests.place('wave')));
update public.payment_settings set wave_enabled = true;
select tests.put('wm', to_jsonb(tests.place('wave')));
do $$
declare t public.payment_transactions; n integer;
begin
  t := public.payments_create_transaction(tests.getid('wm'), 'wave', '00000000-0000-4000-8000-0000000000c1');
  update public.payment_transactions set status = 'pending', expires_at = now() - interval '1 hour', created_at = now() - interval '6 hours' where id = t.id;
  perform public.payments_maintenance();
  perform tests.check((select status from public.payment_transactions where id = t.id) = 'pending', 'Maintenance : une tentative Wave en attente n''expire jamais localement');
  update public.orders set payment_deadline = now() - interval '2 days', payment_grace_until = now() - interval '2 days';
  n := ezial_private.orders_finalize_unpaid();
  perform tests.check((select status from public.orders where id = tests.getid('legacy')) <> 'cancelled' and not (select payment_required from public.orders where id = tests.getid('legacy')),
    'Commande Wave d''avant l''activation : jamais annulée automatiquement, jamais « à payer »');
  perform tests.check(ezial_private.restock_order(tests.getid('legacy')) = 'not_applicable', 'Commande Wave d''avant l''activation : jamais de restitution automatique');
end $$;
-- Paiement tardif d'une commande Wave annulée : jamais de réactivation
select tests.reset_wave();
update public.payment_settings set wave_enabled = true;
select tests.put('l', to_jsonb(tests.place('wave', true)));
do $$
declare l uuid := tests.getid('l'); t public.payment_transactions; n integer;
begin
  t := public.payments_create_transaction(l, 'wave', '00000000-0000-4000-8000-0000000000c1');
  perform public.payments_set_pending(t.id, 'cos_l', null, now() + interval '20 minutes'); perform tests.put('tl', to_jsonb(t.id));
  perform public.payments_record_verification(t.id, 'expired');
  update public.orders set payment_grace_until = now() - interval '1 minute';
  n := ezial_private.orders_finalize_unpaid();
  perform tests.check((select status from public.orders where id = l) = 'cancelled' and tests.stock() = 20, 'Tardif : commande Wave annulée et stock restitué (départ)');
end $$;
do $$
declare l uuid := tests.getid('l'); r text; n integer; s jsonb;
begin
  update public.payment_transactions set status = 'pending', provider_closed_at = null where id = tests.getid('tl');
  r := public.payments_record_verification(tests.getid('tl'), 'confirmed', tests.total(l));
  perform tests.check(r = 'confirm:confirmed_on_cancelled_order', 'Tardif : paiement Wave reconnu, commande NON réactivée');
  perform tests.check((select status from public.orders where id = l) = 'cancelled' and tests.stock() = 20, 'Tardif : commande annulée, stock restitué, jamais re-réservé');
  perform tests.check((select count(*) from public.payment_anomalies where kind = 'late_payment_on_cancelled_order' and status = 'open' and details->>'provider' = 'wave') = 1, 'Tardif : anomalie ouverte pour l''administrateur');
  s := tests.summary(l);
  perform tests.check((s->>'seller_notifs')::int = 0 and (s->>'sales')::int = 0 and (s->>'customer_confirmed')::int = 0, 'Tardif : aucun vendeur notifié, aucune part vendeur');
  perform tests.check(ezial_private.restock_order(l) = 'already_released', 'Tardif : pas de seconde restitution');
end $$;
