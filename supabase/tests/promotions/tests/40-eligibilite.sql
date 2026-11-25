-- ÉLIGIBILITÉ : nouveaux clients, limite par client et totale, aucune condition de quartier, cibles, code produits sans effet sur la livraison.
select tests.reset_promo();
-- Nouveaux clients
do $$
declare c3 uuid := tests.uid('c3'); o jsonb;
begin
  perform tests.new_promo('BIENVENUE', 'fixed', 2000, '{"audience": "new_customers"}');
  perform tests.buy(tests.uid('c1'), jsonb_build_array(tests.it('1')));   -- C1 a déjà commandé
  perform tests.check(tests.try_buy_msg(tests.uid('c1'), jsonb_build_array(tests.it('1')), '{"promoCode": "BIENVENUE"}') = 'Ce code est réservé aux nouveaux clients.',
    'Nouveaux clients : refusé à un client qui a déjà une commande');
  o := tests.buy_code(c3, jsonb_build_array(tests.it('1')), 'BIENVENUE');
  perform tests.check((o->>'promo_discount')::int = 2000, 'Nouveaux clients : accepté pour la première commande (C3)');
  perform tests.put('c3_first', to_jsonb((o->>'id')::uuid));
  perform tests.check(tests.try_buy_msg(c3, jsonb_build_array(tests.it('1')), '{"promoCode": "BIENVENUE"}') = 'Ce code est réservé aux nouveaux clients.',
    'Nouveaux clients : refusé pour la deuxième commande');
end $$;
-- Annulation de la première commande (déclencheur de fin de transaction) : C3 redevient « nouveau client »
update public.orders set status = 'cancelled' where id = tests.getid('c3_first');
do $$
begin
  perform tests.check(tests.try_buy_msg(tests.uid('c3'), jsonb_build_array(tests.it('1')), '{"promoCode": "BIENVENUE"}') = 'ok',
    'Nouveaux clients : une commande annulée ne compte pas');
end $$;

-- Limite par client et limite totale
select tests.reset_promo();
do $$
declare c1 uuid := tests.uid('c1'); c2 uuid := tests.uid('c2'); c4 uuid := tests.uid('c4');
begin
  perform tests.new_promo('UNEFOIS', 'fixed', 500, '{"max_uses_per_customer": 1}');
  perform tests.check(tests.try_buy_msg(c1, jsonb_build_array(tests.it('1')), '{"promoCode": "UNEFOIS"}') = 'ok', 'Limite par client : 1re utilisation acceptée');
  perform tests.check(tests.try_buy_msg(c1, jsonb_build_array(tests.it('1')), '{"promoCode": "UNEFOIS"}') = 'Vous avez déjà utilisé ce code.', 'Limite par client : 2e utilisation refusée');
  perform tests.check(tests.try_buy_msg(c2, jsonb_build_array(tests.it('1')), '{"promoCode": "UNEFOIS"}') = 'ok', 'Limite par client : un autre client peut l''utiliser');
  perform tests.new_promo('DEUXFOIS', 'fixed', 500, '{"max_uses_per_customer": 2}');
  perform tests.check(tests.try_buy_msg(c1, jsonb_build_array(tests.it('1')), '{"promoCode": "DEUXFOIS"}') = 'ok'
    and tests.try_buy_msg(c1, jsonb_build_array(tests.it('1')), '{"promoCode": "DEUXFOIS"}') = 'ok'
    and tests.try_buy_msg(c1, jsonb_build_array(tests.it('1')), '{"promoCode": "DEUXFOIS"}') = 'Vous avez déjà utilisé ce code.', 'Limite par client : 2 utilisations, la 3e refusée');
  perform tests.new_promo('TOTAL2', 'fixed', 500, '{"max_uses_total": 2}');
  perform tests.check(tests.try_buy_msg(c1, jsonb_build_array(tests.it('2')), '{"promoCode": "TOTAL2"}') = 'ok'
    and tests.try_buy_msg(c2, jsonb_build_array(tests.it('2')), '{"promoCode": "TOTAL2"}') = 'ok', 'Limite totale : 2 utilisations acceptées');
  perform tests.check(tests.try_buy_msg(c4, jsonb_build_array(tests.it('2')), '{"promoCode": "TOTAL2"}') = 'Ce code n''est plus disponible.', 'Limite totale : la 3e est refusée');
  perform tests.put('total2_order', to_jsonb((select order_id from public.promotion_redemptions where customer_id = c2 and promotion_id = (tests.promo('TOTAL2')->>'id')::uuid)));
