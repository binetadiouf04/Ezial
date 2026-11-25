-- RÉAPPLICATION après retour arrière : tout refonctionne (paiement, activation, rejeu, droits).
select tests.reset_abo();
select tests.put('re', to_jsonb(tests.mkshop()));
do $$
declare s uuid := tests.getid('re'); a uuid; r text; e text;
begin
  a := tests.attempt(s, 'annual');
  r := tests.verify(a, 'confirmed', 20000, 'MPRE'); perform tests.check(r = 'confirm:confirmed' and (tests.sub(s)).plan = 'pro' and tests.near((tests.sub(s)).pro_until, now() + interval '12 months'), 'Réapplication : paiement annuel activé');
  r := tests.verify(a, 'confirmed', 20000, 'MPRE'); perform tests.check(r = 'confirm:already_confirmed' and tests.n_payments(s) = 1, 'Réapplication : rejeu sans seconde activation');
  perform tests.as_user('00000000-0000-4000-8000-0000000000d1');
  e := tests.err(format('select public.subscription_payments_confirm(%L, ''X'', 20000)', a)); perform tests.check(e like '%permission denied%', 'Réapplication : le vendeur ne peut toujours pas appeler l''activation');
  e := tests.err(format('insert into public.subscription_payments (shop_id, payment_method, status) values (%L, ''orange_money'', ''pending_review'')', s)); perform tests.check(e like '%row-level security%', 'Réapplication : plus de déclaration de paiement hors du site');
  perform tests.as_system();
end $$;
