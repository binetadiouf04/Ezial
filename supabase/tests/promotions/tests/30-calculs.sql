-- CALCULS : pourcentage, fixe, arrondis, plafond, minimum, promotion produit, dates et statuts, messages du contrat.
-- Rappel du banc : Robe e1 10 000 (Boutique Un, Free 10 %), Sac e2 20 000 (Boutique Deux, Plus 8 %),
-- Collier e3 15 000 et Parfum e5 3 333 (boutique officielle, 0 %), Jupe e4 8 000 en promotion produit à 6 000 (Boutique Un).
-- Livraison du banc : 1 500 FCFA.
select tests.reset_promo();
do $$
declare o jsonb; oid uuid; c1 uuid := tests.uid('c1'); msg text;
begin
  -- Pourcentage simple
  perform tests.new_promo('P10', 'percent', 10);
  o := tests.buy_code(c1, jsonb_build_array(tests.it('1')), 'p10 ');
  oid := (o->>'id')::uuid;
  perform tests.check((o->>'promo_discount')::int = 1000 and (o->>'delivery_discount')::int = 0 and (o->>'delivery_fee')::int = 1500
    and (o->>'total_amount')::int = 10500 and o->>'promo_code' = 'P10' and (o->>'promotion_id')::uuid = (tests.promo('P10')->>'id')::uuid
    and (o->>'discount_amount')::int = 1000, 'Pourcentage : 10 % de 10 000 = 1 000 ; total 10 500 ; code saisi en minuscules accepté');
  perform tests.check(tests.total_ok(oid), 'Pourcentage : total = formule du contrat');
  perform tests.check((select commission_amount from public.order_shops where order_id = oid) = 1000
    and (select promo_allocation from public.order_shops where order_id = oid) = 1000, 'Pourcentage : commission 1 000 INCHANGÉE (10 % de 10 000), part de réduction rattachée 1 000 (journal)');
  perform tests.check(tests.sale(oid, '1') = '{"gross": 10000, "commission": 1000, "net": 9000}', 'Pourcentage : vente vendeur INTACTE 10 000 brut / 1 000 commission / 9 000 net (réduction payée par Ezial)');
  perform tests.check(tests.comp(oid, '1') = 1000 and (select promo_seller_share from public.order_shops where order_id = oid) = 0, 'Pourcentage : coût Ezial 1 000 pour la boutique, aucune part vendeur');
  perform tests.check((select row(status, eligible_amount, product_discount, delivery_discount, ezial_cost, customer_id)::text from public.promotion_redemptions where order_id = oid)
    = row('counted', 10000, 1000, 0, 1000, c1)::text, 'Pourcentage : utilisation comptée (éligible 10 000, coût Ezial 1 000)');
  perform tests.check((tests.promo('P10')->>'uses_count')::int = 1 and (tests.promo('P10')->>'budget_used')::int = 1000, 'Pourcentage : uses_count 1, budget_used 1 000');

  -- Arrondis (au franc, demi vers le haut)
  perform tests.new_promo('P15', 'percent', 15);
  o := tests.buy_code(c1, jsonb_build_array(tests.it('5')), 'P15');
  perform tests.check((o->>'promo_discount')::int = 500, 'Arrondi : 15 % de 3 333 = 499,95 -> 500');
  perform tests.new_promo('P50', 'percent', 50);
  o := tests.buy_code(c1, jsonb_build_array(tests.it('5')), 'P50');
  perform tests.check((o->>'promo_discount')::int = 1667 and (o->>'total_amount')::int = 3333 - 1667 + 1500, 'Arrondi : 50 % de 3 333 = 1 666,5 -> 1 667');
  perform tests.new_promo('P03', 'percent', 3);
  o := tests.buy_code(c1, jsonb_build_array(tests.it('5')), 'P03');
  perform tests.check((o->>'promo_discount')::int = 100, 'Arrondi : 3 % de 3 333 = 99,99 -> 100');

  -- Plafond du pourcentage
  perform tests.new_promo('PLAF', 'percent', 50, '{"max_discount": 2000}');
  o := tests.buy_code(c1, jsonb_build_array(tests.it('1')), 'PLAF');
  perform tests.check((o->>'promo_discount')::int = 2000, 'Plafond : 50 % de 10 000 plafonné à 2 000');

  -- Fixe
  perform tests.new_promo('F3000', 'fixed', 3000);
  o := tests.buy_code(c1, jsonb_build_array(tests.it('5')), 'F3000');
  perform tests.check((o->>'promo_discount')::int = 3000 and (o->>'total_amount')::int = 333 + 1500, 'Fixe : 3 000 sur 3 333');
  perform tests.new_promo('F9000', 'fixed', 9000);
  o := tests.buy_code(c1, jsonb_build_array(tests.it('5')), 'F9000');
  perform tests.check((o->>'promo_discount')::int = 3333 and (o->>'total_amount')::int = 1500 and (o->>'delivery_fee')::int = 1500,
    'Fixe : jamais plus que le montant éligible (9 000 -> 3 333), livraison due');

  -- Minimum sur le montant éligible
  perform tests.new_promo('MIN15', 'fixed', 1000, '{"min_amount": 15000}');
  msg := tests.try_buy_msg(c1, jsonb_build_array(tests.it('1')), '{"promoCode": "MIN15"}');
  perform tests.check(msg = 'Il manque 5 000 FCFA d''articles concernés pour profiter de ce code (minimum 15 000 FCFA).', 'Minimum : message exact (« ' || msg || ' »)');
  o := tests.buy_code(c1, jsonb_build_array(tests.it('1'), tests.it('5', 2)), 'MIN15');
  perform tests.check((o->>'promo_discount')::int = 1000, 'Minimum : atteint (16 666) -> réduction appliquée');

  -- Promotion produit : la campagne porte sur le prix RÉELLEMENT payé
  o := tests.buy_code(c1, jsonb_build_array(tests.it('4')), 'P10');
  oid := (o->>'id')::uuid;
  perform tests.check((o->>'promo_discount')::int = 600 and (o->>'discount_amount')::int = 2600 and (o->>'total_amount')::int = 8000 - 2600 + 1500
    and tests.total_ok(oid), 'Promotion produit : 10 % de 6 000 (prix promo) = 600 ; remises 2 000 + 600 ; formule respectée');
  perform tests.check((select commission_amount from public.order_shops where order_id = oid) = 600, 'Promotion produit : commission 600 (10 % de 6 000) inchangée');

  -- Dates et statuts
  perform tests.new_promo('FUTUR', 'percent', 10, jsonb_build_object('starts_at', now() + interval '1 day', 'ends_at', now() + interval '5 days'));
  perform tests.check(tests.try_buy_msg(c1, jsonb_build_array(tests.it('1')), '{"promoCode": "FUTUR"}') = 'Ce code n''est pas encore valable.', 'Dates : pas encore commencé');
  perform tests.new_promo('PASSE', 'percent', 10, jsonb_build_object('starts_at', now() - interval '5 days', 'ends_at', now() - interval '1 minute'));
  perform tests.check(tests.try_buy_msg(c1, jsonb_build_array(tests.it('1')), '{"promoCode": "PASSE"}') = 'Ce code a expiré.', 'Dates : expiré');
  perform tests.new_promo('PAUSE', 'percent', 10, '{"status": "paused"}');
  perform tests.check(tests.try_buy_msg(c1, jsonb_build_array(tests.it('1')), '{"promoCode": "PAUSE"}') = 'Ce code est suspendu.', 'Statut : suspendu');
  perform tests.new_promo('FINI', 'percent', 10, '{"status": "ended"}');
  perform tests.check(tests.try_buy_msg(c1, jsonb_build_array(tests.it('1')), '{"promoCode": "FINI"}') = 'Ce code a expiré.', 'Statut : terminé = expiré');
  perform tests.new_promo('BROUILLON', 'percent', 10, '{"status": "draft"}');
  perform tests.check(tests.try_buy_msg(c1, jsonb_build_array(tests.it('1')), '{"promoCode": "BROUILLON"}') = 'Code promo invalide.', 'Statut : brouillon = invalide');
  perform tests.check(tests.try_buy_msg(c1, jsonb_build_array(tests.it('1')), '{"promoCode": "INCONNU"}') = 'Code promo invalide.', 'Code inconnu : invalide');
  perform tests.check(tests.try_buy_msg(c1, jsonb_build_array(tests.it('1')), '{"promoCode": "EZI10"}') = 'Ce code est suspendu.', 'EZI10 repris : suspendu tant que l''administratrice ne l''active pas');
  -- Une commande refusée ne laisse rien (ni commande, ni stock retiré, ni utilisation)
  perform tests.check((select count(*) from public.orders where promo_code is null and promotion_id is null) = 0, 'Refus : aucune commande créée');
  perform tests.check((select count(*) from public.promotion_redemptions) = (select count(*) from public.orders), 'Refus : une utilisation par commande, aucune orpheline');
  perform tests.check((select bool_and(tests.total_ok(id)) from public.orders), 'Toutes les commandes : total = formule du contrat');
end $$;
