-- CRÉATION D'UNE TENTATIVE : montant recalculé en base, boutique de l'appelant, interrupteur / testeurs, réutilisation.
select tests.reset_abo();
select tests.put('s1', to_jsonb(tests.mkshop()));
do $$
declare s uuid := tests.getid('s1'); d1 uuid := '00000000-0000-4000-8000-0000000000d1'; d2 uuid := '00000000-0000-4000-8000-0000000000d2';
  a public.subscription_payment_attempts; b public.subscription_payment_attempts; c public.subscription_payment_attempts; e text; o uuid := '00000000-0000-4000-8000-0000000000b2';
begin
  update public.payment_settings set orange_money_enabled = false;
  e := tests.err(format('select public.subscription_payments_create_attempt(%L, ''quarterly'', ''orange_money'', %L)', s, d1));
  perform tests.check(e like '%en cours d''activation%', 'Interrupteur éteint : paiement d''abonnement refusé (' || e || ')');
  perform tests.check((select count(*) from public.subscription_payment_attempts) = 0, 'Interrupteur éteint : rien n''est écrit');
  insert into public.payment_testers (user_id, note) values (d1, 'test');
  a := public.subscription_payments_create_attempt(s, 'quarterly', 'orange_money', d1);
  perform tests.check(a.id is not null, 'Compte testeur : le paiement est possible même interrupteur éteint');
  delete from public.payment_testers; delete from public.subscription_payment_attempts;
  update public.payment_settings set orange_money_enabled = true;

  a := public.subscription_payments_create_attempt(s, 'quarterly', 'orange_money', d1);
  perform tests.check(a.amount = 6000 and a.status = 'initiated' and a.provider = 'orange_money' and a.billing_period = 'quarterly' and a.currency = 'XOF' and a.shop_id = s and a.requested_by = d1,
    'Création : trimestriel = 6 000 FCFA (calculé en base), tentative « initiated »');
  b := public.subscription_payments_create_attempt(s, 'quarterly', 'orange_money', d1);
  perform tests.check(b.id = a.id, 'Création : la tentative ouverte est réutilisée (pas de doublon)');
  perform public.subscription_payments_set_pending(a.id, a.id::text, null, now() + interval '30 minutes');
  b := public.subscription_payments_create_attempt(s, 'quarterly', 'orange_money', d1);
  perform tests.check(b.id = a.id and b.status = 'pending', 'Création : un QR encore valable est réutilisé');
  c := public.subscription_payments_create_attempt(s, 'annual', 'orange_money', d1);
  perform tests.check(c.id <> a.id and c.amount = 20000 and c.billing_period = 'annual', 'Création : annuel = 20 000 FCFA, nouvelle tentative');
  perform tests.check((select status from public.subscription_payment_attempts where id = a.id) = 'superseded' and (select superseded_at from public.subscription_payment_attempts where id = a.id) is not null,
    'Historique : l''ancien QR est conservé « remplacé » (jamais supprimé), il reste surveillé');
  update public.subscription_payment_attempts set status = 'pending', expires_at = now() + interval '30 seconds' where id = c.id;
  b := public.subscription_payments_create_attempt(s, 'annual', 'orange_money', d1);
  perform tests.check(b.id <> c.id, 'Création : un QR qui expire dans moins d''une minute n''est pas réutilisé');

  e := tests.err(format('select public.subscription_payments_create_attempt(%L, ''quarterly'', ''orange_money'', %L)', s, d2));
  perform tests.check(e like '%Boutique introuvable%', 'Boutique d''un autre vendeur : refusée (' || e || ')');
  e := tests.err(format('select public.subscription_payments_create_attempt(%L, ''quarterly'', ''orange_money'', %L)', gen_random_uuid(), d1));
  perform tests.check(e like '%Boutique introuvable%', 'Boutique inconnue : refusée');
  e := tests.err(format('select public.subscription_payments_create_attempt(%L, ''mensuel'', ''orange_money'', %L)', s, d1));
  perform tests.check(e like '%Périodicité%', 'Périodicité inconnue : refusée (aucun montant n''est jamais lu de la requête)');
  e := tests.err(format('select public.subscription_payments_create_attempt(%L, ''quarterly'', ''especes'', %L)', s, d1));
  perform tests.check(e like '%Moyen de paiement inconnu%', 'Moyen « espèces » : refusé');
  e := tests.err(format('insert into public.subscription_payment_attempts (shop_id, provider, billing_period, amount, idempotency_key) values (%L, ''especes'', ''quarterly'', 6000, ''k1'')', s));
  perform tests.check(e like '%check constraint%', 'Table : un moyen « espèces » est impossible même en écrivant directement');
  e := tests.err(format('insert into public.subscription_payments (shop_id, payment_method, status) values (%L, ''especes'', ''confirmed'')', s));
  perform tests.check(e like '%check constraint%', 'Historique : un paiement d''abonnement « espèces » est impossible');
  update public.shops set is_official = true where id = o;
  e := tests.err(format('select public.subscription_payments_create_attempt(%L, ''quarterly'', ''orange_money'', %L)', o, d2));
  update public.shops set is_official = false where id = o;
  perform tests.check(e like '%boutique officielle%', 'Boutique officielle Ezial : rien à payer (' || e || ')');
  e := tests.err(format('select public.subscription_payments_create_attempt(%L, ''quarterly'', ''wave'', %L)', s, d1));
  perform tests.check(e like '%en cours d''activation%', 'Wave : même structure, mais interrupteur Wave éteint -> refusé');
end $$;
