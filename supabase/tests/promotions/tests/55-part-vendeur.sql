-- PART VENDEUR (facultative, acceptée par la boutique) : A = part de la réduction rattachée à la boutique (journal),
-- V = partie acceptée par la boutique, SEULE déduite automatiquement de sa vente (plafonnée au net : jamais négatif) ;
-- Ezial paie A − V sans aucun versement manuel ; budget et coût Ezial sans V ; jamais sur la livraison.
select tests.reset_promo();
do $$
declare v uuid; o jsonb; oid uuid; c1 uuid := tests.uid('c1'); c2 uuid := tests.uid('c2'); ref jsonb; s jsonb; r record;
begin
  ref := tests.snap((tests.buy(c2, jsonb_build_array(tests.it('1'), tests.it('2'), tests.it('3')))->>'id')::uuid);
  -- Sans part vendeur : soldes vendeurs (ventes, commissions, net) STRICTEMENT identiques à la même commande sans campagne
  v := tests.new_promo('SANSPART', 'percent', 10);
  o := tests.buy_code(c1, jsonb_build_array(tests.it('1'), tests.it('2'), tests.it('3')), 'SANSPART');
  s := tests.snap((o->>'id')::uuid);
  perform tests.check((o->>'promo_discount')::int = 4500 and s->'sales' = ref->'sales' and s->'shops' = ref->'shops' and s->'items' = ref->'items',
    'Sans part vendeur : ventes, commissions et net des 3 boutiques identiques à la commande sans campagne (réduction 4 500 payée par Ezial)');
  -- 10 % sur 3 boutiques : A = 1 000 / 2 000 / 1 500 ; Boutique Un finance 30 %, Boutique Deux 500 FCFA fixe par commande
  v := tests.new_promo('PARTAGE', 'percent', 10, '{"budget_max": 100000}');
  perform tests.share(v, '1', 'percent', 30); perform tests.share(v, '2', 'fixed', 500);
  o := tests.buy_code(c1, jsonb_build_array(tests.it('1'), tests.it('2'), tests.it('3')), 'PARTAGE');
  oid := (o->>'id')::uuid; s := tests.snap(oid);
  perform tests.check((o->>'promo_discount')::int = 4500 and (o->>'total_amount')::int = 45000 - 4500 + 1500 and tests.total_ok(oid),
    'Part vendeur : le client a toujours 4 500 de réduction ; total = formule du contrat');
  perform tests.check(s->'shops' = ref->'shops' and s->'items' = ref->'items', 'Part vendeur : commissions et sous-totaux INCHANGÉS');
  select array_agg(row(os.shop_id, os.promo_allocation, os.promo_seller_share)::text order by os.shop_id) as a into r from public.order_shops os where os.order_id = oid;
  perform tests.check(r.a = array[row(tests.uid('b1'), 1000, 300)::text, row(tests.uid('b2'), 2000, 500)::text, row(tests.uid('b3'), 1500, 0)::text],
    'Part vendeur : order_shops A / V = 1 000 / 300 ; 2 000 / 500 ; 1 500 / 0');
  perform tests.check(tests.sale(oid, '1') = '{"gross": 9700, "commission": 1000, "net": 8700}' and tests.sale(oid, '2') = '{"gross": 19500, "commission": 1600, "net": 17900}'
    and tests.sale(oid, '3') = '{"gross": 15000, "commission": 0, "net": 15000}',
    'Part vendeur : ventes diminuées de la SEULE part acceptée V (300 en 30 %, 500 fixe, 0 sans accord), commissions inchangées');
  perform tests.check(tests.comp(oid, '1') = 700 and tests.comp(oid, '2') = 1500 and tests.comp(oid, '3') = 1500,
    'Part vendeur : coût Ezial par boutique = A − V (700 / 1 500 / 1 500), sans aucun versement manuel');
  perform tests.check((select row(product_discount, delivery_discount, seller_funded, ezial_cost)::text from public.promotion_redemptions where order_id = oid) = row(4500, 0, 800, 3700)::text,
    'Part vendeur : utilisation : réduction 4 500, financé par les vendeurs 800, coût Ezial 3 700');
  perform tests.check((tests.promo('PARTAGE')->>'budget_used')::int = 3700, 'Part vendeur : le budget ne compte que le coût Ezial (3 700)');
  -- Part fixe supérieure à A : plafonnée à A
  v := tests.new_promo('VENDEURTOUT', 'fixed', 400); perform tests.share(v, '1', 'fixed', 1000);
  o := tests.buy_code(c1, jsonb_build_array(tests.it('1')), 'VENDEURTOUT');
  oid := (o->>'id')::uuid;
  perform tests.check((o->>'promo_discount')::int = 400 and (select promo_seller_share from public.order_shops where order_id = oid) = 400
    and (select ezial_cost from public.promotion_redemptions where order_id = oid) = 0
    and tests.sale(oid, '1') = '{"gross": 9600, "commission": 1000, "net": 8600}',
    'Part vendeur : 1 000 fixe plafonné à A = 400 ; financé à 100 % par la boutique : coût Ezial 0, vente − 400');
  -- Arrondi du pourcentage : 15 % de A = 333 -> 49,95 -> 50
  v := tests.new_promo('ARRONDI', 'fixed', 333); perform tests.share(v, '3', 'percent', 15);
  o := tests.buy_code(c1, jsonb_build_array(tests.it('5')), 'ARRONDI');
  oid := (o->>'id')::uuid;
  perform tests.check((select row(promo_allocation, promo_seller_share)::text from public.order_shops where order_id = oid) = row(333, 50)::text
    and tests.comp(oid, '3') = 283 and tests.sale(oid, '3') = '{"gross": 3283, "commission": 0, "net": 3283}',
    'Part vendeur : 15 % de 333 = 49,95 -> 50 déduits de la vente ; coût Ezial 283');
  -- Réduction couvrant TOUT le montant de la boutique
  --   sans part vendeur : vente intacte (10 000 / 1 000 / 9 000), Ezial paie les 10 000
  v := tests.new_promo('TOUTOFFERT', 'fixed', 10000);
  o := tests.buy_code(c1, jsonb_build_array(tests.it('1')), 'TOUTOFFERT');
  oid := (o->>'id')::uuid;
  perform tests.check((o->>'promo_discount')::int = 10000 and (o->>'total_amount')::int = 1500 and tests.sale(oid, '1') = '{"gross": 10000, "commission": 1000, "net": 9000}'
    and (select commission_amount from public.order_shops where order_id = oid) = 1000 and tests.comp(oid, '1') = 10000,
    'Tout offert sans part vendeur : client paie 1 500 (livraison), vente vendeur INTACTE 9 000 net, commission 1 000 identique, coût Ezial 10 000');
  --   avec part vendeur 100 % : V plafonnée au net de la vente (10 000 − 1 000 = 9 000) -> solde 0, jamais négatif
  v := tests.new_promo('TOUTPARTAGE', 'fixed', 10000); perform tests.share(v, '1', 'percent', 100);
  o := tests.buy_code(c1, jsonb_build_array(tests.it('1')), 'TOUTPARTAGE');
  oid := (o->>'id')::uuid;
  perform tests.check((select row(promo_allocation, promo_seller_share)::text from public.order_shops where order_id = oid) = row(10000, 9000)::text
    and tests.sale(oid, '1') = '{"gross": 1000, "commission": 1000, "net": 0}'
    and (select row(seller_funded, ezial_cost)::text from public.promotion_redemptions where order_id = oid) = row(9000, 1000)::text,
    'Tout offert, part vendeur 100 % : V plafonnée à 9 000 (net de la vente), net vendeur 0 (jamais négatif), commission 1 000 inchangée, coût Ezial 1 000');
  --   part fixe démesurée (50 000) sur le Sac (20 000, 8 %) : plafonnée à A puis au net 18 400
  v := tests.new_promo('SACOFFERT', 'fixed', 20000); perform tests.share(v, '2', 'fixed', 50000);
  o := tests.buy_code(c1, jsonb_build_array(tests.it('2')), 'SACOFFERT');
  oid := (o->>'id')::uuid;
  perform tests.check(tests.sale(oid, '2') = '{"gross": 1600, "commission": 1600, "net": 0}' and (select promo_seller_share from public.order_shops where order_id = oid) = 18400,
    'Tout offert, part fixe 50 000 : plafonnée à 18 400, net vendeur 0, commission 1 600 inchangée');
  perform tests.check(not exists (select 1 from public.seller_transactions where net_amount < 0), 'Solde vendeur : aucune vente négative dans tout le scénario');
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
  -- Paiement Orange Money : la vente créée au paiement retire seulement V
  update public.payment_settings set orange_money_enabled = true;
  o := tests.buy_code(c2, jsonb_build_array(tests.it('1'), tests.it('2')), 'PARTAGE', '{}', 'orange_money');
  oid := (o->>'id')::uuid;
  perform public.payments_record_verification((public.payments_create_transaction(oid, 'orange_money', c2)).id, 'confirmed', (o->>'total_amount')::integer, 'MP-PART');
  perform tests.check(tests.sale(oid, '1') = '{"gross": 9700, "commission": 1000, "net": 8700}' and tests.sale(oid, '2') = '{"gross": 19500, "commission": 1600, "net": 17900}',
    'Part vendeur + Orange Money : vente au paiement diminuée de V seulement, commission inchangée');
  perform tests.put('part_om', to_jsonb(oid));
