-- PART VENDEUR (facultative, acceptée par la boutique) : A = part de la réduction de la boutique (retirée de sa vente),
-- V = partie financée par la boutique, Ezial reverse A − V ; budget et coût Ezial sans V ; jamais sur la livraison.
select tests.reset_promo();
do $$
declare v uuid; o jsonb; oid uuid; c1 uuid := tests.uid('c1'); c2 uuid := tests.uid('c2'); ref jsonb; s jsonb; r record;
begin
  ref := tests.snap((tests.buy(c2, jsonb_build_array(tests.it('1'), tests.it('2'), tests.it('3')))->>'id')::uuid);
  -- 10 % sur 3 boutiques : A = 1 000 / 2 000 / 1 500 ; Boutique Un finance 30 %, Boutique Deux 500 FCFA fixe par commande
  v := tests.new_promo('PARTAGE', 'percent', 10, '{"budget_max": 100000}');
  perform tests.share(v, '1', 'percent', 30); perform tests.share(v, '2', 'fixed', 500);
  o := tests.buy_code(c1, jsonb_build_array(tests.it('1'), tests.it('2'), tests.it('3')), 'PARTAGE');
  oid := (o->>'id')::uuid; s := tests.snap(oid);
  perform tests.check((o->>'promo_discount')::int = 4500 and (o->>'total_amount')::int = 45000 - 4500 + 1500 and tests.total_ok(oid),
    'Part vendeur : le client a toujours 4 500 de réduction ; total = formule du contrat');
  perform tests.check(s->'shops' = ref->'shops' and s->'items' = ref->'items', 'Part vendeur : commissions et sous-totaux INCHANGÉS');
  select array_agg(row(os.shop_id, os.promo_compensation, os.promo_seller_share)::text order by os.shop_id) as a into r from public.order_shops os where os.order_id = oid;
  perform tests.check(r.a = array[row(tests.uid('b1'), 1000, 300)::text, row(tests.uid('b2'), 2000, 500)::text, row(tests.uid('b3'), 1500, 0)::text],
    'Part vendeur : order_shops A / V = 1 000 / 300 ; 2 000 / 500 ; 1 500 / 0');
  perform tests.check(tests.sale(oid, '1') = '{"gross": 9000, "commission": 1000, "net": 8000}' and tests.sale(oid, '2') = '{"gross": 18000, "commission": 1600, "net": 16400}'
    and tests.sale(oid, '3') = '{"gross": 13500, "commission": 0, "net": 13500}', 'Part vendeur : ventes diminuées de A, commission inchangée');
  perform tests.check((select array_agg(row(shop_id, amount, seller_share, gross_allocation)::text order by shop_id) from public.promotion_compensations where order_id = oid)
    = array[row(tests.uid('b1'), 700, 300, 1000)::text, row(tests.uid('b2'), 1500, 500, 2000)::text, row(tests.uid('b3'), 1500, 0, 1500)::text],
    'Part vendeur : compensations Ezial = A − V (700 / 1 500 / 1 500), traçabilité seller_share et gross_allocation');
  perform tests.check((select row(product_discount, delivery_discount, seller_funded, ezial_cost)::text from public.promotion_redemptions where order_id = oid) = row(4500, 0, 800, 3700)::text,
    'Part vendeur : utilisation : réduction 4 500, financé par les vendeurs 800, coût Ezial 3 700');
  perform tests.check((tests.promo('PARTAGE')->>'budget_used')::int = 3700, 'Part vendeur : le budget ne compte que le coût Ezial (3 700)');
  -- Part fixe supérieure à A : plafonnée à A, aucune compensation
  v := tests.new_promo('VENDEURTOUT', 'fixed', 400); perform tests.share(v, '1', 'fixed', 1000);
  o := tests.buy_code(c1, jsonb_build_array(tests.it('1')), 'VENDEURTOUT');
  oid := (o->>'id')::uuid;
  perform tests.check((o->>'promo_discount')::int = 400 and (select promo_seller_share from public.order_shops where order_id = oid) = 400
    and (select count(*) from public.promotion_compensations where order_id = oid) = 0 and (select ezial_cost from public.promotion_redemptions where order_id = oid) = 0
    and tests.sale(oid, '1') = '{"gross": 9600, "commission": 1000, "net": 8600}',
    'Part vendeur : 1 000 fixe plafonné à A = 400 ; financé à 100 % par la boutique : aucune compensation, coût Ezial 0');
  -- Arrondi du pourcentage : 15 % de A = 333 -> 49,95 -> 50
  v := tests.new_promo('ARRONDI', 'fixed', 333); perform tests.share(v, '3', 'percent', 15);
  o := tests.buy_code(c1, jsonb_build_array(tests.it('5')), 'ARRONDI');
  perform tests.check((select row(amount, seller_share, gross_allocation)::text from public.promotion_compensations where order_id = (o->>'id')::uuid) = row(283, 50, 333)::text,
    'Part vendeur : 15 % de 333 = 49,95 -> 50 ; Ezial 283');
  -- Jamais sur la livraison offerte
  v := tests.new_promo('LIVPART', 'free_delivery', 0); perform tests.share(v, '1', 'percent', 100);
  o := tests.buy_code(c1, jsonb_build_array(tests.it('1')), 'LIVPART');
  oid := (o->>'id')::uuid;
  perform tests.check((o->>'delivery_discount')::int = 1500 and (select row(seller_funded, ezial_cost)::text from public.promotion_redemptions where order_id = oid) = row(0, 1500)::text
    and (select promo_seller_share from public.order_shops where order_id = oid) = 0 and tests.sale(oid, '1') = '{"gross": 10000, "commission": 1000, "net": 9000}',
    'Part vendeur : jamais appliquée à la livraison offerte (100 % Ezial)');
  -- Budget avec part vendeur : 2e commande acceptée parce que seul le coût Ezial compte
  v := tests.new_promo('BUDPART', 'fixed', 1000, '{"budget_max": 1000}'); perform tests.share(v, '1', 'percent', 50);
  perform tests.check(tests.try_buy_msg(c1, jsonb_build_array(tests.it('1')), '{"promoCode": "BUDPART"}') = 'ok'
    and tests.try_buy_msg(c2, jsonb_build_array(tests.it('1')), '{"promoCode": "BUDPART"}') = 'ok'
    and tests.try_buy_msg(c2, jsonb_build_array(tests.it('1')), '{"promoCode": "BUDPART"}') = 'Ce code n''est plus disponible.',
    'Part vendeur : budget 1 000 = 2 commandes à 500 de coût Ezial, la 3e refusée');
  -- Paiement Orange Money : la vente créée au paiement retire A (pas seulement la part Ezial)
  update public.payment_settings set orange_money_enabled = true;
  o := tests.buy_code(c2, jsonb_build_array(tests.it('1'), tests.it('2')), 'PARTAGE', '{}', 'orange_money');
  oid := (o->>'id')::uuid;
  perform public.payments_record_verification((public.payments_create_transaction(oid, 'orange_money', c2)).id, 'confirmed', (o->>'total_amount')::integer, 'MP-PART');
  perform tests.check(tests.sale(oid, '1') = '{"gross": 9000, "commission": 1000, "net": 8000}' and tests.sale(oid, '2') = '{"gross": 18000, "commission": 1600, "net": 16400}',
    'Part vendeur + Orange Money : vente au paiement diminuée de A, commission inchangée');
  perform tests.put('part_om', to_jsonb(oid));
end $$;
-- Annulation : budget rendu = coût Ezial seulement
update public.orders set status = 'cancelled' where id = tests.getid('part_om');
do $$
begin
  perform tests.check((tests.promo('PARTAGE')->>'budget_used')::int = 3700 and (tests.promo('PARTAGE')->>'uses_count')::int = 1,
    'Part vendeur : annulation -> budget rendu du seul coût Ezial (3 700 + 2 200 - 2 200)');
  perform tests.check((select bool_and(status = 'cancelled') from public.promotion_compensations where order_id = tests.getid('part_om')), 'Part vendeur : compensations de la commande annulée annulées');
  perform tests.check((select bool_and(tests.total_ok(id)) from public.orders), 'Toutes les commandes : total = formule du contrat');
end $$;
