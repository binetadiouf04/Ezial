-- LIVRAISON OFFERTE (prorata, plafond, retrait), MULTIBOUTIQUE (répartition au franc près), BUDGET,
-- CAMPAGNES AUTOMATIQUES (une seule promotion par commande), COMMISSIONS INCHANGÉES.
select tests.reset_promo();
do $$
declare v uuid; o jsonb; oid uuid; c1 uuid := tests.uid('c1'); c2 uuid := tests.uid('c2'); ref jsonb; s jsonb;
begin
  -- Livraison offerte sur tout
  perform tests.new_promo('LIVRAISON', 'free_delivery', 0);
  o := tests.buy_code(c1, jsonb_build_array(tests.it('1')), 'LIVRAISON');
  oid := (o->>'id')::uuid;
  perform tests.check((o->>'delivery_fee')::int = 1500 and (o->>'delivery_discount')::int = 1500 and (o->>'promo_discount')::int = 0
    and (o->>'total_amount')::int = 10000 and tests.total_ok(oid), 'Livraison offerte : 1 500 offerts, delivery_fee garde le montant initial, total 10 000');
  perform tests.check((select count(*) from public.promotion_compensations where order_id = oid) = 0 and tests.sale(oid, '1') = '{"gross": 10000, "commission": 1000, "net": 9000}',
    'Livraison offerte : aucune compensation, vente vendeur intacte (coût 100 % Ezial)');
  perform tests.check((select ezial_cost from public.promotion_redemptions where order_id = oid) = 1500, 'Livraison offerte : coût Ezial = 1 500');

  -- Prorata sur panier mélangé (cible : Boutique Un)
  v := tests.new_promo('LIVB1', 'free_delivery', 0); perform tests.target(v, 'shop', tests.uid('b1')::text);
  o := tests.buy_code(c1, jsonb_build_array(tests.it('1'), tests.it('2')), 'LIVB1');
  perform tests.check((o->>'delivery_discount')::int = 500 and (o->>'total_amount')::int = 30000 + 1500 - 500,
    'Prorata : 1 500 × 10 000 / 30 000 = 500 offerts');
  -- Article non concerné en retrait : tout le livré est concerné
  o := tests.buy_code(c1, jsonb_build_array(tests.it('1'), tests.it('2')), 'LIVB1', tests.pickup('2'));
  perform tests.check((o->>'delivery_discount')::int = 1500, 'Prorata : la part en retrait ne compte pas (10 000 / 10 000 livré -> 1 500)');
  -- Plafond
  v := tests.new_promo('LIVCAP', 'free_delivery', 0, '{"delivery_cap": 300}');
  o := tests.buy_code(c1, jsonb_build_array(tests.it('1')), 'LIVCAP');
  perform tests.check((o->>'delivery_discount')::int = 300 and (o->>'total_amount')::int = 10000 + 1200, 'Plafond livraison : 300 au plus');
  v := tests.new_promo('LIVCAP2', 'free_delivery', 0, '{"delivery_cap": 1200}'); perform tests.target(v, 'shop', tests.uid('b2')::text);
  o := tests.buy_code(c1, jsonb_build_array(tests.it('1'), tests.it('2')), 'LIVCAP2');
  perform tests.check((o->>'delivery_discount')::int = 1000, 'Prorata + plafond : 1 500 × 20 000 / 30 000 = 1 000 (< plafond 1 200)');
  -- Rien de concerné n'est livré
  perform tests.check(tests.try_buy_msg(c1, jsonb_build_array(tests.it('2')), jsonb_build_object('promoCode', 'LIVRAISON') || tests.pickup('2'))
    = 'Ce code concerne la livraison : choisissez la livraison à domicile pour en profiter.', 'Livraison offerte : refus clair en retrait seul');
  perform tests.check(tests.try_buy_msg(c1, jsonb_build_array(tests.it('1'), tests.it('2')), jsonb_build_object('promoCode', 'LIVCAP2') || tests.pickup('2'))
    = 'Ce code concerne la livraison : choisissez la livraison à domicile pour en profiter.', 'Livraison offerte : refus si l''article concerné est en retrait');

  -- Multiboutique : répartition au prorata, commissions inchangées
  ref := tests.snap((tests.buy(c2, jsonb_build_array(tests.it('1'), tests.it('2'), tests.it('3')))->>'id')::uuid);
  perform tests.new_promo('MULTI10', 'percent', 10);
  o := tests.buy_code(c1, jsonb_build_array(tests.it('1'), tests.it('2'), tests.it('3')), 'MULTI10');
  oid := (o->>'id')::uuid;
  s := tests.snap(oid);
  perform tests.check((o->>'promo_discount')::int = 4500 and tests.comp(oid, '1') = 1000 and tests.comp(oid, '2') = 2000 and tests.comp(oid, '3') = 1500,
    'Multiboutique : 4 500 répartis 1 000 / 2 000 / 1 500');
  perform tests.check(s->'shops' = ref->'shops' and s->'items' = ref->'items', 'Multiboutique : sous-totaux, taux et commissions IDENTIQUES à la même commande sans promotion');
  perform tests.check(tests.sale(oid, '1') = '{"gross": 9000, "commission": 1000, "net": 8000}' and tests.sale(oid, '2') = '{"gross": 18000, "commission": 1600, "net": 16400}'
    and tests.sale(oid, '3') = '{"gross": 13500, "commission": 0, "net": 13500}', 'Multiboutique : ventes diminuées de la part promotion, commissions 10 % / 8 % / 0 % inchangées');
  perform tests.check((select sum(promo_compensation) from public.order_shops where order_id = oid) = 4500, 'Multiboutique : somme des parts = réduction exacte');
  -- Plus forts restes : 1 000 sur 10 000 / 20 000 / 3 333
  perform tests.new_promo('RESTES', 'fixed', 1000);
  o := tests.buy_code(c1, jsonb_build_array(tests.it('1'), tests.it('2'), tests.it('5')), 'RESTES');
  oid := (o->>'id')::uuid;
  perform tests.check(tests.comp(oid, '1') = 300 and tests.comp(oid, '2') = 600 and tests.comp(oid, '3') = 100
    and (select sum(amount) from public.promotion_compensations where order_id = oid) = 1000, 'Répartition : 300,0 / 600,0 / 99,99 -> 300 / 600 / 100 (somme exacte 1 000)');
  -- Jamais plus que la part éligible de la boutique
  perform tests.new_promo('TOUT', 'fixed', 50000);
  o := tests.buy_code(c1, jsonb_build_array(tests.it('1'), tests.it('5')), 'TOUT');
  oid := (o->>'id')::uuid;
  perform tests.check(tests.comp(oid, '1') = 10000 and tests.comp(oid, '3') = 3333 and (o->>'total_amount')::int = 1500, 'Répartition : jamais plus que la part éligible (10 000 / 3 333)');

  -- Budget : coût réduction produits + livraison, refus au-delà
  perform tests.new_promo('BUDGET', 'percent', 10, '{"budget_max": 1500}');
  perform tests.check(tests.try_buy_msg(c1, jsonb_build_array(tests.it('1')), '{"promoCode": "BUDGET"}') = 'ok', 'Budget : 1 000 sur 1 500 accepté');
  perform tests.check(tests.try_buy_msg(c2, jsonb_build_array(tests.it('1')), '{"promoCode": "BUDGET"}') = 'Ce code n''est plus disponible.', 'Budget : 1 000 de plus dépasserait 1 500 -> refusé');
  perform tests.check(tests.try_buy_msg(c2, jsonb_build_array(tests.it('5')), '{"promoCode": "BUDGET"}') = 'ok', 'Budget : 333 de plus (1 333 ≤ 1 500) accepté');
  perform tests.check((tests.promo('BUDGET')->>'budget_used')::int = 1333 and (tests.promo('BUDGET')->>'uses_count')::int = 2, 'Budget : budget_used 1 333, 2 utilisations');
  perform tests.new_promo('BUDLIV', 'free_delivery', 0, '{"budget_max": 2000}');
  perform tests.check(tests.try_buy_msg(c1, jsonb_build_array(tests.it('1')), '{"promoCode": "BUDLIV"}') = 'ok'
    and tests.try_buy_msg(c2, jsonb_build_array(tests.it('1')), '{"promoCode": "BUDLIV"}') = 'Ce code n''est plus disponible.', 'Budget : la livraison offerte compte dans le budget (1 500 + 1 500 > 2 000)');
  perform tests.check((select bool_and(tests.total_ok(id)) from public.orders), 'Toutes les commandes : total = formule du contrat');
