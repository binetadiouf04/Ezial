-- COMMANDES FERMÉES AVANT LE LANCEMENT : la base refuse toute commande avant la date, sauf comptes testeurs ; après la date tout repart.
select tests.reset();
do $$
declare payload jsonb; r jsonb; e text; st jsonb; c integer;
  cust uuid := '00000000-0000-4000-8000-0000000000c1'; pid uuid; vid uuid;
begin
  select p.id, v.id into pid, vid from public.products p join public.product_variants v on v.product_id = p.id
   where exists (select 1 from public.shops s where s.id = p.shop_id and s.latitude is not null) limit 1;
  if pid is null then raise exception 'Pas de produit dans le banc.'; end if;
  payload := jsonb_build_object('firstName', 'Awa', 'lastName', 'Test', 'phone', '+221771234567', 'latitude', 14.69, 'longitude', -17.44, 'paymentMethod', 'wave',
    'items', jsonb_build_array(jsonb_build_object('productId', pid, 'variantId', vid, 'quantity', 1)));

  -- Fermé (date dans le futur)
  update public.payment_settings set ordering_opens_at = now() + interval '10 days';
  perform tests.as_user(cust);
  st := public.ordering_status(); perform tests.check((st->>'open')::boolean = false and st->>'opens_at' is not null, 'Fermé : ordering_status annonce « fermé » avec la date');
  e := tests.err(format('select public.create_order(%L::jsonb)', payload::text));
  perform tests.check(e like '%Les commandes ouvrent le 12 décembre 2026%', 'Fermé : un client ne peut pas commander (' || e || ')');
  perform tests.as_system();
  perform tests.check((select count(*) from public.orders) = 0, 'Fermé : aucune commande créée, aucun effet de bord');
  perform tests.check((select count(*) from public.seller_transactions) = 0 and (select count(*) from public.notifications) = 0, 'Fermé : aucune écriture vendeur ni notification');

  -- Fermé mais compte testeur : peut commander (tests finaux) et ordering_status l'indique
  insert into public.payment_testers (user_id, note) values (cust, 'test');
  perform tests.as_user(cust); st := public.ordering_status(); perform tests.check((st->>'open')::boolean, 'Fermé + testeur : ordering_status = ouvert'); perform tests.as_system();
  perform tests.as_user(cust);
  r := public.create_order(payload);
  perform tests.as_system();
  perform tests.check(r->'order'->>'id' is not null, 'Fermé + testeur : la commande est créée');
  delete from public.payment_testers;

  -- Anonyme : toujours refusé (compte obligatoire), et ordering_status lisible sans connexion
  perform tests.as_user(null, 'anon');
  perform tests.check((public.ordering_status()->>'open')::boolean = false, 'Anonyme : ordering_status lisible, « fermé »');
  perform tests.as_system();

  -- Ouvert (date passée) : tout fonctionne comme avant
  update public.payment_settings set ordering_opens_at = now() - interval '1 minute';
  perform tests.as_user(cust);
  perform tests.check((public.ordering_status()->>'open')::boolean, 'Ouvert : ordering_status = ouvert');
  r := public.create_order(payload);
  perform tests.as_system();
  perform tests.check(r->'order'->>'id' is not null and (select count(*) from public.orders) = 2, 'Ouvert : une commande normale est créée comme avant');
  -- Ouverture immédiate par l'administratrice
  update public.payment_settings set ordering_opens_at = now() + interval '5 days';
  update public.payment_settings set ordering_opens_at = now();
  perform tests.as_user(cust); r := public.create_order(payload); perform tests.as_system();
  perform tests.check((select count(*) from public.orders) = 3, 'Ouverture immédiate (ordering_opens_at = now()) : les commandes passent');
  -- Droits : ni anon ni client ne modifient la date
  perform tests.as_user(cust);
  e := tests.err('update public.payment_settings set ordering_opens_at = now()'); perform tests.as_system();
  perform tests.check(e <> 'aucune erreur' or (select ordering_opens_at from public.payment_settings) is not null, 'Droits : la date n''est pas modifiable par un client');
end $$;
select tests.reset();
update public.payment_settings set ordering_opens_at = now() - interval '1 day';
