-- COMMANDE ORANGE MONEY (interrupteur allumé) : rien avant paiement.
select tests.reset();
update public.payment_settings set orange_money_enabled = true;
select tests.put('om', to_jsonb(tests.place('orange_money', true)));
select tests.put('wave_b', to_jsonb(tests.place('wave', false)));
do $$
declare s jsonb := tests.summary(tests.getid('om')); o public.orders; n integer; v jsonb;
begin
  select * into o from public.orders where id = tests.getid('om');
  perform tests.check(o.payment_required and o.payment_status = 'pending' and o.status = 'confirmed', 'Orange : commande créée « paiement obligatoire », en attente');
  perform tests.check(o.payment_deadline = o.created_at + interval '30 minutes', 'Orange : fenêtre de paiement de 30 minutes');
  perform tests.check(o.payment_grace_until = o.created_at + interval '45 minutes', 'Orange : délai de grâce de 15 minutes après la fenêtre');
  perform tests.check((s->>'seller_notifs')::int = 0, 'Orange : AUCUNE notification vendeur avant paiement');
  perform tests.check((s->>'customer_confirmed')::int = 0 and (s->>'admin_notifs')::int = 0, 'Orange : ni « Commande confirmée » client ni notification admin avant paiement');
  perform tests.check((s->>'events_order_confirmed')::int = 0 and (s->>'events_seller_created')::int = 0, 'Orange : aucun événement « confirmée » avant paiement');
  perform tests.check((s->>'whatsapp')::int = 0, 'Orange : AUCUN WhatsApp avant paiement');
  perform tests.check((s->>'sales')::int = 0, 'Orange : aucune part vendeur avant paiement (soldes vendeurs intacts)');
  perform tests.check(tests.stock() = 20 - 2 - 1, 'Orange : stock réservé à la commande (atomique, create_order inchangé)');

  perform tests.as_user('00000000-0000-4000-8000-0000000000d1');
  select count(*) into n from public.orders where id = tests.getid('om'); perform tests.check(n = 0, 'Orange : le vendeur ne voit pas la commande impayée');
  select count(*) into n from public.order_shops where order_id = tests.getid('om'); perform tests.check(n = 0, 'Orange : le vendeur ne voit pas ses lignes de commande impayée');
  select count(*) into n from public.order_items where order_id = tests.getid('om'); perform tests.check(n = 0, 'Orange : le vendeur ne voit pas les articles impayés');
  update public.order_shops set status = 'ready' where order_id = tests.getid('om');
  get diagnostics n = row_count; perform tests.check(n = 0, 'Orange : le vendeur ne peut pas modifier une commande impayée');
  v := public.seller_finance_summary(); perform tests.check((v->>'grossSales')::int = 10000 and (v->>'pending')::int = 9000, 'Orange : ventes et solde en attente du vendeur = uniquement la commande Wave (10 000 / 9 000) : la commande impayée n''ajoute rien');
  perform tests.as_user('00000000-0000-4000-8000-0000000000c1');
  select count(*) into n from public.orders where id = tests.getid('om'); perform tests.check(n = 1, 'Orange : le client voit sa commande impayée (pour reprendre le paiement)');
  perform tests.as_user('00000000-0000-4000-8000-0000000000a1');
  select count(*) into n from public.orders where id = tests.getid('om'); perform tests.check(n = 1, 'Orange : l''administrateur voit la commande');
  perform tests.as_system();
end $$;
do $$
declare ok boolean;
begin
  ok := false; begin update public.order_shops set status = 'ready' where order_id = tests.getid('om'); exception when others then ok := true; end;
  perform tests.check(ok, 'Orange : préparation impossible, même en accès direct (administrateur / serveur)');
  ok := false; begin update public.orders set status = 'preparing' where id = tests.getid('om'); exception when others then ok := true; end;
  perform tests.check(ok, 'Orange : la commande ne peut pas changer de statut tant qu''elle est impayée');
  ok := false; begin insert into public.delivery_missions (order_id, status) values (tests.getid('om'), 'available'); exception when others then ok := true; end;
  perform tests.check(ok, 'Orange : aucune mission de livraison pour une commande impayée');
  perform tests.check((select status from public.order_shops where order_id = tests.getid('om') limit 1) = 'preparing', 'Orange : statut de ligne inchangé après les tentatives');
end $$;
do $$
declare s jsonb := tests.summary(tests.getid('wave_b'));
begin
  perform tests.check(not (select payment_required from public.orders where id = tests.getid('wave_b')) and (s->>'seller_notifs')::int = 1 and (s->>'sales')::int = 1,
    'Wave (interrupteur Orange allumé) : comportement inchangé');
end $$;
-- Interrupteur éteint : une commande Orange Money redevient une commande ordinaire
select tests.reset();
select tests.put('om_off', to_jsonb(tests.place('orange_money', false)));
do $$
begin
  perform tests.check(not (select payment_required from public.orders where id = tests.getid('om_off')), 'Interrupteur éteint : commande Orange Money = commande ordinaire (comme avant)');
end $$;