end $$;

-- Campagnes automatiques : la meilleure (coût Ezial le plus élevé), une seule par commande, jamais avec un code
select tests.reset_promo();
do $$
declare o jsonb; c1 uuid := tests.uid('c1'); v_auto5 uuid; v_autoliv uuid; ref jsonb;
begin
  ref := tests.snap((tests.buy(c1, jsonb_build_array(tests.it('1')))->>'id')::uuid);
  v_auto5 := tests.new_promo(null, 'percent', 5);
  v_autoliv := tests.new_promo(null, 'free_delivery', 0, jsonb_build_object('delivery_cap', 1000, 'ends_at', now() + interval '5 days'));
  o := tests.buy(c1, jsonb_build_array(tests.it('1')));
  perform tests.check((o->>'promotion_id')::uuid = v_autoliv and o->>'promo_code' is null and (o->>'delivery_discount')::int = 1000 and (o->>'promo_discount')::int = 0,
    'Automatique : livraison offerte (1 000) préférée à 5 % (500)');
  o := tests.buy(c1, jsonb_build_array(tests.it('2')));
  perform tests.check((o->>'promotion_id')::uuid = v_autoliv and (o->>'delivery_discount')::int = 1000, 'Automatique : 5 % de 20 000 = 1 000 = livraison 1 000 -> à égalité, celle qui finit le plus tôt');
  o := tests.buy(c1, jsonb_build_array(tests.it('3'), tests.it('2')));
  perform tests.check((o->>'promotion_id')::uuid = v_auto5 and (o->>'promo_discount')::int = 1750 and (o->>'delivery_discount')::int = 0, 'Automatique : 5 % de 35 000 = 1 750 > 1 000 -> pourcentage');
  perform tests.new_promo('CODE300', 'fixed', 300);
  o := tests.buy_code(c1, jsonb_build_array(tests.it('1')), 'CODE300');
  perform tests.check(o->>'promo_code' = 'CODE300' and (o->>'promo_discount')::int = 300 and (o->>'delivery_discount')::int = 0,
    'Une seule promotion : le code saisi remplace les campagnes automatiques (même moins avantageux)');
  perform tests.check((select count(*) from public.promotion_redemptions r join public.orders x on x.id = r.order_id) = (select count(*) from public.orders where promotion_id is not null),
    'Une seule promotion : une utilisation par commande');
  update public.promotions set status = 'paused' where code is null;
  o := tests.buy(c1, jsonb_build_array(tests.it('1')));
  perform tests.check(tests.snap((o->>'id')::uuid) = ref and o->>'promotion_id' is null, 'Sans campagne active : commande strictement identique à la référence');
  update public.promotions set status = 'active', starts_at = now() - interval '2 days', ends_at = now() - interval '1 second' where code is null;
  o := tests.buy(c1, jsonb_build_array(tests.it('1')));
  perform tests.check(o->>'promotion_id' is null, 'Automatique expirée : non appliquée');
  perform tests.check((select bool_and(tests.total_ok(id)) from public.orders), 'Toutes les commandes : total = formule du contrat');
end $$;
