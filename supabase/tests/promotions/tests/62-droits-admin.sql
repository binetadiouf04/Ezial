-- DROITS (anonyme, client, vendeur, administrateur, double authentification) et FONCTIONS D'ADMINISTRATION.
select tests.reset_promo();
select tests.new_promo('DROITS', 'percent', 10);
select tests.put('o', to_jsonb((tests.buy_code(tests.uid('c1'), jsonb_build_array(tests.it('1'), tests.it('2')), 'DROITS')->>'id')::uuid));
do $$
declare ok boolean; n integer; r jsonb; a uuid := tests.uid('a1');
begin
  -- Anonyme
  perform tests.as_user(null, 'anon');
  ok := false; begin perform count(*) from public.promotions; exception when insufficient_privilege then ok := true; end;
  perform tests.check(ok, 'Anonyme : ne peut pas lire les campagnes');
  ok := false; begin perform count(*) from public.promotion_compensations; exception when insufficient_privilege then ok := true; end;
  perform tests.check(ok, 'Anonyme : ne peut pas lire les compensations');
  ok := false; begin perform public.promotions_preview('{}'); exception when insufficient_privilege then ok := true; end;
  perform tests.check(ok, 'Anonyme : ne peut pas appeler l''aperçu (clients connectés)');
  ok := false; begin perform public.admin_promotions_list(); exception when insufficient_privilege then ok := true; end;
  perform tests.check(ok, 'Anonyme : ne peut pas appeler les fonctions admin');
  ok := false; begin perform count(*) from public.promotion_seller_shares; exception when insufficient_privilege then ok := true; end;
  perform tests.check(ok, 'Anonyme : ne peut pas lire les parts vendeurs');
  -- Client
  perform tests.as_user(tests.uid('c1'));
  select count(*) into n from public.promotions; perform tests.check(n = 0, 'Client : ne voit aucune campagne (même avec code)');
  select count(*) into n from public.promotion_redemptions; perform tests.check(n = 0, 'Client : ne voit aucune utilisation');
  select count(*) into n from public.promotion_compensations; perform tests.check(n = 0, 'Client : ne voit aucune compensation');
  ok := false; begin insert into public.promotions (name, code, kind, value, ends_at, status) values ('Pirate', 'PIRATE', 'fixed', 50000, now() + interval '1 day', 'active');
    exception when insufficient_privilege or check_violation then ok := true; end;
  perform tests.check(ok, 'Client : ne peut pas créer de campagne');
  update public.promotions set budget_used = 0, status = 'active'; get diagnostics n = row_count;
  perform tests.check(n = 0, 'Client : ne peut modifier aucune campagne');
  ok := false; begin insert into public.promotion_redemptions (promotion_id, order_id) values (gen_random_uuid(), gen_random_uuid()); exception when insufficient_privilege then ok := true; end;
  perform tests.check(ok, 'Client : ne peut pas écrire d''utilisation');
  select count(*) into n from public.promotion_seller_shares; perform tests.check(n = 0, 'Client : ne voit aucune part vendeur');
  ok := false; begin perform public.admin_promotions_list(); exception when insufficient_privilege then ok := true; end;
  perform tests.check(ok, 'Client : admin_promotions_list refusé');
  ok := false; begin perform public.admin_mark_compensations_paid(array[gen_random_uuid()], 'wave', null, null); exception when insufficient_privilege then ok := true; end;
  perform tests.check(ok, 'Client : admin_mark_compensations_paid refusé');
  ok := false; begin perform public.admin_promotion_save('{"name": "x"}'); exception when insufficient_privilege then ok := true; end;
  perform tests.check(ok, 'Client : admin_promotion_save refusé');
  ok := false; begin perform public.seller_promotion_compensations(tests.uid('b1')); exception when insufficient_privilege then ok := true; end;
  perform tests.check(ok, 'Client : ne lit pas les compensations d''une boutique');
  -- Vendeur
  perform tests.as_user(tests.uid('d1'));
  select count(*) into n from public.promotion_compensations; perform tests.check(n = 1, 'Vendeur : ne voit que la compensation de SA boutique (table)');
  select count(*) into n from public.promotion_compensations where shop_id <> tests.uid('b1'); perform tests.check(n = 0, 'Vendeur : aucune compensation d''une autre boutique');
  r := public.seller_promotion_compensations(tests.uid('b1'));
  perform tests.check(jsonb_array_length(r) = 1 and (r->0->>'amount')::int = 1000 and r->0->>'status' = 'due' and r->0 ? 'order_number' and r->0 ? 'paid_at'
    and r->0 ? 'paid_method' and r->0 ? 'created_at' and r->0 ? 'id' and (select count(*) from jsonb_object_keys(r->0)) = 7,
    'Vendeur : seller_promotion_compensations -> [{id, order_number, amount, status, paid_at, paid_method, created_at}]');
  ok := false; begin perform public.seller_promotion_compensations(tests.uid('b2')); exception when insufficient_privilege then ok := true; end;
  perform tests.check(ok, 'Vendeur : refusé pour la boutique d''un autre vendeur');
  select count(*) into n from public.promotions; perform tests.check(n = 0, 'Vendeur : ne voit aucune campagne');
  ok := false; begin perform public.admin_promotion_compensations(); exception when insufficient_privilege then ok := true; end;
  perform tests.check(ok, 'Vendeur : fonctions admin refusées');
  -- Administrateur, double authentification
  perform tests.as_system();
  insert into auth.mfa_factors (user_id, status) values (a, 'verified');
  perform tests.as_user_aal(a, 'aal1');
  ok := false; begin perform public.admin_promotions_list(); exception when insufficient_privilege then ok := sqlerrm = 'mfa_required'; end;
  perform tests.check(ok, 'Admin avec double authentification non validée (aal1) : refusé (mfa_required)');
  perform tests.as_user_aal(a, 'aal2');
  perform tests.check(jsonb_array_length(public.admin_promotions_list()) = 2, 'Admin validé (aal2) : accès accordé');
  perform tests.as_system();
  delete from auth.mfa_factors;
  perform tests.as_user_aal(a, 'aal1');
  perform tests.check(jsonb_array_length(public.admin_promotions_list()) = 2, 'Admin sans facteur : accès accordé (comme les autres fonctions admin)');
  select count(*) into n from public.promotions; perform tests.check(n = 2, 'Admin : lit les campagnes (table)');
  select count(*) into n from public.promotion_compensations; perform tests.check(n = 2, 'Admin : lit les compensations (table)');
  perform tests.as_system();
