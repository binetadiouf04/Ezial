-- Administration (liste, « Remboursé », compteur) et lecture par le vendeur / le client (RLS, colonnes).
select tests.reset_a();
do $$
declare o uuid; o2 uuid; o3 uuid; l jsonb; r jsonb; id1 uuid; n integer;
begin
  o := tests.mk_paid('12'); o2 := tests.mk_paid('2'); o3 := tests.mk_unpaid('1');
  perform tests.cancel('1', o); perform tests.cancel('2', o2); perform tests.cancel('1', o3);
  -- non-admin
  perform tests.as_user(tests.uid('d1'));
  perform tests.check(tests.err('select public.admin_refunds_to_make()') = 'Accès réservé aux administrateurs.' and tests.err('select * from public.admin_shop_cancellation_stats()') = 'Accès réservé aux administrateurs.', 'admin : vendeur refusé (liste, compteur)');
  perform tests.check(tests.err(format('select public.admin_mark_refunded(%L, ''wave'')', gen_random_uuid())) = 'Accès réservé aux administrateurs.', 'admin : vendeur refusé (marquer remboursé)');
  perform tests.as_system();
  perform tests.as_user(tests.uid('a1'));
  l := public.admin_refunds_to_make('to_refund');
  perform tests.check(jsonb_array_length(l) = 2, 'admin : 2 remboursements à effectuer (la commande non payée n''y est pas)');
  perform tests.check((select bool_and(e->>'customer_name' = 'Awa Test' and e->>'customer_phone' = '+221771234567' and e->>'payment_method' = 'orange_money' and e->>'order_number' is not null and e->>'shop_name' is not null and (e->>'amount')::int > 0)
    from jsonb_array_elements(l) e), 'admin : numéro de commande, boutique, montant, mode de paiement, nom et téléphone du client');
  perform tests.check((select count(*) from jsonb_array_elements(l) e where e->>'payment_reference' like 'MPREF-%') = 2, 'admin : référence du paiement d''origine fournie');
  id1 := (select (e->>'id')::uuid from jsonb_array_elements(l) e where (e->>'amount')::int = 21500);
  perform tests.check(tests.err('select public.admin_mark_refunded(' || quote_literal(id1) || ', ''chèque'')') = 'Choisissez le moyen utilisé pour le remboursement.', 'admin : moyen invalide refusé');
  r := public.admin_mark_refunded(id1, 'orange_money', ' OM-REF-42 ', 'Remboursé depuis Max It');
  perform tests.check((r->>'success')::boolean and not (r->>'already')::boolean, 'admin : « Marquer remboursé » (date, moyen, référence)');
  r := public.admin_mark_refunded(id1, 'wave', 'AUTRE');
  perform tests.check((r->>'already')::boolean, 'admin : second clic idempotent');
  perform tests.as_system();
  perform tests.check((select refund_status || '/' || refund_method || '/' || refund_reference || '/' || (refunded_by = tests.uid('a1'))::text from public.order_shop_cancellations where id = id1) = 'refunded/orange_money/OM-REF-42/true',
    'admin : le second clic ne change rien (moyen et référence d''origine conservés)');
  perform tests.check((select is_read from public.admin_notifications where type = 'refund_to_make' and order_id = (select order_id from public.order_shop_cancellations where id = id1)), 'admin : l''alerte correspondante est marquée lue');
  perform tests.check((select count(*) from public.finance_audit_log where action = 'refund_marked_done') = 1, 'admin : une seule trace d''audit');
  perform tests.as_user(tests.uid('a1'));
  perform tests.check(jsonb_array_length(public.admin_refunds_to_make('to_refund')) = 1 and jsonb_array_length(public.admin_refunds_to_make('refunded')) = 1 and jsonb_array_length(public.admin_refunds_to_make()) = 2, 'admin : filtres à effectuer / effectués / tous');
  -- compteur par boutique : 30 jours et total (sans pénalité automatique)
  perform tests.as_system();
  update public.order_shop_cancellations set cancelled_at = now() - interval '45 days' where order_id = o3;
  perform tests.as_user(tests.uid('a1'));
  perform tests.check((select last_30_days from public.admin_shop_cancellation_stats() where shop_id = tests.uid('b1')) = 1 and (select total from public.admin_shop_cancellation_stats() where shop_id = tests.uid('b1')) = 2
    and (select last_30_days || '/' || total from public.admin_shop_cancellation_stats() where shop_id = tests.uid('b2')) = '1/1', 'compteur : b1 = 1 sur 30 jours / 2 au total ; b2 = 1 / 1');
  perform tests.check((select status from public.shops where id = tests.uid('b1')) = 'active', 'aucune pénalité automatique : la boutique reste active');
  perform tests.as_system();
  -- lecture : vendeur de la boutique, client de la commande ; pas les autres
  perform tests.as_user(tests.uid('d1'));
  select count(*) into n from public.order_shop_cancellations;
  perform tests.check(n = 2, 'RLS : le vendeur de b1 voit ses 2 annulations seulement');
  perform tests.check(tests.err('select refund_reference from public.order_shop_cancellations') like '%permission denied%', 'RLS : le vendeur ne lit pas le moyen / la référence de remboursement');
  perform tests.check(tests.err('insert into public.order_shop_cancellations (order_shop_id, order_id, shop_id, reason) select id, order_id, shop_id, ''other'' from public.order_shops limit 1') like '%permission denied%'
    and tests.err('update public.order_shop_cancellations set refund_status = ''refunded''') like '%permission denied%' and tests.err('delete from public.order_shop_cancellations') like '%permission denied%', 'RLS : aucune écriture directe (insert, update, delete)');
  perform tests.as_system();
  perform tests.as_user(tests.uid('c1'));
  select count(*) into n from public.order_shop_cancellations;
  perform tests.check(n = 3, 'RLS : le client voit les annulations de ses commandes (3 parts)');
  perform tests.as_system();
  perform tests.as_user(tests.uid('c2'));
  select count(*) into n from public.order_shop_cancellations;
  perform tests.check(n = 0, 'RLS : un autre client ne voit rien');
  perform tests.as_system();
  perform tests.as_user(tests.uid('d3'));
  select count(*) into n from public.order_shop_cancellations;
  perform tests.check(n = 0, 'RLS : le vendeur d''une autre boutique ne voit rien');
  perform tests.as_system(); perform tests.as_user(tests.uid('c1'), 'anon');
  perform tests.check(tests.err('select count(*) from public.order_shop_cancellations') like '%permission denied%', 'RLS : anon sans accès');
  perform tests.as_system();
end $$;
