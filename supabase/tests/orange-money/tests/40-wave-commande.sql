-- WAVE (migration wave-1) : CRÉATION DE COMMANDE. Interrupteur éteint = comportement d'avant ; testeurs par moyen de paiement.
select tests.reset_wave();
-- (a) Interrupteur Wave éteint, aucun testeur : une commande Wave est strictement celle d'avant
select tests.put('w_off', to_jsonb(tests.place('wave', true)));
do $$
declare o public.orders; s jsonb; ok boolean;
begin
  select * into o from public.orders where id = tests.getid('w_off');
  s := tests.summary(o.id);
  perform tests.check(not o.payment_required and o.payment_deadline is null and o.payment_grace_until is null, 'Wave éteint : commande NON « à payer » (inchangé)');
  perform tests.check((s->>'seller_notifs')::int = 2 and (s->>'customer_confirmed')::int = 1 and (s->>'admin_notifs')::int = 1 and (s->>'whatsapp')::int = 1,
    'Wave éteint : notifications immédiates comme avant');
  perform tests.check((s->>'sales')::int = 2 and (s->>'sales_gross')::int = 30000 and (s->>'sales_commission')::int = 2600 and (s->>'sales_net')::int = 27400 and tests.stock() = 18,
    'Wave éteint : parts vendeurs, commissions 10 % / 8 % et stock identiques');
  perform tests.check((select not wave_enabled from public.payment_settings), 'Wave éteint : wave_enabled est faux par défaut');
  ok := false; begin perform public.payments_create_transaction(o.id, 'wave', '00000000-0000-4000-8000-0000000000c1'); exception when others then ok := sqlerrm like '%en cours d''activation%'; end;
  perform tests.check(ok, 'Wave éteint : paiement Wave refusé (« en cours d''activation »)');
  -- collections_enabled n'est plus l'interrupteur de ce chemin : l'allumer seul ne suffit pas
  update public.payment_settings set collections_enabled = true;
  ok := false; begin perform public.payments_create_transaction(o.id, 'wave', '00000000-0000-4000-8000-0000000000c1'); exception when others then ok := sqlerrm like '%en cours d''activation%'; end;
  perform tests.check(ok, 'Wave éteint : collections_enabled seul n''active pas les paiements Wave');
  update public.payment_settings set collections_enabled = false;
end $$;

-- (b) Testeurs : un testeur Orange seul n'a rien pour Wave
insert into public.payment_testers (user_id, note) values ('00000000-0000-4000-8000-0000000000c2', 'Orange seul');
select tests.put('w_t_orange', to_jsonb(tests.place_as('00000000-0000-4000-8000-0000000000c2', 'wave')));
select tests.put('o_t_orange', to_jsonb(tests.place_as('00000000-0000-4000-8000-0000000000c2', 'orange_money')));
do $$
declare w public.orders; o public.orders; ok boolean;
begin
  select * into w from public.orders where id = tests.getid('w_t_orange');
  select * into o from public.orders where id = tests.getid('o_t_orange');
  perform tests.check((select providers from public.payment_testers where user_id = '00000000-0000-4000-8000-0000000000c2') = array['orange_money'],
    'Testeurs : un testeur inscrit sans précision reste « Orange Money seulement »');
  perform tests.check(not w.payment_required, 'Testeur Orange seul : sa commande Wave n''est PAS « à payer »');
  perform tests.check(o.payment_required and o.payment_deadline = o.created_at + interval '30 minutes', 'Testeur Orange seul : sa commande Orange Money reste « à payer » (inchangé)');
  ok := false; begin perform public.payments_create_transaction(w.id, 'wave', '00000000-0000-4000-8000-0000000000c2'); exception when others then ok := sqlerrm like '%en cours d''activation%'; end;
  perform tests.check(ok, 'Testeur Orange seul : paiement Wave refusé');
  perform tests.check(ezial_private.is_payment_tester('00000000-0000-4000-8000-0000000000c2') and ezial_private.is_payment_tester('00000000-0000-4000-8000-0000000000c2', 'orange_money')
    and not ezial_private.is_payment_tester('00000000-0000-4000-8000-0000000000c2', 'wave'), 'Testeurs : fonction à un argument = Orange Money ; Wave faux');
end $$;

