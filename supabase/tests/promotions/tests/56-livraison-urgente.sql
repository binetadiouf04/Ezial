-- LIVRAISON URGENTE (en production depuis le 24-25 nov. 2026) + CAMPAGNES : le supplément de 500 FCFA reste
-- toujours entier (jamais réduit par une campagne, jamais compté dans la livraison offerte ni dans le budget).
-- Banc : Robe e1 10 000 (Boutique Un, 10 %), Sac e2 20 000 (Boutique Deux, 8 %), livraison 1 500.
select tests.reset_promo();
do $$
declare
  c1 uuid := tests.uid('c1'); o jsonb; n jsonb; oid uuid; ref jsonb := (select v->'urgente_2_boutiques' from tests.reference);
  v_uses integer; t public.payment_transactions; msg text;
begin
  -- 0. Référence de production (sans campagne) : +500 exactement
  perform tests.check((ref->'order'->>'urgent_fee')::int = 500 and (ref->'order'->>'is_urgent')::boolean
    and (ref->'order'->>'total_amount')::int = 30000 + 1500 + 2000 + 500,
    'Référence production : commande urgente = 30 000 + 1 500 + 2 000 (cadeau) + 500 = 34 000');

  -- 1. Pourcentage + urgence
  perform tests.new_promo('URG10', 'percent', 10);
  o := tests.buy_code(c1, jsonb_build_array(tests.it('1'), tests.it('2')), 'URG10', tests.urgent());
  oid := (o->>'id')::uuid;
  perform tests.check((o->>'promo_discount')::int = 3000 and (o->>'urgent_fee')::int = 500 and (o->>'is_urgent')::boolean
    and (o->>'delivery_fee')::int = 1500 and (o->>'delivery_discount')::int = 0 and (o->>'total_amount')::int = 30000 - 3000 + 1500 + 500,
    'Urgence + 10 % : réduction 3 000, supplément 500 intact, total 29 000');
  perform tests.check(tests.total_ok(oid), 'Urgence + 10 % : total = formule du contrat (+ urgent_fee)');
  perform tests.check((select jsonb_agg(jsonb_build_object('c', commission_amount, 's', subtotal) order by shop_id) from public.order_shops where order_id = oid)
    = (select jsonb_agg(jsonb_build_object('c', (x->>'commission')::numeric, 's', (x->>'subtotal')::numeric) order by x->>'shop') from jsonb_array_elements((select v->'urgente_2_boutiques'->'shops' from tests.reference)) x),
    'Urgence + 10 % : sous-totaux et commissions des boutiques identiques à la commande urgente sans campagne');
  perform tests.check((select coalesce(sum(promo_allocation), 0) from public.order_shops where order_id = oid) = 3000,
    'Urgence + 10 % : seule la réduction produits (3 000) est rattachée aux boutiques, jamais le supplément urgent');
  perform tests.check((select ezial_cost from public.promotion_redemptions where order_id = oid) = 3000
    and (tests.promo('URG10')->>'budget_used')::int = 3000, 'Urgence + 10 % : coût Ezial et budget = 3 000 (le supplément n''y entre pas)');
  -- Même panier, même code, sans urgence : exactement 500 de moins, même réduction
  n := tests.buy_code(tests.uid('c2'), jsonb_build_array(tests.it('1'), tests.it('2')), 'URG10');
  perform tests.check((o->>'total_amount')::int - (n->>'total_amount')::int = 500 and (n->>'promo_discount')::int = 3000
    and (n->>'urgent_fee')::int = 0 and not (n->>'is_urgent')::boolean, 'Urgence + 10 % : même commande sans urgence = 500 de moins, même réduction');

  -- 2. Livraison offerte (code) + urgence : seuls les frais de livraison sont offerts, pas le supplément
  perform tests.new_promo('URGLIV', 'free_delivery', 0);
  o := tests.buy_code(c1, jsonb_build_array(tests.it('1'), tests.it('2')), 'URGLIV', tests.urgent());
  perform tests.check((o->>'delivery_discount')::int = 1500 and (o->>'urgent_fee')::int = 500 and (o->>'promo_discount')::int = 0
    and (o->>'total_amount')::int = 30000 + 500, 'Livraison offerte + urgence : 1 500 offerts, supplément 500 dû, total 30 500');
  perform tests.check(tests.total_ok((o->>'id')::uuid), 'Livraison offerte + urgence : total = formule du contrat');

  -- 3. Livraison offerte AUTOMATIQUE plafonnée + urgence
  perform tests.new_promo(null, 'free_delivery', 0, '{"delivery_cap": 1000}');
  o := tests.buy(c1, jsonb_build_array(tests.it('1')), tests.urgent());
  perform tests.check((o->>'delivery_discount')::int = 1000 and (o->>'urgent_fee')::int = 500 and (o->>'total_amount')::int = 10000 + 1500 - 1000 + 500
    and o->>'promo_code' is null, 'Automatique plafonnée + urgence : 1 000 offerts sur 1 500, supplément 500 dû');

  -- 4. Urgence refusée (créneau inconnu) avec un code : rien n'est compté
  v_uses := (tests.promo('URG10')->>'uses_count')::int;
  msg := tests.try_buy_msg(c1, jsonb_build_array(tests.it('1')), jsonb_build_object('promoCode', 'URG10') || tests.urgent(1, 'Minuit'));
  perform tests.check(msg = 'Ce créneau n''est pas proposé en livraison urgente.' and (tests.promo('URG10')->>'uses_count')::int = v_uses,
    'Urgence refusée avec un code : message de la livraison urgente, utilisation NON comptée (' || msg || ')');
  -- Urgence en retrait seul : refus inchangé
  msg := tests.try_buy_msg(c1, jsonb_build_array(tests.it('2')), jsonb_build_object('promoCode', 'URG10') || tests.urgent() || tests.pickup('2'));
  perform tests.check(msg = 'La livraison urgente n''est possible qu''avec une livraison à domicile.' and (tests.promo('URG10')->>'uses_count')::int = v_uses,
    'Urgence en retrait seul avec un code : refus inchangé, utilisation NON comptée');

  -- 5. Orange Money : le montant demandé contient la réduction ET le supplément
  update public.payment_settings set orange_money_enabled = true;
  o := tests.buy_code(c1, jsonb_build_array(tests.it('1')), 'URG10', tests.urgent(), 'orange_money');
  t := public.payments_create_transaction((o->>'id')::uuid, 'orange_money', c1);
  perform tests.check(t.amount = 10000 - 1000 + 1500 + 500 and t.amount = (o->>'total_amount')::int,
    'Orange Money + 10 % + urgence : montant demandé 11 000 (= total de la commande)');
  perform public.payments_record_verification(t.id, 'confirmed', t.amount, 'MPURG');
  perform tests.check(tests.sale((o->>'id')::uuid, '1') = '{"gross": 10000, "commission": 1000, "net": 9000}',
    'Orange Money + urgence : vente créée au paiement INTACTE (réduction payée par Ezial), commission inchangée');
end $$;