end $$;
-- Annulation : budget rendu = coût Ezial seulement
update public.orders set status = 'cancelled' where id = tests.getid('part_om');
do $$
begin
  perform tests.check((tests.promo('PARTAGE')->>'budget_used')::int = 3700 and (tests.promo('PARTAGE')->>'uses_count')::int = 1,
    'Part vendeur : annulation -> budget rendu du seul coût Ezial (3 700 + 2 200 - 2 200)');
  perform tests.check((select bool_and(status = 'cancelled') from public.seller_transactions where order_id = tests.getid('part_om') and type = 'sale'),
    'Part vendeur : commande annulée -> ventes annulées par le circuit habituel');
  perform tests.check((select bool_and(tests.total_ok(id)) from public.orders), 'Toutes les commandes : total = formule du contrat');
end $$;
-- Statistiques admin avec part vendeur : coût Ezial = réductions − parts vendeurs acceptées
do $$
declare p jsonb;
begin
  perform tests.as_user(tests.uid('a1'));
  select x into p from jsonb_array_elements(public.admin_promotions_list()) x where x->>'code' = 'PARTAGE';
  perform tests.as_system();
  perform tests.check(p->'stats' = '{"orders": 1, "product_discount": 4500, "delivery_discount": 0, "ezial_cost": 3700, "seller_funded": 800, "budget_remaining": 96300, "sales": 45000, "commissions": 2600, "ezial_net": -1100}'::jsonb,
    'Statistiques : 4 500 de réduction, 800 financés par les vendeurs, coût Ezial 3 700, net Ezial 2 600 − 3 700 = −1 100 (commande annulée exclue) : ' || (p->'stats')::text);
end $$;