-- Testeur Wave seul : Wave « à payer », Orange Money non
update public.payment_testers set providers = array['wave'] where user_id = '00000000-0000-4000-8000-0000000000c2';
select tests.put('w_t_wave', to_jsonb(tests.place_as('00000000-0000-4000-8000-0000000000c2', 'wave', true)));
select tests.put('o_t_wave', to_jsonb(tests.place_as('00000000-0000-4000-8000-0000000000c2', 'orange_money')));
select tests.put('p_t_wave', to_jsonb(tests.place_as('00000000-0000-4000-8000-0000000000c2', 'paypal')));
do $$
declare w public.orders; o public.orders; p public.orders; s jsonb; tx public.payment_transactions; ok boolean; n integer;
begin
  select * into w from public.orders where id = tests.getid('w_t_wave');
  select * into o from public.orders where id = tests.getid('o_t_wave');
  select * into p from public.orders where id = tests.getid('p_t_wave');
  perform tests.check(w.payment_required and w.payment_deadline = w.created_at + interval '30 minutes' and w.payment_grace_until = w.created_at + interval '45 minutes',
    'Testeur Wave : commande Wave « à payer », délai 30 min + grâce 15 min (comme Orange Money)');
  s := tests.summary(w.id);
  perform tests.check((s->>'seller_notifs')::int = 0 and (s->>'customer_confirmed')::int = 0 and (s->>'admin_notifs')::int = 0 and (s->>'whatsapp')::int = 0
    and (s->>'events_order_confirmed')::int = 0 and (s->>'events_seller_created')::int = 0 and (s->>'sales')::int = 0,
    'Testeur Wave : aucune notification, aucun événement, aucune part vendeur avant paiement');
  perform tests.check(tests.stock() = 20 - 8, 'Testeur Wave : stock réservé pour les 6 commandes déjà passées (8 unités)');
  perform tests.check(not o.payment_required, 'Testeur Wave seul : sa commande Orange Money n''est PAS « à payer »');
  perform tests.check(not p.payment_required, 'Autre moyen (PayPal) : jamais « à payer »');
  tx := public.payments_create_transaction(w.id, 'wave', '00000000-0000-4000-8000-0000000000c2');
  perform tests.check(tx.provider = 'wave' and tx.amount = w.total_amount and tx.status = 'initiated', 'Testeur Wave : paiement Wave lancé, montant lu dans la commande');
  ok := false; begin perform public.payments_create_transaction(o.id, 'orange_money', '00000000-0000-4000-8000-0000000000c2'); exception when others then ok := sqlerrm like '%en cours d''activation%'; end;
  perform tests.check(ok, 'Testeur Wave seul : paiement Orange Money refusé');
  -- Droits : liste et fonctions de contrôle illisibles pour un client
  perform tests.as_user('00000000-0000-4000-8000-0000000000c2');
  ok := false; begin perform ezial_private.is_payment_tester('00000000-0000-4000-8000-0000000000c2', 'wave'); exception when insufficient_privilege then ok := true; end;
  perform tests.check(ok, 'Droits : is_payment_tester(uuid, text) non appelable par un client');
  ok := false; begin perform ezial_private.payment_provider_label('wave'); exception when insufficient_privilege then ok := true; end;
  perform tests.check(ok, 'Droits : fonction de libellé non appelable par un client');
  ok := false; begin select count(*) into n from public.payment_testers; exception when insufficient_privilege then ok := true; end;
  perform tests.check(ok, 'Droits : liste des testeurs toujours illisible');
  perform tests.as_system();
  ok := false; begin insert into public.payment_testers (user_id, providers) values ('00000000-0000-4000-8000-0000000000c1', array['paypal']); exception when check_violation then ok := true; end;
  perform tests.check(ok, 'Testeurs : un moyen inconnu est refusé par la base');
  perform tests.check(not ezial_private.is_payment_tester('00000000-0000-4000-8000-0000000000c2') and ezial_private.is_payment_tester('00000000-0000-4000-8000-0000000000c2', 'wave'),
    'Testeur Wave seul : fonction à un argument (Orange Money) fausse, Wave vraie');
end $$;

-- Testeur des deux moyens
update public.payment_testers set providers = array['orange_money', 'wave'] where user_id = '00000000-0000-4000-8000-0000000000c2';
select tests.put('both_w', to_jsonb(tests.place_as('00000000-0000-4000-8000-0000000000c2', 'wave')));
select tests.put('both_o', to_jsonb(tests.place_as('00000000-0000-4000-8000-0000000000c2', 'orange_money')));
do $$
begin
  perform tests.check((select payment_required from public.orders where id = tests.getid('both_w')) and (select payment_required from public.orders where id = tests.getid('both_o')),
    'Testeur des deux moyens : Wave et Orange Money « à payer »');
end $$;

-- Interrupteur général Wave allumé : tous les clients ; Orange Money reste piloté par son propre interrupteur
delete from public.payment_testers;
update public.payment_settings set wave_enabled = true;
select tests.put('on_w', to_jsonb(tests.place('wave')));
select tests.put('on_o', to_jsonb(tests.place('orange_money')));
do $$
declare w public.orders; ok boolean;
begin
  select * into w from public.orders where id = tests.getid('on_w');
  perform tests.check(w.payment_required and w.payment_deadline is not null, 'Wave allumé : commande Wave « à payer » pour un client ordinaire');
  perform tests.check(not (select payment_required from public.orders where id = tests.getid('on_o')), 'Wave allumé : Orange Money inchangé (son interrupteur est éteint)');
  update public.payment_settings set wave_enabled = false;
  select * into w from public.orders where id = tests.getid('on_w');
  perform tests.check(w.payment_required, 'Wave éteint après coup : la commande déjà créée reste « à payer »');
  ok := false; begin perform public.payments_create_transaction(w.id, 'wave', '00000000-0000-4000-8000-0000000000c1'); exception when others then ok := sqlerrm like '%en cours d''activation%'; end;
  perform tests.check(ok, 'Wave éteint après coup : plus de nouveau paiement tant que l''interrupteur est éteint');
end $$;
