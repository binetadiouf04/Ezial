-- APRÈS la migration : commandes normales inchangées, urgence = +500 exactement, refus, montant payé.
select tests.reset_wave();
update public.product_variants set stock = 1000;   -- assez de stock pour tous les scénarios de ce fichier

-- 1. Livraison urgente ÉTEINTE (valeur par défaut) : toutes les commandes normales sont identiques à avant.
do $$
declare r record; o public.orders;
begin
  perform tests.check(not (select enabled from public.urgent_delivery_settings), 'Défaut : la livraison urgente est éteinte après la migration');
  for r in select * from tests.ref where scenario <> 'F_drapeau_urgent' order by scenario loop
    o := tests.scenario(r.scenario);
    perform tests.check(o.total_amount = r.total and o.delivery_fee = r.delivery and o.products_subtotal = r.subtotal and o.discount_amount = r.discount
      and o.gift_wrap_fee = r.gift_wrap and tests.shop_shares(o.id) = r.shares and not o.is_urgent and o.urgent_fee = 0,
      format('Commande normale « %s » : total %s, frais, parts vendeurs et commissions identiques à avant', r.scenario, r.total));
  end loop;
end $$;

do $$ begin
  perform tests.check(tests.refusal(true, tests.urgent(1, '18h–20h')) = 'La livraison urgente n''est pas disponible pour le moment.',
    'Réglage désactivé : la commande urgente est refusée (et rien n''est créé)');
  perform tests.check(not exists (select 1 from public.orders where is_urgent), 'Réglage désactivé : aucune commande urgente enregistrée');
end $$;

