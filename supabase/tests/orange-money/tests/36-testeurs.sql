-- TEST RÉSERVÉ (migration 5) : interrupteur général éteint, seul un compte testeur paie avec Orange Money.
select tests.reset();
insert into public.payment_testers (user_id, note) values ('00000000-0000-4000-8000-0000000000c2', 'test');
-- Commande Orange Money d'un client ordinaire (C1) et du testeur (C2)
select tests.put('om_client', to_jsonb(tests.place('orange_money')));
do $$
declare v_id uuid;
begin
  perform tests.as_user('00000000-0000-4000-8000-0000000000c2');
  select (public.create_order(tests.cart(false, 1) || jsonb_build_object('paymentMethod', 'orange_money'))->'order'->>'id')::uuid into v_id;
  perform tests.as_system();
  perform tests.put('om_testeur', to_jsonb(v_id));
end $$;
do $$
declare c public.orders; t public.orders; s jsonb; ok boolean; tx public.payment_transactions; n integer;
begin
  select * into c from public.orders where id = tests.getid('om_client');
  select * into t from public.orders where id = tests.getid('om_testeur');
  perform tests.check((select not orange_money_enabled from public.payment_settings), 'Testeurs : l''interrupteur général reste éteint');
  perform tests.check(not c.payment_required and c.payment_deadline is null, 'Testeurs : commande Orange d''un client ordinaire inchangée (pas « à payer »)');
  s := tests.summary(c.id);
  perform tests.check((s->>'seller_notifs')::int = 1, 'Testeurs : client ordinaire, vendeur notifié comme avant');
  perform tests.check(t.payment_required and t.payment_deadline = t.created_at + interval '30 minutes', 'Testeurs : commande Orange du testeur « à payer », 30 minutes');
  s := tests.summary(t.id);
  perform tests.check((s->>'seller_notifs')::int = 0 and (s->>'whatsapp')::int = 0, 'Testeurs : testeur, aucune notification vendeur ni WhatsApp avant paiement');

  ok := false; begin perform public.payments_create_transaction(c.id, 'orange_money', '00000000-0000-4000-8000-0000000000c1'); exception when others then ok := sqlerrm like '%en cours d''activation%'; end;
  perform tests.check(ok, 'Testeurs : un client ordinaire ne peut pas lancer un paiement Orange (« en cours d''activation »)');
  tx := public.payments_create_transaction(t.id, 'orange_money', '00000000-0000-4000-8000-0000000000c2');
  perform tests.check(tx.id is not null and tx.amount = t.total_amount and tx.status = 'initiated', 'Testeurs : le testeur peut lancer un paiement Orange, montant lu dans la commande');
  ok := false; begin perform public.payments_create_transaction(t.id, 'orange_money', '00000000-0000-4000-8000-0000000000c1'); exception when others then ok := sqlerrm like '%en cours d''activation%' ; end;
  perform tests.check(ok, 'Testeurs : un autre client ne peut pas payer la commande du testeur');
  ok := false; begin perform public.payments_create_transaction(c.id, 'wave', '00000000-0000-4000-8000-0000000000c1'); exception when others then ok := sqlerrm like '%en cours d''activation%'; end;
  perform tests.check(ok, 'Testeurs : Wave inchangé (toujours piloté par collections_enabled)');

  perform tests.as_user('00000000-0000-4000-8000-0000000000c2');
  ok := false; begin select count(*) into n from public.payment_testers; exception when insufficient_privilege then ok := true; end;
  perform tests.check(ok, 'Testeurs : la liste est illisible pour un client, même testeur');
  ok := false; begin insert into public.payment_testers (user_id) values ('00000000-0000-4000-8000-0000000000c1'); exception when insufficient_privilege then ok := true; end;
  perform tests.check(ok, 'Testeurs : un client ne peut pas s''inscrire comme testeur');
  ok := false; begin perform ezial_private.is_payment_tester('00000000-0000-4000-8000-0000000000c2'); exception when insufficient_privilege then ok := true; end;
  perform tests.check(ok, 'Testeurs : la fonction de contrôle n''est pas appelable par un client');
  perform tests.as_user(null, 'anon');
  ok := false; begin select count(*) into n from public.payment_testers; exception when insufficient_privilege then ok := true; end;
  perform tests.check(ok, 'Testeurs : la liste est illisible sans connexion');
  perform tests.as_system();
end $$;
-- Après retrait du testeur : retour au comportement général (éteint)
delete from public.payment_testers;
do $$
declare v_id uuid; o public.orders;
begin
  perform tests.as_user('00000000-0000-4000-8000-0000000000c2');
  select (public.create_order(tests.cart(false, 1) || jsonb_build_object('paymentMethod', 'orange_money'))->'order'->>'id')::uuid into v_id;
  perform tests.as_system();
  select * into o from public.orders where id = v_id;
  perform tests.check(not o.payment_required, 'Testeurs : retiré de la liste, le compte redevient un client ordinaire');
end $$;
