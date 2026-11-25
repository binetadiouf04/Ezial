-- ÉTAT DE PRODUCTION (avant migration) : le banc reproduit bien ce qui est en ligne.
do $$
declare r record;
begin
  for r in select * from (values
      ('notify_admin_new_subscription_payment()', '725faad4748f92a6adf6073f287e5945'),
      ('process_subscription_expirations()', '917c069cc4e1c31fcedbe40425755928'),
      ('admin_mark_refunded(uuid,text,text,text)', 'd40b118f734b8977633181f5b8cd5dcb'),
      ('confirm_subscription_payment(uuid)', '61eb43dc4c6b6ba6efd0b821f2ea3595')) t(sig, h) loop
    perform tests.check(md5(replace(pg_get_functiondef(('public.' || r.sig)::regprocedure), chr(13), '')) = r.h, 'Production : empreinte md5 de ' || r.sig || ' identique à la production du 25 nov. 2026');
  end loop;
  perform tests.check(to_regclass('public.subscription_payment_attempts') is null, 'Production : pas encore de table des tentatives');
  perform tests.check(exists (select 1 from pg_policy where polname = 'subscription_payments_insert_own'), 'Production : le vendeur peut encore déclarer un paiement (avant migration)');
  perform tests.check(pg_get_constraintdef((select oid from pg_constraint where conname = 'order_shop_cancellations_refund_method_check')) like '%especes%', 'Production : « espèces » encore accepté pour les remboursements (avant migration)');
end $$;