end $$;
update public.orders set status = 'cancelled' where id = tests.getid('total2_order');
do $$
begin
  perform tests.check((tests.promo('TOTAL2')->>'uses_count')::int = 1, 'Limite totale : l''annulation rend l''utilisation (2 -> 1)');
  perform tests.check(tests.try_buy_msg(tests.uid('c4'), jsonb_build_array(tests.it('2')), '{"promoCode": "TOTAL2"}') = 'ok', 'Limite totale : la place libérée est réutilisable');
end $$;

-- Pas de condition de quartier (livraison : toute la région de Dakar)
select tests.reset_promo();
do $$
begin
  perform tests.new_promo('PARTOUT', 'fixed', 500);
  perform tests.check(tests.try_buy_msg(tests.uid('c1'), jsonb_build_array(tests.it('1')), '{"promoCode": "PARTOUT", "neighborhood": "Rufisque"}') = 'ok'
    and tests.try_buy_msg(tests.uid('c1'), jsonb_build_array(tests.it('1')), '{"promoCode": "PARTOUT", "neighborhood": ""}') = 'ok', 'Quartier : jamais vérifié (n''importe quel quartier, ou aucun)');
end $$;

-- Cibles : produit, boutique, catégorie, sous-catégorie
select tests.reset_promo();
do $$
declare v uuid; o jsonb; c1 uuid := tests.uid('c1');
begin
  v := tests.new_promo('CPROD', 'percent', 10); perform tests.target(v, 'product', tests.uid('e2')::text);
  o := tests.buy_code(c1, jsonb_build_array(tests.it('1'), tests.it('2')), 'CPROD');
  perform tests.check((o->>'promo_discount')::int = 2000 and tests.comp((o->>'id')::uuid, '2') = 2000 and tests.comp((o->>'id')::uuid, '1') is null,
    'Cible produit : seul le Sac (20 000) compte -> 2 000, rattachés à Boutique Deux seulement');
  v := tests.new_promo('CSHOP', 'percent', 10); perform tests.target(v, 'shop', tests.uid('b1')::text);
  o := tests.buy_code(c1, jsonb_build_array(tests.it('1'), tests.it('2')), 'CSHOP');
  perform tests.check((o->>'promo_discount')::int = 1000, 'Cible boutique : seule Boutique Un (10 000) compte -> 1 000');
  v := tests.new_promo('CCAT', 'percent', 10); perform tests.target(v, 'category', 'sacs');
  o := tests.buy_code(c1, jsonb_build_array(tests.it('1'), tests.it('2')), 'CCAT');
  perform tests.check((o->>'promo_discount')::int = 2000, 'Cible catégorie : « sacs » -> 2 000');
  v := tests.new_promo('CSOUS', 'percent', 10); perform tests.target(v, 'subcategory', 'mode-femme/jupes');
  o := tests.buy_code(c1, jsonb_build_array(tests.it('1'), tests.it('4')), 'CSOUS');
  perform tests.check((o->>'promo_discount')::int = 600 and (o->>'discount_amount')::int = 2600, 'Cible sous-catégorie : « mode-femme/jupes » -> 10 % de 6 000 seulement');
  perform tests.check(tests.try_buy_msg(c1, jsonb_build_array(tests.it('2')), '{"promoCode": "CSOUS"}') = 'Aucun article de votre panier n''est concerné par ce code.',
    'Cible : panier sans article concerné -> message du contrat');
  v := tests.new_promo('CMULTI', 'fixed', 900); perform tests.target(v, 'subcategory', 'mode-femme/robes'); perform tests.target(v, 'product', tests.uid('e5')::text);
  o := tests.buy_code(c1, jsonb_build_array(tests.it('1'), tests.it('2'), tests.it('5')), 'CMULTI');
  perform tests.check((o->>'promo_discount')::int = 900 and tests.comp((o->>'id')::uuid, '2') is null, 'Cibles multiples : Robe + Parfum concernés, Sac exclu');

  -- Un code « produits » ne touche jamais la livraison
  o := tests.buy_code(c1, jsonb_build_array(tests.it('1')), 'CSHOP');
  perform tests.check((o->>'delivery_fee')::int = 1500 and (o->>'delivery_discount')::int = 0 and (o->>'total_amount')::int = 9000 + 1500,
    'Code produits : livraison 1 500 inchangée, delivery_discount 0');
  perform tests.check((select bool_and(tests.total_ok(id)) from public.orders), 'Toutes les commandes : total = formule du contrat');
end $$;