-- Ouverture par un administrateur (créneaux par défaut, délai minimal 60 min, aujourd'hui + demain)
do $$ begin
  perform tests.as_user('00000000-0000-4000-8000-0000000000a1');
  perform public.admin_update_urgent_delivery_settings(true, 60, 1, (select slots from public.urgent_delivery_settings));
  perform tests.as_system();
end $$;

-- 2. Commande urgente = exactement +500, parts vendeurs inchangées
do $$
declare ref_b tests.ref; ref_d tests.ref; o public.orders; m public.orders; stock_before numeric := tests.stock();
begin
  select * into ref_b from tests.ref where scenario = 'B_deux_creneau';
  select * into ref_d from tests.ref where scenario = 'D_mixte';
  o := tests.order_with(true, tests.urgent(1, '18h–20h'));
  perform tests.check(o.total_amount = ref_b.total + 500, format('Commande urgente : total = %s + 500 = %s', ref_b.total, o.total_amount));
  perform tests.check(o.is_urgent and o.urgent_fee = 500, 'Commande urgente : is_urgent = vrai, urgent_fee = 500');
  perform tests.check(o.delivery_fee = ref_b.delivery and o.products_subtotal = ref_b.subtotal and o.discount_amount = ref_b.discount,
    'Commande urgente : frais de livraison, produits et remises inchangés (le supplément est à part)');
  perform tests.check(tests.shop_shares(o.id) = ref_b.shares, 'Commande urgente : parts vendeurs, commissions et seller_transactions identiques à la commande normale');
  perform tests.check(o.preferred_delivery_date = ((now() at time zone 'Africa/Dakar')::date + 1) and o.preferred_delivery_slot = '18h–20h',
    'Commande urgente : jour et créneau enregistrés dans la préférence de livraison existante');
  perform tests.check(stock_before - tests.stock() = 2, 'Commande urgente : stock décompté normalement');
  m := tests.order_with(true, tests.pickup_b1() || tests.urgent(1, '18h–20h'));
  perform tests.check(m.total_amount = ref_d.total + 500 and m.is_urgent and tests.shop_shares(m.id) = ref_d.shares,
    'Commande mixte (une boutique en retrait, une livrée) : urgence acceptée, +500 exactement');
  perform tests.check((tests.order_with(false, '{"urgentDelivery": false}'::jsonb || (tests.urgent(1, '18h–20h') - 'urgentDelivery'))).total_amount =(select total from tests.ref where scenario = 'A_une_boutique'),
    'Sans le drapeau urgentDelivery : aucun supplément');
  perform tests.check((tests.order_with(false, jsonb_build_object('urgentDelivery', 'true', 'urgentFee', 0, 'preferredDeliveryDate', tests.dakar_day(1), 'preferredDeliverySlot', '18h–20h'))).urgent_fee = 0,
    'Drapeau non booléen (« true » en texte) : ignoré, aucun supplément');
  perform tests.check((tests.order_with(false, tests.urgent(1, '18h–20h') || '{"urgentFee": 1, "totalAmount": 1}')).urgent_fee = 500,
    'Montant envoyé par le navigateur ignoré : le supplément reste 500 (constante serveur)');
end $$;

-- 3. Refus
do $$
declare n_before bigint := (select count(*) from public.orders); s_before numeric := tests.stock();
begin
  perform tests.check(tests.refusal(false, tests.pickup_b1() || tests.urgent(1, '18h–20h')) = 'La livraison urgente n''est possible qu''avec une livraison à domicile.',
    'Retrait seul : urgence refusée');
  perform tests.check(tests.refusal(true, tests.urgent(-1, '18h–20h')) = 'Ce créneau est déjà passé. Choisissez un autre créneau.',
    'Créneau d''hier : refusé (déjà passé)');
  perform tests.check(tests.refusal(true, tests.urgent(2, '18h–20h')) = 'Ce jour n''est pas encore ouvert à la livraison urgente.',
    'Après-demain (au-delà du nombre de jours ouvert) : refusé');
  perform tests.check(tests.refusal(true, tests.urgent(1, '07h–08h')) = 'Ce créneau n''est pas proposé en livraison urgente.',
    'Créneau inconnu : refusé');
  perform tests.check(tests.refusal(true, jsonb_build_object('urgentDelivery', true)) = 'Choisissez un jour et un créneau pour la livraison urgente.',
    'Urgence sans jour ni créneau : refusée');
  perform tests.check(tests.refusal(true, jsonb_build_object('urgentDelivery', true, 'preferredDeliveryDate', 'pas-une-date', 'preferredDeliverySlot', '18h–20h')) like 'Choisissez un jour%'
    or tests.refusal(true, jsonb_build_object('urgentDelivery', true, 'preferredDeliveryDate', 'pas-une-date', 'preferredDeliverySlot', '18h–20h')) like '%invalid input syntax%',
    'Date illisible : refusée');
  perform tests.check((select count(*) from public.orders) = n_before and tests.stock() = s_before, 'Refus : aucune commande créée, stock intact');
end $$;

-- Heure limite et délai minimal (heure simulée via p_now, même règle que create_order)
do $$
declare d date := (now() at time zone 'Africa/Dakar')::date + 1;
begin
  perform tests.check(ezial_private.urgent_delivery_refusal(d, '18h–20h', (d + time '17:01') at time zone 'Africa/Dakar') = 'L''heure limite de ce créneau est passée. Choisissez un autre créneau.',
    'Heure limite : 17h01 pour le créneau 18h–20h (limite 17h00) -> refusé');
  perform tests.check(ezial_private.urgent_delivery_refusal(d, '18h–20h', (d + time '16:59') at time zone 'Africa/Dakar') is null,
    'Heure limite : 16h59 pour le créneau 18h–20h -> accepté (61 min avant, délai 60 min)');
  update public.urgent_delivery_settings set min_lead_minutes = 120;
  perform tests.check(ezial_private.urgent_delivery_refusal(d, '18h–20h', (d + time '16:30') at time zone 'Africa/Dakar') = 'Ce créneau est trop proche pour être garanti. Choisissez un créneau plus tard.',
    'Délai minimal 120 min : 16h30 pour 18h00 -> trop proche, refusé');
  perform tests.check(ezial_private.urgent_delivery_refusal(d, '18h–20h', (d + time '15:59') at time zone 'Africa/Dakar') is null,
    'Délai minimal 120 min : 15h59 pour 18h00 -> accepté');
  update public.urgent_delivery_settings set min_lead_minutes = 60;
end $$;

-- Créneau dont l'heure limite d'aujourd'hui est passée (limite 00h00) et créneau désactivé : refus réels par create_order
do $$ begin
perform tests.as_user('00000000-0000-4000-8000-0000000000a1');
perform public.admin_update_urgent_delivery_settings(true, 60, 2,
  '[{"label": "Nuit", "start": "00:01", "end": "00:30", "cutoff": "00:00", "enabled": true},
    {"label": "18h–20h", "start": "18:00", "end": "20:00", "cutoff": "17:00", "enabled": true},
    {"label": "15h–18h", "start": "15:00", "end": "18:00", "cutoff": "14:00", "enabled": false}]');
perform tests.as_system();
end $$;
do $$ begin
  perform tests.check(tests.refusal(true, tests.urgent(0, 'Nuit')) = 'L''heure limite de ce créneau est passée. Choisissez un autre créneau.',
    'Créneau d''aujourd''hui dont l''heure limite est passée : refusé par create_order');
  perform tests.check(tests.refusal(true, tests.urgent(1, '15h–18h')) = 'Ce créneau n''est pas proposé en livraison urgente.',
    'Créneau désactivé par l''admin : refusé');
  -- Après-demain (et non demain) : reste vrai quelle que soit l'heure du banc, même entre 23h et minuit.
  perform tests.check(tests.refusal(true, tests.urgent(2, 'Nuit')) = 'accepté', 'Même créneau après-demain (limite pas encore passée) : accepté');
end $$;

-- 4. Réglage public lu par le site
do $$
declare j jsonb;
begin
  perform tests.as_user(null, 'anon');
  j := public.get_urgent_delivery_options();
  perform tests.as_system();
  perform tests.check((j->>'enabled')::boolean and (j->>'fee')::int = 500, 'Réglage public : ouvert, supplément 500 (lisible sans compte)');
  perform tests.check(not (j->'days' @> jsonb_build_array(jsonb_build_object('date', tests.dakar_day(0), 'slots', jsonb_build_array(jsonb_build_object('label', 'Nuit'))))),
    'Réglage public : le créneau d''aujourd''hui à l''heure limite passée n''est pas proposé');
  perform tests.check(exists (select 1 from jsonb_array_elements(j->'days') d, jsonb_array_elements(d->'slots') s where d->>'date' = tests.dakar_day(1) and s->>'label' = '18h–20h'),
    'Réglage public : demain 18h–20h proposé');
  perform tests.check(not exists (select 1 from jsonb_array_elements(j->'days') d, jsonb_array_elements(d->'slots') s where s->>'label' = '15h–18h'),
    'Réglage public : un créneau désactivé n''est jamais proposé');
  update public.urgent_delivery_settings set enabled = false;
  perform tests.as_user(null, 'anon');
  j := public.get_urgent_delivery_options();
  perform tests.as_system();
  perform tests.check(not (j->>'enabled')::boolean and jsonb_array_length(j->'days') = 0, 'Réglage public : éteint -> enabled = faux, aucun créneau');
  update public.urgent_delivery_settings set enabled = true;
end $$;

-- 5. Montant payé = total_amount (supplément compris), sans rien changer au paiement
update public.payment_settings set wave_enabled = true;
do $$
declare o public.orders; t public.payment_transactions; r text; ref_b integer := (select total from tests.ref where scenario = 'B_deux_creneau');
begin
  o := tests.order_with(true, tests.urgent(1, '18h–20h'));
  perform tests.check(o.payment_required, 'Paiement : commande urgente Wave « à payer » comme toute commande Wave');
  t := public.payments_create_transaction(o.id, 'wave', '00000000-0000-4000-8000-0000000000c1');
  perform tests.check(t.amount = o.total_amount and t.amount = ref_b + 500, format('Paiement : montant demandé à Wave = total_amount = %s (supplément compris)', t.amount));
  perform public.payments_set_pending(t.id, 'wave-ref-urgent', null, now() + interval '25 minutes');
  r := public.payments_confirm(t.id, 'wave-ref-urgent', ref_b);
  perform tests.check((select payment_status from public.orders where id = o.id) <> 'paid', format('Paiement : un montant SANS le supplément (%s) ne confirme pas la commande (%s)', ref_b, r));
  r := public.payments_confirm(t.id, 'wave-ref-urgent', o.total_amount);
  perform tests.check((select payment_status from public.orders where id = o.id) = 'paid', format('Paiement : le montant exact (total_amount) confirme la commande (%s)', r));
  perform tests.check((select coalesce(sum(gross_amount), 0) from public.seller_transactions where order_id = o.id) = 30000,
    'Paiement : parts vendeurs après paiement = 30 000 (le supplément n''y entre pas)');
end $$;
update public.payment_settings set wave_enabled = false;
