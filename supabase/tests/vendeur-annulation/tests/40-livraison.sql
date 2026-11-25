-- Livraison : arrêt retiré, mission annulée s'il n'en reste aucun, livreur prévenu, jamais de mission bloquée.
select tests.reset_a();
do $$
declare o uuid; r jsonb; m public.delivery_missions;
begin
  -- Mission déjà créée (tout est prêt), pas encore de livreur : b2 annule -> 1 arrêt, mission toujours disponible
  o := tests.mk_paid('12');
  perform tests.ready('1', o); perform tests.ready('2', o);
  perform tests.check(tests.stops(o) = 2, 'départ : mission à 2 arrêts');
  r := tests.cancel('2', o);
  m := tests.mission(o);
  perform tests.check(m.status = 'available' and tests.stops(o) = 1 and not exists (select 1 from public.delivery_stops where shop_id = tests.uid('b2')) and not (r->>'mission_cancelled')::boolean,
    'mission : arrêt de b2 retiré, la mission reste disponible avec b1 seul');
  perform tests.check((select count(*) from public.notifications where mission_id = m.id) = 0, 'mission : personne à prévenir (aucun livreur)');
  r := tests.cancel('1', o);
  perform tests.check((tests.mission(o)).status = 'cancelled' and tests.stops(o) = 0 and (r->>'mission_cancelled')::boolean, 'mission : dernière boutique annulée -> mission annulée, plus aucun arrêt');
  perform tests.as_user(tests.uid('e9'));
  perform tests.check(not exists (select 1 from public.delivery_missions where order_id = o and status = 'available'), 'mission : n''apparaît plus dans les missions disponibles');
  perform tests.as_system();
end $$;

select tests.reset_a();
do $$
declare o uuid; r jsonb; m public.delivery_missions;
begin
  -- Livreur déjà engagé : arrêt retiré -> notification ; dernière boutique -> mission annulée -> notification existante
  o := tests.mk_paid('12');
  perform tests.ready('1', o); perform tests.ready('2', o);
  perform tests.accept(o);
  m := tests.mission(o);
  perform tests.check(m.status = 'accepted' and m.driver_id = tests.uid('e9'), 'départ : mission acceptée par le livreur');
  r := tests.cancel('2', o);
  perform tests.check(tests.stops(o) = 1 and (tests.mission(o)).status = 'accepted' and (select count(*) from public.notifications where user_id = tests.uid('e9') and type = 'driver_mission_updated' and body like '%Boutique Deux%') = 1,
    'livreur : arrêt retiré, mission continue, le livreur est prévenu (notification existante notify_user)');
  r := tests.cancel('1', o);
  perform tests.check((tests.mission(o)).status = 'cancelled' and (select count(*) from public.notifications where user_id = tests.uid('e9') and type = 'driver_mission_cancelled') = 1
    and (select count(*) from public.notifications where user_id = tests.uid('e9') and type = 'driver_mission_updated') = 1, 'livreur : mission annulée -> notification « Mission annulée » du déclencheur existant (une seule)');
  perform tests.check(tests.err(format('select public.accept_delivery_mission(%L)', m.id)) is not null, 'livreur : une mission annulée ne peut plus être acceptée');
end $$;

select tests.reset_a();
do $$
declare o uuid; r jsonb; m public.delivery_missions;
begin
  -- Un arrêt déjà récupéré chez b1 : b2 peut encore annuler ; la mission continue avec l'arrêt récupéré seul
  o := tests.mk_paid('12');
  perform tests.ready('1', o); perform tests.ready('2', o);
  perform tests.accept(o);
  m := tests.mission(o);
  perform tests.as_user(tests.uid('e9'));
  update public.delivery_stops set status = 'picked_up', picked_up_at = now() where mission_id = m.id and shop_id = tests.uid('b1');
  update public.delivery_missions set status = 'picking_up' where id = m.id;
  perform tests.as_system();
  r := tests.cancel('2', o);
  perform tests.check((tests.mission(o)).status = 'picking_up' and tests.stops(o) = 1 and (select status from public.delivery_stops where mission_id = m.id) = 'picked_up',
    'récupération partielle : b2 annule, la mission continue avec le colis déjà récupéré de b1');
  perform tests.check(tests.cancel_msg(tests.uid('d1'), tests.os(o, '1')) = 'Le livreur a déjà récupéré ce colis : la commande ne peut plus être annulée.', 'récupération partielle : b1 (colis récupéré) ne peut plus annuler');
end $$;

-- Retrait en boutique (pickup) : pas de mission ; annulation possible tant que le client n'a pas retiré
select tests.reset_a();
do $$
declare o uuid; r jsonb;
begin
  o := (tests.buy(tests.uid('c2'), jsonb_build_array(tests.it('2')), tests.pickup('2') || '{}', 'wave')->>'id')::uuid;
  perform tests.seller_move('2', o, 'preparing'); perform tests.seller_move('2', o, 'ready_for_pickup');
  perform tests.check((select status from public.order_shops where order_id = o) = 'ready_for_pickup', 'retrait : prête à récupérer');
  r := tests.cancel('2', o, 'item_unavailable');
  perform tests.check((r->>'order_cancelled')::boolean and not exists (select 1 from public.delivery_missions where order_id = o) and tests.stock_of('f2') = 10
    and (r->>'refund_amount')::int = 20000, 'retrait : annulée, pas de mission, stock rendu, part 20 000 (sans livraison)');
  o := (tests.buy(tests.uid('c2'), jsonb_build_array(tests.it('2')), tests.pickup('2') || '{}', 'wave')->>'id')::uuid;
  perform tests.seller_move('2', o, 'preparing'); perform tests.seller_move('2', o, 'ready_for_pickup'); perform tests.seller_move('2', o, 'picked_up');
  perform tests.check(tests.cancel_msg(tests.uid('d2'), tests.os(o, '2')) = 'Cette commande a déjà été récupérée ou remise : elle ne peut plus être annulée.', 'retrait : déjà retirée par le client -> refus');
end $$;
