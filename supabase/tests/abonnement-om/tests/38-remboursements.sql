-- REMBOURSEMENTS : « espèces » retiré (règle permanente : jamais de paiement ni de remboursement en espèces).
select tests.reset_abo();
do $$
declare adm uuid := '00000000-0000-4000-8000-0000000000a1'; id1 uuid; id2 uuid; e text; j jsonb;
begin
  insert into public.order_shop_cancellations (refund_status, part_amount) values ('to_refund', 5000) returning id into id1;
  insert into public.order_shop_cancellations (refund_status, part_amount) values ('to_refund', 7000) returning id into id2;
  perform tests.as_user(adm);
  e := tests.err(format('select public.admin_mark_refunded(%L, ''especes'')', id1)); perform tests.check(e like '%Choisissez le moyen%', 'Remboursement « espèces » : refusé par la fonction (' || e || ')');
  perform tests.check((select refund_status from public.order_shop_cancellations where id = id1) = 'to_refund', 'Remboursement « espèces » refusé : la ligne reste « à rembourser »');
  e := tests.err(format('select public.admin_mark_refunded(%L, ''cash'')', id1)); perform tests.check(e like '%Choisissez le moyen%', 'Moyen inconnu : refusé');
  e := tests.err('select public.admin_mark_refunded(null, ''orange_money'')'); perform tests.check(e like '%introuvable%', 'Remboursement inconnu : refusé');
  j := public.admin_mark_refunded(id1, 'orange_money', 'REF-RB-1', 'ok'); perform tests.check((j->>'success') = 'true' and (select refund_method from public.order_shop_cancellations where id = id1) = 'orange_money', 'Remboursement Orange Money : enregistré');
  j := public.admin_mark_refunded(id2, 'wave'); perform tests.check((j->>'success') = 'true', 'Remboursement Wave : enregistré');
  j := public.admin_mark_refunded(id1, 'wave'); perform tests.check((j->>'already') = 'true' and (select refund_method from public.order_shop_cancellations where id = id1) = 'orange_money', 'Remboursement déjà fait : réponse idempotente, moyen conservé');
  perform tests.as_system();
  e := tests.err(format('update public.order_shop_cancellations set refund_status = ''refunded'', refunded_at = now(), refund_method = ''especes'' where id = %L', id1)); perform tests.check(e like '%check constraint%', 'Base : « espèces » impossible même en écrivant directement');
  perform tests.check(pg_get_constraintdef((select oid from pg_constraint where conname = 'order_shop_cancellations_refund_method_check')) not like '%especes%', 'Contrainte : plus d''« espèces »');
  perform tests.as_user('00000000-0000-4000-8000-0000000000d1');
  e := tests.err(format('select public.admin_mark_refunded(%L, ''virement'')', id2)); perform tests.check(e like '%réservé aux administrateurs%', 'Un vendeur ne peut pas enregistrer un remboursement');
  perform tests.as_system();
  delete from public.order_shop_cancellations;
end $$;
