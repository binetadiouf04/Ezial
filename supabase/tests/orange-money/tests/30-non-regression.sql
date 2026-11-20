-- APRÈS MIGRATIONS, interrupteur Orange Money ÉTEINT : Wave et commandes existantes strictement inchangés.
select tests.reset();
select tests.put('wave2', to_jsonb(tests.place('wave', true)));
do $$
declare before_s jsonb := (select v from tests.ctx where k = 'wave_summary_ref'); s jsonb := tests.summary(tests.getid('wave2'));
begin
  perform tests.check(not (select payment_required from public.orders where id = tests.getid('wave2')), 'Wave : commande NON marquée « paiement obligatoire »');
  perform tests.check((s->>'seller_notifs')::int = 2 and (s->>'customer_confirmed')::int = 1 and (s->>'admin_notifs')::int = 1, 'Wave : notifications identiques à l''état de production');
  perform tests.check((s->>'events_order_confirmed')::int = 1 and (s->>'events_seller_created')::int = 2 and (s->>'whatsapp')::int = 1, 'Wave : événements et WhatsApp identiques');
  perform tests.check((s->>'sales_gross')::int = 30000 and (s->>'sales_commission')::int = 2600 and (s->>'sales_net')::int = 27400, 'Wave : commissions et parts vendeurs identiques (10 % / 8 %)');
  perform tests.check(tests.stock() = 18, 'Wave : stock décrémenté comme avant');
end $$;
do $$
declare n integer; v jsonb;
begin
  perform tests.as_user('00000000-0000-4000-8000-0000000000d1');
  select count(*) into n from public.orders; perform tests.check(n = 1, 'Wave : le vendeur voit sa commande');
  select count(*) into n from public.order_items; perform tests.check(n = 1, 'Wave : le vendeur voit ses articles');
  v := public.seller_finance_summary(); perform tests.check((v->>'pending')::int = 9000, 'Wave : solde vendeur « en attente » inchangé (9 000)');
  update public.order_shops set status = 'ready' where shop_id = '00000000-0000-4000-8000-0000000000b1';
  get diagnostics n = row_count; perform tests.check(n = 1, 'Wave : le vendeur peut passer sa commande à « prête »');
  perform tests.as_system();
end $$;
-- Maintenance : Wave expire toujours sur l'horloge locale
do $$
declare w uuid;
begin
  select tests.getid('wave2') into w;
  insert into public.payment_transactions (order_id, provider, amount, idempotency_key, status, created_at) values (w, 'wave', 100, 'k-wave-old', 'initiated', now() - interval '3 hours');
  perform public.payments_maintenance();
  perform tests.check((select status from public.payment_transactions where idempotency_key = 'k-wave-old') = 'expired', 'Wave : transaction expirée comme avant après 2 h');
end $$;
