-- Refus : colis récupéré, vente déjà versée, autre vendeur, droits, états. Rien ne change quand c'est refusé.
select tests.reset_a();
do $$
declare o uuid; m public.delivery_missions; before jsonb; v_msg text;
begin
  o := tests.mk_paid('12');
  perform tests.ready('1', o); perform tests.ready('2', o); perform tests.accept(o);
  m := tests.mission(o);
  before := tests.snap_all(o);
  -- autre vendeur / client / admin / anonyme
  perform tests.check(tests.cancel_msg(tests.uid('d2'), tests.os(o, '1')) = 'Commande introuvable.', 'autre vendeur : refusé (même message qu''une commande inconnue)');
  perform tests.check(tests.cancel_msg(tests.uid('c1'), tests.os(o, '1')) = 'Commande introuvable.', 'client : refusé');
  perform tests.check(tests.cancel_msg(tests.uid('a1'), tests.os(o, '1')) = 'Commande introuvable.', 'administratrice (non propriétaire) : refusée');
  perform tests.check(tests.try_cancel(tests.uid('d1'), tests.os(o, '1'), 'out_of_stock', null, 'anon') like '%permission denied%', 'anon : appel refusé par les droits (permission denied)');
  perform tests.check(tests.cancel_msg(null, tests.os(o, '1')) = 'Connectez-vous pour annuler une commande.', 'connecté sans identité : refusé');
  perform tests.check(tests.cancel_msg(tests.uid('d1'), gen_random_uuid()) = 'Commande introuvable.', 'part inconnue : refusée');
  perform tests.check(tests.cancel_msg(tests.uid('d1'), tests.os(o, '1'), 'nimportequoi') = 'Choisissez un motif d''annulation.' and tests.cancel_msg(tests.uid('d1'), tests.os(o, '1'), null) = 'Choisissez un motif d''annulation.', 'motif invalide : refusé');
  perform tests.check(tests.snap_all(o) = before, 'refus (droits, motif) : aucune donnée modifiée');
  -- colis récupéré chez b1 (arrêt « picked_up »)
  perform tests.as_user(tests.uid('e9'));
  update public.delivery_stops set status = 'picked_up', picked_up_at = now() where mission_id = m.id and shop_id = tests.uid('b1');
  perform tests.as_system();
  before := tests.snap_all(o);
  perform tests.check(tests.cancel_msg(tests.uid('d1'), tests.os(o, '1')) = 'Le livreur a déjà récupéré ce colis : la commande ne peut plus être annulée.', 'colis récupéré : annulation refusée avec un message clair');
  perform tests.check(tests.snap_all(o) = before, 'colis récupéré : rien n''a changé (stock, vente, mission, arrêts, notifications)');
  -- livraison en cours / livrée
  update public.delivery_missions set status = 'out_for_delivery' where id = m.id;
  perform tests.check(tests.cancel_msg(tests.uid('d2'), tests.os(o, '2')) = 'Le livreur a déjà récupéré ce colis : la commande ne peut plus être annulée.', 'livraison en cours : refusée même pour la boutique dont l''arrêt est « pending »');
  update public.delivery_missions set status = 'delivered' where id = m.id;
  perform tests.check(tests.cancel_msg(tests.uid('d2'), tests.os(o, '2')) = 'Le livreur a déjà récupéré ce colis : la commande ne peut plus être annulée.', 'livrée : refusée');
end $$;

select tests.reset_a();
do $$
declare o uuid; before jsonb;
begin
  -- Vente déjà versée : refus, aucune modification
  o := tests.mk_paid('1');
  update public.seller_transactions set status = 'paid' where order_id = o and type = 'sale';
  before := tests.snap_all(o);
  perform tests.check(tests.cancel_msg(tests.uid('d1'), tests.os(o, '1')) like 'Cette vente a déjà été versée%', 'vente versée (statut « paid ») : annulation refusée');
  perform tests.check(tests.snap_all(o) = before and tests.alerts(o) = 0, 'vente versée : rien n''a changé, aucune alerte');
  update public.seller_transactions set status = 'available', payout_id = gen_random_uuid() where order_id = o and type = 'sale';
  before := tests.snap_all(o);
  perform tests.check(tests.cancel_msg(tests.uid('d1'), tests.os(o, '1')) like 'Cette vente a déjà été versée%', 'vente en cours de versement (payout_id) : annulation refusée');
  perform tests.check(tests.snap_all(o) = before, 'vente en cours de versement : rien n''a changé');
  -- vente disponible mais pas versée : annulation possible
  update public.seller_transactions set payout_id = null where order_id = o and type = 'sale';
  perform tests.check(tests.cancel_msg(tests.uid('d1'), tests.os(o, '1')) = 'ok' and tests.sale_status(o, '1') = 'cancelled', 'vente disponible non versée : annulation acceptée, vente annulée');