end $$;

-- Fonctions d'administration : formes JSON, validations, statistiques, paiement manuel
do $$
declare a uuid := tests.uid('a1'); r jsonb; p jsonb; v uuid; v2 uuid; ok boolean; msg text; n integer;
begin
  perform tests.as_user_aal(a, 'aal2');
  -- Liste + statistiques
  r := public.admin_promotions_list();
  select x into p from jsonb_array_elements(r) x where x->>'code' = 'DROITS';
  perform tests.check(p ? 'targets' and p->'neighborhoods' = '[]'::jsonb and p->'seller_shares' = '[]'::jsonb and p ? 'stats' and p ? 'max_uses_per_customer' and p ? 'budget_used' and p ? 'uses_count' and p ? 'created_by'
    and jsonb_typeof(p->'targets') = 'array' and jsonb_typeof(p->'neighborhoods') = 'array', 'Admin : liste = colonnes de promotions + targets + neighborhoods [] + seller_shares + stats');
  perform tests.check(p->'stats' = '{"orders": 1, "product_discount": 3000, "delivery_discount": 0, "ezial_cost": 3000, "seller_funded": 0, "budget_remaining": null, "sales": 30000, "commissions": 2600, "ezial_net": -400}'::jsonb,
    'Admin : statistiques (1 commande, 3 000 de réduction, CA 30 000, commissions 2 600, net Ezial -400) : ' || (p->'stats')::text);
  -- Création : brouillon ; cibles et quartiers enregistrés
  v := public.admin_promotion_save(jsonb_build_object('name', '  Fête de fin d''année ', 'code', 'noel-26', 'kind', 'percent', 'value', 15, 'max_discount', 5000,
         'min_amount', 10000, 'delivery_cap', 999, 'starts_at', now(), 'ends_at', now() + interval '30 days', 'audience', 'all', 'max_uses_total', 100,
         'max_uses_per_customer', 1, 'budget_max', 500000,
         'targets', jsonb_build_array(jsonb_build_object('target_type', 'subcategory', 'target_ref', 'mode-femme/robes'), jsonb_build_object('target_type', 'shop', 'target_ref', upper(tests.uid('b1')::text))),
         'neighborhood_ids', jsonb_build_array(gen_random_uuid()),
         'seller_shares', jsonb_build_array(jsonb_build_object('shop_id', tests.uid('b1'), 'share_type', 'percent', 'share_value', 25, 'agreed_note', ' Accord WhatsApp du 20/11 '),
                                            jsonb_build_object('shop_id', tests.uid('b2'), 'share_type', 'fixed', 'share_value', 500))));
  select x into p from jsonb_array_elements(public.admin_promotions_list()) x where (x->>'id')::uuid = v;
  perform tests.check(p->>'status' = 'draft' and p->>'code' = 'NOEL-26' and p->>'name' = 'Fête de fin d''année' and p->'delivery_cap' = 'null'::jsonb
    and (p->>'max_discount')::int = 5000 and p->'neighborhoods' = '[]'::jsonb
    and p->'seller_shares' = jsonb_build_array(jsonb_build_object('shop_id', tests.uid('b1'), 'share_type', 'percent', 'share_value', 25, 'agreed_note', 'Accord WhatsApp du 20/11'),
                                               jsonb_build_object('shop_id', tests.uid('b2'), 'share_type', 'fixed', 'share_value', 500, 'agreed_note', null))
    and p->'targets' @> jsonb_build_array(jsonb_build_object('target_type', 'shop', 'target_ref', tests.uid('b1')::text)) and jsonb_array_length(p->'targets') = 2
    and p->>'created_by' = a::text, 'Admin : création en brouillon, code en majuscules, cibles et parts vendeurs enregistrées (quartiers ignorés)');
  -- Modification : cibles remplacées ; livraison offerte -> value 0
  perform public.admin_promotion_save(jsonb_build_object('id', v, 'name', 'Livraison Noël', 'code', null, 'kind', 'free_delivery', 'value', 0, 'delivery_cap', 1500,
         'max_discount', 3000, 'min_amount', 0, 'starts_at', now(), 'ends_at', now() + interval '30 days', 'max_uses_per_customer', 2, 'targets', '[]'::jsonb, 'seller_shares', jsonb_build_array(jsonb_build_object('shop_id', tests.uid('b1'), 'share_type', 'fixed', 'share_value', 100))));
  select x into p from jsonb_array_elements(public.admin_promotions_list()) x where (x->>'id')::uuid = v;
  perform tests.check(p->>'kind' = 'free_delivery' and p->'code' = 'null'::jsonb and (p->>'value')::numeric = 0 and (p->>'delivery_cap')::int = 1500
    and p->'max_discount' = 'null'::jsonb and p->'targets' = '[]'::jsonb and p->'seller_shares' = '[]'::jsonb,
    'Admin : modification (automatique, livraison offerte) : cibles vidées, parts vendeurs ignorées (jamais sur la livraison)');
  -- Validations
  msg := null; begin perform public.admin_promotion_save('{"name": "", "kind": "fixed", "value": 100, "starts_at": "2026-12-01", "ends_at": "2026-12-31"}'); exception when others then msg := sqlstate || ' ' || sqlerrm; end;
  perform tests.check(msg like 'P0001 Donnez un nom%', 'Admin : nom obligatoire');
  msg := null; begin perform public.admin_promotion_save('{"name": "x", "code": "A B", "kind": "fixed", "value": 100, "starts_at": "2026-12-01", "ends_at": "2026-12-31"}'); exception when others then msg := sqlstate || ' ' || sqlerrm; end;
  perform tests.check(msg like 'P0001 Le code doit%', 'Admin : format du code');
  msg := null; begin perform public.admin_promotion_save('{"name": "x", "code": "DROITS", "kind": "fixed", "value": 100, "starts_at": "2026-12-01", "ends_at": "2026-12-31"}'); exception when others then msg := sqlstate; end;
  perform tests.check(msg = '23505', 'Admin : code déjà pris -> 23505');
  msg := null; begin perform public.admin_promotion_save('{"name": "x", "kind": "percent", "value": 95, "starts_at": "2026-12-01", "ends_at": "2026-12-31"}'); exception when others then msg := sqlstate || ' ' || sqlerrm; end;
  perform tests.check(msg like 'P0001 Le pourcentage%', 'Admin : pourcentage 1 à 90');
  msg := null; begin perform public.admin_promotion_save('{"name": "x", "kind": "fixed", "value": 0, "starts_at": "2026-12-01", "ends_at": "2026-12-31"}'); exception when others then msg := sqlstate || ' ' || sqlerrm; end;
  perform tests.check(msg like 'P0001 Le montant%', 'Admin : fixe > 0');
  msg := null; begin perform public.admin_promotion_save('{"name": "x", "kind": "bonus", "value": 1, "starts_at": "2026-12-01", "ends_at": "2026-12-31"}'); exception when others then msg := sqlstate || ' ' || sqlerrm; end;
  perform tests.check(msg like 'P0001 Type%', 'Admin : type de campagne');
  msg := null; begin perform public.admin_promotion_save('{"name": "x", "kind": "fixed", "value": 10, "starts_at": "2026-12-31", "ends_at": "2026-12-01"}'); exception when others then msg := sqlstate || ' ' || sqlerrm; end;
  perform tests.check(msg like 'P0001 La date de fin%', 'Admin : fin après début');
  msg := null; begin perform public.admin_promotion_save('{"name": "x", "kind": "fixed", "value": 10, "starts_at": "2026-12-01", "ends_at": "2026-12-31", "max_uses_total": 0}'); exception when others then msg := sqlstate || ' ' || sqlerrm; end;
  perform tests.check(msg like 'P0001 Les limites%', 'Admin : limites > 0');
  msg := null; begin perform public.admin_promotion_save('{"name": "x", "kind": "fixed", "value": 10, "starts_at": "2026-12-01", "ends_at": "2026-12-31", "targets": [{"target_type": "subcategory", "target_ref": "robes"}]}'); exception when others then msg := sqlstate || ' ' || sqlerrm; end;
  perform tests.check(msg like 'P0001 Sous-catégorie invalide%', 'Admin : sous-catégorie au format categorie/sous-categorie');
  msg := null; begin perform public.admin_promotion_save(jsonb_build_object('name', 'x', 'kind', 'fixed', 'value', 10, 'starts_at', '2026-12-01', 'ends_at', '2026-12-31', 'targets', jsonb_build_array(jsonb_build_object('target_type', 'product', 'target_ref', gen_random_uuid())))); exception when others then msg := sqlstate || ' ' || sqlerrm; end;
  perform tests.check(msg like 'P0001 Produit ciblé introuvable%', 'Admin : produit ciblé existant');
  msg := null; begin perform public.admin_promotion_save('{"name": "x", "kind": "fixed", "value": 10, "starts_at": "2026-12-01", "ends_at": "2026-12-31", "seller_shares": [{"shop_id": "00000000-0000-4000-8000-0000000000b1", "share_type": "percent", "share_value": 120}]}'); exception when others then msg := sqlstate || ' ' || sqlerrm; end;
  perform tests.check(msg like 'P0001 La part vendeur en pourcentage%', 'Admin : part vendeur en pourcentage 1 à 100');
  msg := null; begin perform public.admin_promotion_save('{"name": "x", "kind": "fixed", "value": 10, "starts_at": "2026-12-01", "ends_at": "2026-12-31", "seller_shares": [{"shop_id": "00000000-0000-4000-8000-0000000000b1", "share_type": "fixed", "share_value": 0}]}'); exception when others then msg := sqlstate || ' ' || sqlerrm; end;
  perform tests.check(msg like 'P0001 La part vendeur fixe%', 'Admin : part vendeur fixe > 0');
  msg := null; begin perform public.admin_promotion_save(jsonb_build_object('name', 'x', 'kind', 'fixed', 'value', 10, 'starts_at', '2026-12-01', 'ends_at', '2026-12-31', 'seller_shares', jsonb_build_array(jsonb_build_object('shop_id', gen_random_uuid(), 'share_type', 'fixed', 'share_value', 10)))); exception when others then msg := sqlstate || ' ' || sqlerrm; end;
  perform tests.check(msg like 'P0001 Boutique de la part vendeur introuvable%', 'Admin : boutique de la part vendeur existante');
  -- Statuts
  perform public.admin_promotion_set_status(v, 'active');
  perform tests.check((select status from public.promotions where id = v) = 'active', 'Admin : activation');
  perform public.admin_promotion_set_status(v, 'paused');
  perform public.admin_promotion_set_status(v, 'ended');
  msg := null; begin perform public.admin_promotion_set_status(v, 'active'); exception when others then msg := sqlerrm; end;
  perform tests.check(msg like 'Cette campagne est terminée%', 'Admin : « terminée » est définitif (réactivation refusée)');
  msg := null; begin perform public.admin_promotion_save(jsonb_build_object('id', v, 'name', 'x', 'kind', 'fixed', 'value', 10, 'starts_at', '2026-12-01', 'ends_at', '2026-12-31')); exception when others then msg := sqlerrm; end;
  perform tests.check(msg like 'Cette campagne est terminée%', 'Admin : campagne terminée non modifiable');
  perform tests.as_system();
  ok := false; begin update public.promotions set status = 'active' where id = v; exception when others then ok := true; end;
  perform tests.check(ok, 'Base : « terminée » définitif même par écriture directe');
  perform tests.as_user_aal(a, 'aal2');
  v2 := public.admin_promotion_save(jsonb_build_object('name', 'Passée', 'kind', 'fixed', 'value', 10, 'starts_at', now() - interval '2 days', 'ends_at', now() - interval '1 day'));
  msg := null; begin perform public.admin_promotion_set_status(v2, 'active'); exception when others then msg := sqlerrm; end;
  perform tests.check(msg like 'La date de fin est déjà passée%', 'Admin : activation refusée si la fin est passée');
  -- Compensations : liste (numéros de versement APPROUVÉS de la boutique), paiement manuel
  perform tests.as_system();
  insert into public.seller_payout_methods (shop_id, provider, phone, status, submitted_by, reviewed_at) values
    (tests.uid('b1'), 'orange_money', '+221770000001', 'superseded', tests.uid('d1'), now() - interval '9 days'),
    (tests.uid('b1'), 'orange_money', '+221770000002', 'approved', tests.uid('d1'), now() - interval '1 day'),
    (tests.uid('b1'), 'wave', '+221770000003', 'pending_review', tests.uid('d1'), null),
    (tests.uid('b2'), 'wave', '+221770000004', 'approved', tests.uid('d2'), now());
  perform tests.as_user_aal(a, 'aal2');
  r := public.admin_promotion_compensations('due');
  perform tests.check((select x->>'payout_orange_money' = '+221770000002' and x->'payout_wave' = 'null'::jsonb and (x->>'seller_share')::int = 0 and (x->>'gross_allocation')::int = 1000
      from jsonb_array_elements(r) x where (x->>'shop_id')::uuid = tests.uid('b1'))
    and (select x->'payout_orange_money' = 'null'::jsonb and x->>'payout_wave' = '+221770000004' from jsonb_array_elements(r) x where (x->>'shop_id')::uuid = tests.uid('b2')),
    'Admin : numéros de versement approuvés seulement (Orange Money / Wave), seller_share et gross_allocation');
  perform tests.check(jsonb_array_length(r) = 2 and r->0 ?& array['id', 'order_id', 'order_number', 'shop_id', 'shop_name', 'amount', 'status', 'paid_at', 'paid_method', 'paid_reference', 'note', 'created_at', 'promotion_name', 'seller_share', 'gross_allocation', 'payout_orange_money', 'payout_wave']
    and (select bool_and(x->>'promotion_name' = 'DROITS' and x->>'shop_name' like 'Boutique%' and x->>'order_number' like 'EZI-%') from jsonb_array_elements(r) x),
    'Admin : compensations à reverser, noms joints (boutique, commande, campagne)');
  perform tests.check(public.admin_mark_compensations_paid(array[(r->0->>'id')::uuid], 'wave', ' TX-42 ', null) = 1, 'Admin : paiement manuel enregistré');
  select x into p from jsonb_array_elements(public.admin_promotion_compensations('paid')) x;
  perform tests.check(p->>'paid_method' = 'wave' and p->>'paid_reference' = 'TX-42' and p->>'paid_at' is not null, 'Admin : moyen, référence et date du paiement');
  msg := null; begin perform public.admin_mark_compensations_paid(array[(r->0->>'id')::uuid, (r->1->>'id')::uuid], 'especes', null, 'note'); exception when others then msg := sqlerrm; end;
  perform tests.check(msg like 'Certaines compensations ne sont plus à reverser%' and jsonb_array_length(public.admin_promotion_compensations('due')) = 1,
    'Admin : paiement refusé en bloc si une compensation n''est plus « à reverser » (rien n''est enregistré)');
  msg := null; begin perform public.admin_mark_compensations_paid(array[(r->1->>'id')::uuid], 'cheque', null, null); exception when others then msg := sqlerrm; end;
  perform tests.check(msg = 'Moyen de paiement invalide.', 'Admin : moyen de paiement contrôlé');
  perform tests.as_system();
end $$;
