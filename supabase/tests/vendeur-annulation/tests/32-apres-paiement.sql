-- Annulation APRÈS paiement (Orange Money confirmé) : remboursement à effectuer, créé une seule fois.
select tests.reset_a();
do $$
declare o uuid; r jsonb; r2 jsonb; c public.order_shop_cancellations; tot integer;
begin
  o := tests.mk_paid('1');
  tot := tests.total(o);
  perform tests.check(tot = 11500 and (select payment_status from public.orders where id = o) = 'paid' and tests.sale_status(o, '1') = 'pending', 'départ : commande payée 11 500, vente en attente');
  r := tests.cancel('1', o, 'other', 'Article abîmé');
  perform tests.check((r->>'refund_required')::boolean and (r->>'refund_amount')::int = 11500 and (r->>'order_cancelled')::boolean, 'après paiement : remboursement de 11 500 (produits + livraison, seule boutique)');
  c := tests.cancellation(o, '1');
  perform tests.check(c.order_was_paid and c.refund_status = 'to_refund' and c.part_amount = 11500 and c.refunded_at is null, 'après paiement : ligne « à rembourser »');
  perform tests.check(tests.alerts(o) = 1 and (select message from public.admin_notifications where order_id = o and type = 'refund_to_make') like 'Remboursement à effectuer : 11500 FCFA, commande %Boutique Un%Orange Money%'
    and (select url from public.admin_notifications where order_id = o and type = 'refund_to_make') = '/pro/admin/remboursements', 'après paiement : UNE alerte administratrice (commande, boutique, montant, mode de paiement)');
  perform tests.check((select payment_status from public.orders where id = o) = 'paid' and (select status from public.orders where id = o) = 'cancelled', 'après paiement : paiement conservé « paid » (remboursement à faire), commande annulée');
  perform tests.check(tests.stock_of('f1') = 10 and tests.sale_status(o, '1') = 'cancelled', 'après paiement : stock rendu, vente annulée');
  perform tests.check(tests.notifs(o, 'order_cancelled') = 1 and (select body from public.notifications where order_id = o and type = 'order_cancelled') like '%autre raison%remboursé de 11500 FCFA%', 'après paiement : client prévenu du remboursement');
  -- Double clic / rejeu : aucun effet de plus
  r2 := tests.cancel('1', o, 'other');
  perform tests.check((r2->>'already')::boolean and (r2->>'refund_amount')::int = 11500, 'double clic : réponse « déjà annulée », même montant');
  perform tests.check(tests.alerts(o) = 1 and tests.notifs(o, 'order_cancelled') = 1 and tests.stock_of('f1') = 10
    and (select count(*) from public.order_shop_cancellations where order_id = o) = 1
    and (select count(*) from public.finance_audit_log where action = 'order_shop_cancelled_by_seller') = 1, 'double clic : une seule alerte, une seule notification, stock rendu une seule fois, un seul audit');
  -- Après un double clic, le stock n'est pas rendu une seconde fois même par un autre chemin
  perform tests.check(tests.err(format('select ezial_private.restock_order(%L)', o)) = 'ok' and tests.stock_of('f1') = 10, 'stock : restock_order (impayés) ne rend rien de plus sur une commande payée');
end $$;

-- Deux boutiques payées : la livraison n'est remboursée qu'avec la DERNIÈRE part ; la somme des remboursements = total payé
select tests.reset_a();
do $$
declare o uuid; r1 jsonb; r2 jsonb; tot integer;
begin
  o := tests.mk_paid('12', '{"giftWrap": true}');
  tot := tests.total(o);
  perform tests.check(tot = 10000 + 20000 + 1500 + 2000, 'départ : 33 500 (produits 30 000 + livraison 1 500 + cadeau 2 000)');
  r1 := tests.cancel('2', o);
  perform tests.check((r1->>'refund_amount')::int = 20000 and not (r1->>'order_cancelled')::boolean, 'multi-boutiques payée : b2 = 20 000 (livraison et cadeau conservés, b1 continue)');
  r2 := tests.cancel('1', o);
  perform tests.check((r2->>'refund_amount')::int = 10000 + 1500 + 2000 and (r2->>'order_cancelled')::boolean, 'multi-boutiques payée : dernière part = 10 000 + livraison 1 500 + cadeau 2 000');
  perform tests.check((select sum(part_amount) from public.order_shop_cancellations where order_id = o) = tot, 'multi-boutiques : somme des remboursements = montant payé (jamais plus)');
  perform tests.check(tests.alerts(o) = 2 and tests.notifs(o, 'order_cancelled') = 2, 'multi-boutiques : une alerte et une notification par part');
end $$;

-- Livraison urgente + cadeau : le supplément urgent suit la livraison
select tests.reset_a();
do $$
declare o uuid; r jsonb;
begin
  o := tests.mk_paid('1', tests.urgent() || '{"giftWrap": true}');
  perform tests.check(tests.total(o) = 10000 + 1500 + 500 + 2000, 'départ urgent : 14 000');
  r := tests.cancel('1', o);
  perform tests.check((r->>'refund_amount')::int = 14000, 'urgent + cadeau : tout est remboursé avec la dernière part (14 000)');
end $$;

-- Campagne promotionnelle : seul ce que le client a réellement payé pour la boutique est remboursé
select tests.reset_a();
do $$
declare o uuid; r jsonb; v uuid;
begin
  v := tests.new_promo('MOINS3000', 'fixed', 3000);
  update public.payment_settings set orange_money_enabled = true;
  o := (tests.buy_code(tests.uid('c1'), jsonb_build_array(tests.it('1'), tests.it('2')), 'MOINS3000', '{}', 'orange_money')->>'id')::uuid;
  perform public.payments_record_verification((public.payments_create_transaction(o, 'orange_money', tests.uid('c1'))).id, 'confirmed', tests.total(o), 'MP-PROMO');
  perform tests.check(tests.total(o) = 30000 - 3000 + 1500 and (select sum(promo_allocation) from public.order_shops where order_id = o) = 3000, 'campagne : départ 28 500, 3 000 rattachés aux boutiques (1 000 / 2 000)');
  r := tests.cancel('2', o);
  perform tests.check((r->>'refund_amount')::int = 20000 - 2000, 'campagne : remboursement de b2 = 20 000 − 2 000 de réduction = 18 000');
  perform tests.check((select uses_count from public.promotions where id = v) = 1, 'campagne : annulation d''une seule boutique -> utilisation du code NON rendue');
  r := tests.cancel('1', o);
  perform tests.check((r->>'refund_amount')::int = 10000 - 1000 + 1500 and (select sum(part_amount) from public.order_shop_cancellations where order_id = o) = 28500, 'campagne : dernière part = 9 000 + livraison 1 500 ; total = 28 500 payés');
  perform tests.put('promo_o', to_jsonb(o)); perform tests.put('promo_v', to_jsonb(v));
end $$;
-- Le déclencheur de production qui rend la campagne est différé (fin de transaction) : vérifié dans une transaction suivante.
do $$ begin
  perform tests.check((select uses_count from public.promotions where id = tests.getid('promo_v')) = 0
    and (select status from public.promotion_redemptions where order_id = tests.getid('promo_o')) = 'cancelled', 'campagne : commande entièrement annulée -> utilisation rendue une seule fois');
end $$;