end $$;

select tests.reset_a();
do $$
declare o uuid; o2 uuid;
begin
  -- Commande à payer (Orange Money non payée) : invisible au vendeur, refusée
  update public.payment_settings set orange_money_enabled = true;
  o := (tests.buy(tests.uid('c1'), jsonb_build_array(tests.it('1')), '{}', 'orange_money')->>'id')::uuid;
  perform tests.check(tests.cancel_msg(tests.uid('d1'), tests.os(o, '1')) like 'Cette commande attend encore le paiement du client%', 'Orange Money non payée : refusée (le vendeur ne la voit pas encore)');
  perform tests.check(tests.stock_of('f1') = 9, 'Orange Money non payée : stock inchangé (rendu par l''expiration existante, pas par le vendeur)');
  -- Boutique supprimée : propriétaire refusé
  o2 := tests.mk_unpaid('1');
  update public.shops set status = 'deleted' where id = tests.uid('b1');
  perform tests.check(tests.cancel_msg(tests.uid('d1'), tests.os(o2, '1')) = 'Commande introuvable.', 'boutique supprimée : refusé');
  update public.shops set status = 'active' where id = tests.uid('b1');
  -- Paiement en cours (tentative ouverte) sur une commande non payée : refusé, rien ne change
  update public.payment_settings set collections_enabled = true;
  insert into public.payment_transactions (order_id, provider, status, amount, idempotency_key) values (o2, 'wave', 'pending', tests.total(o2), 'k-' || o2);
  perform tests.check(tests.cancel_msg(tests.uid('d1'), tests.os(o2, '1')) = 'Un paiement est en cours pour cette commande. Réessayez dans quelques minutes.', 'paiement en cours : annulation refusée');
  perform tests.check((select status from public.order_shops where id = tests.os(o2, '1')) <> 'cancelled' and tests.stock_of('f1') = 8, 'paiement en cours : part intacte, stock inchangé');
  update public.payment_transactions set status = 'failed' where order_id = o2;
  perform tests.check(tests.cancel_msg(tests.uid('d1'), tests.os(o2, '1')) = 'ok', 'tentative échouée : annulation acceptée');
  -- Déjà annulée par un autre chemin (admin) : message clair, pas d'effet
  o2 := tests.mk_unpaid('1');
  update public.order_shops set status = 'cancelled' where id = tests.os(o2, '1');
  perform tests.check(tests.cancel_msg(tests.uid('d1'), tests.os(o2, '1')) = 'Cette commande est déjà annulée.' and not exists (select 1 from public.order_shop_cancellations where order_id = o2),
    'déjà annulée autrement : refus clair, aucune ligne d''annulation vendeur');
  -- Commande déjà échouée / remboursée
  o2 := tests.mk_unpaid('1');
  update public.orders set payment_status = 'refunded' where id = o2;
  perform tests.check(tests.cancel_msg(tests.uid('d1'), tests.os(o2, '1')) = 'Cette commande n''est plus active.', 'commande remboursée : refusée');
end $$;

-- Le vendeur ne peut toujours pas annuler « à la main » : garde de production inchangée
select tests.reset_a();
do $$
declare o uuid;
begin
  o := tests.mk_unpaid('12');
  perform tests.check((select status from public.order_shops where id = tests.os(o, '1')) = 'preparing', 'départ : une commande neuve est « preparing »');
  perform tests.seller_move('1', o, 'cancelled');
  perform tests.check((select status from public.order_shops where id = tests.os(o, '1')) = 'preparing', 'mise à jour directe vers « cancelled » : toujours bloquée par la garde de production');
  update public.order_shops set status = 'confirmed' where id = tests.os(o, '1');
  perform tests.seller_move('1', o, 'ready');
  perform tests.check((select status from public.order_shops where id = tests.os(o, '1')) = 'confirmed', 'saut d''étape (confirmed -> ready) : toujours bloqué');
  perform tests.ready('1', o);
  perform tests.check((select status from public.order_shops where id = tests.os(o, '1')) = 'ready', 'avancement normal : inchangé');
  perform tests.ready('1', o); perform tests.ready('2', o);
  perform tests.as_user(tests.uid('d1'));
  update public.delivery_missions set status = 'cancelled' where order_id = o;
  perform tests.as_system();
  perform tests.check((select status from public.delivery_missions where order_id = o) = 'available', 'mission : un vendeur ne peut pas l''annuler à la main (verrou de production)');
end $$;
