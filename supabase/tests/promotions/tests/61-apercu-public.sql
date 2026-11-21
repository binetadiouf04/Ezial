-- APERÇU (promotions_preview), CAMPAGNES PUBLIQUES, ANCIEN CONTRÔLE validate_promo_code : formes JSON du contrat.
select tests.reset_promo();
do $$
declare r jsonb; v uuid; v_liv uuid; n integer; items jsonb := jsonb_build_array(tests.it('1'));
begin
  perform tests.new_promo('P10', 'percent', 10);
  v := tests.new_promo('ZONE', 'fixed', 500); perform tests.zone(v, 'Médina');
  v_liv := tests.new_promo(null, 'free_delivery', 0, '{"delivery_cap": 1000, "min_amount": 5000}');
  perform tests.target(v_liv, 'category', 'mode-femme'); perform tests.target(v_liv, 'subcategory', 'sacs/sacs-a-main');
  perform tests.zone(v_liv, 'Plateau'); perform tests.zone(v_liv, 'Médina');
  perform tests.as_user(tests.uid('c1'));
  -- Code valable
  r := public.promotions_preview(jsonb_build_object('items', items, 'shopFulfillments', '{}'::jsonb, 'neighborhood', 'Plateau', 'promoCode', 'p10', 'deliveryFeeEstimate', 2500));
  perform tests.check(r = jsonb_build_object('valid', true, 'message', null, 'applied', jsonb_build_object('promotionId', (tests.promo('P10')->>'id'), 'code', 'P10',
        'name', 'P10', 'kind', 'percent', 'productDiscount', 1000, 'deliveryDiscount', 0, 'deliveryFee', 2500, 'eligibleAmount', 10000, 'automatic', false)),
    'Aperçu : forme exacte du contrat avec un code (' || r::text || ')');
  -- Code refusé
  r := public.promotions_preview(jsonb_build_object('items', items, 'neighborhood', 'Plateau', 'promoCode', 'ZONE', 'deliveryFeeEstimate', 2500));
  perform tests.check(r = '{"valid": false, "message": "Ce code n''est pas valable dans votre quartier.", "applied": null}'::jsonb, 'Aperçu : code refusé -> valid false + message');
  r := public.promotions_preview(jsonb_build_object('items', items, 'neighborhood', 'Plateau', 'promoCode', 'NEXISTEPAS', 'deliveryFeeEstimate', 2500));
  perform tests.check(r->>'message' = 'Code promo invalide.' and r->'applied' = 'null'::jsonb, 'Aperçu : code inconnu');
  -- Sans code : meilleure campagne automatique ; frais bornés par le barème (800 à 4 000)
  r := public.promotions_preview(jsonb_build_object('items', items, 'neighborhood', 'plateau', 'deliveryFeeEstimate', 9000));
  perform tests.check(r->'valid' = 'true' and r->'applied'->>'automatic' = 'true' and r->'applied'->'code' = 'null'::jsonb
    and (r->'applied'->>'deliveryFee')::int = 4000 and (r->'applied'->>'deliveryDiscount')::int = 1000 and (r->'applied'->>'promotionId')::uuid = v_liv,
    'Aperçu : campagne automatique, frais estimés 9 000 bornés à 4 000, livraison offerte plafonnée à 1 000');
  r := public.promotions_preview(jsonb_build_object('items', items, 'neighborhood', 'Plateau', 'deliveryFeeEstimate', 100));
  perform tests.check((r->'applied'->>'deliveryFee')::int = 800 and (r->'applied'->>'deliveryDiscount')::int = 800, 'Aperçu : frais estimés 100 relevés au minimum 800');
  r := public.promotions_preview(jsonb_build_object('items', items, 'neighborhood', 'Yoff', 'deliveryFeeEstimate', 2000));
  perform tests.check(r = '{"valid": true, "message": null, "applied": null}'::jsonb, 'Aperçu : aucune campagne automatique applicable -> applied null, valid true');
  r := public.promotions_preview(jsonb_build_object('items', items, 'shopFulfillments', jsonb_build_object(tests.uid('b1'), jsonb_build_object('type', 'pickup')), 'neighborhood', 'Plateau', 'deliveryFeeEstimate', 2000));
  perform tests.check(r->'applied' = 'null'::jsonb, 'Aperçu : en retrait, pas de livraison offerte');
  -- Prix comme create_order (promotion produit, variante retrouvée par ses options) ; lignes invalides ignorées
  r := public.promotions_preview(jsonb_build_object('items', jsonb_build_array(jsonb_build_object('productId', tests.uid('e4'), 'variantId', null, 'quantity', 2, 'selectedOptions', '{}'::jsonb),
         jsonb_build_object('productId', 'pas-un-uuid', 'quantity', 1), jsonb_build_object('productId', tests.uid('e1'), 'quantity', 0)), 'neighborhood', 'Plateau', 'promoCode', 'P10', 'deliveryFeeEstimate', 1500));
  perform tests.check((r->'applied'->>'eligibleAmount')::int = 12000 and (r->'applied'->>'productDiscount')::int = 1200, 'Aperçu : prix promo produit (2 × 6 000), lignes invalides ignorées');
  -- L'aperçu n'enregistre rien
  perform tests.as_system();
  perform tests.check((select count(*) from public.promotion_redemptions) = 0 and (select sum(uses_count) from public.promotions) = 0, 'Aperçu : aucune utilisation comptée');
  -- Comparaison avec la commande réelle
  r := tests.buy_code(tests.uid('c1'), items, 'P10');
  perform tests.check((r->>'promo_discount')::int = 1000, 'Aperçu = commande pour la réduction produits');

  -- Campagnes publiques : automatiques seulement, cibles [{type, ref}], quartiers par nom
  perform tests.as_user(null, 'anon');
  select count(*) into n from public.public_active_promotions();
  perform tests.check(n = 1, 'Campagnes publiques : seule la campagne automatique est listée (jamais un code)');
  select to_jsonb(x) into r from public.public_active_promotions() x;
  perform tests.check(r->'targets' = '[{"ref": "mode-femme", "type": "category"}, {"ref": "sacs/sacs-a-main", "type": "subcategory"}]'::jsonb
    and r->'neighborhoods' = '["Plateau", "Médina"]'::jsonb and (r->>'min_amount')::int = 5000 and (r->>'delivery_cap')::int = 1000 and r->>'kind' = 'free_delivery'
    and (r->>'promotion_id')::uuid = v_liv and r ? 'ends_at' and r ? 'name', 'Campagnes publiques : forme {promotion_id, name, kind, min_amount, delivery_cap, ends_at, targets [{type, ref}], neighborhoods}');
  perform tests.as_system();
  update public.promotions set status = 'paused' where id = v_liv;
  perform tests.as_user(null, 'anon');
  perform tests.check((select count(*) from public.public_active_promotions()) = 0, 'Campagnes publiques : campagne suspendue retirée');
  perform tests.as_system();
  update public.promotions set status = 'active', max_uses_total = 1, uses_count = 1 where id = v_liv;
  perform tests.check((select count(*) from public.public_active_promotions()) = 0, 'Campagnes publiques : campagne épuisée retirée');

  -- Ancien contrôle des codes (anciennes versions du site)
  perform tests.new_promo('LIVCODE', 'free_delivery', 0);
  perform tests.as_user(tests.uid('c2'));
  perform tests.check(public.validate_promo_code('p10', 10000) = '{"valid": true, "discount_amount": 1000, "code": "P10", "kind": "percent"}'::jsonb, 'validate_promo_code : lit les campagnes (10 % de 10 000)');
  perform tests.check(public.validate_promo_code('EZI10', 10000) = '{"valid": false, "message": "Ce code est suspendu."}'::jsonb, 'validate_promo_code : EZI10 suspendu');
  perform tests.check(public.validate_promo_code('???', 10000)->>'message' = 'Code promo invalide.', 'validate_promo_code : code inconnu');
  perform tests.check((public.validate_promo_code('LIVCODE', 10000)->>'discount_amount')::int = 0, 'validate_promo_code : livraison offerte -> 0 sur le sous-total');
  perform tests.as_system();
end $$;
