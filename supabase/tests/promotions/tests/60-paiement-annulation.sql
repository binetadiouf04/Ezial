-- ORANGE MONEY (commande à payer -> paiement -> vente diminuée de la compensation), IMPAYÉ, ANNULATIONS
-- (utilisation, budget et compensations rendus une seule fois), compensation déjà payée, part d'une boutique annulée.
select tests.reset_promo();
update public.payment_settings set orange_money_enabled = true;
select tests.new_promo('OM10', 'percent', 10, '{"budget_max": 100000}');
do $$
declare o jsonb; oid uuid; t public.payment_transactions;
begin
  o := tests.buy_code(tests.uid('c1'), jsonb_build_array(tests.it('1'), tests.it('2')), 'OM10', '{}', 'orange_money');
  oid := (o->>'id')::uuid;
  perform tests.check((o->>'payment_required')::boolean and (o->>'total_amount')::int = 30000 - 3000 + 1500, 'Orange Money : commande à payer, total 28 500 (réduction 3 000)');
  perform tests.check((select count(*) from public.seller_transactions where order_id = oid) = 0, 'Orange Money : aucune vente avant le paiement');
  perform tests.check(tests.comp(oid, '1') = 1000 and tests.comp(oid, '2') = 2000, 'Orange Money : compensations créées dès la commande (code compté)');
  t := public.payments_create_transaction(oid, 'orange_money', tests.uid('c1'));
  perform tests.check(t.amount = 28500, 'Orange Money : montant demandé = total après réduction');
  perform public.payments_record_verification(t.id, 'confirmed', 28500, 'MP-PROMO');
  perform tests.check(tests.sale(oid, '1') = '{"gross": 9000, "commission": 1000, "net": 8000}' and tests.sale(oid, '2') = '{"gross": 18000, "commission": 1600, "net": 16400}',
    'Orange Money : ventes créées au paiement, diminuées de la compensation, commissions inchangées');
  perform tests.check((select count(*) from public.seller_transactions where order_id = oid) = 2, 'Orange Money : une vente par boutique, sans doublon');
  perform tests.put('om_paid', to_jsonb(oid));
  -- Commande à payer qui restera impayée
  o := tests.buy_code(tests.uid('c2'), jsonb_build_array(tests.it('1')), 'OM10', '{}', 'orange_money');
  perform tests.put('om_unpaid', to_jsonb((o->>'id')::uuid));
  perform tests.check((tests.promo('OM10')->>'uses_count')::int = 2 and (tests.promo('OM10')->>'budget_used')::int = 4000, 'Impayé : avant expiration, 2 utilisations, budget 4 000');
  update public.orders set payment_deadline = now() - interval '1 hour', payment_grace_until = now() - interval '5 minutes' where id = (o->>'id')::uuid;
end $$;
select ezial_private.orders_finalize_unpaid();
select ezial_private.orders_finalize_unpaid();
update public.orders set status = 'cancelled' where id = tests.getid('om_unpaid');
do $$
declare oid uuid := tests.getid('om_unpaid');
begin
  perform tests.check((select status from public.orders where id = oid) = 'cancelled', 'Impayé : commande annulée automatiquement');
  perform tests.check((select status from public.promotion_redemptions where order_id = oid) = 'cancelled'
    and (select cancelled_at from public.promotion_redemptions where order_id = oid) is not null, 'Impayé : utilisation annulée');
  perform tests.check((tests.promo('OM10')->>'uses_count')::int = 1 and (tests.promo('OM10')->>'budget_used')::int = 3000,
    'Impayé : utilisation et budget rendus UNE seule fois (2 passages + annulation répétée)');
  perform tests.check((select status from public.promotion_compensations where order_id = oid) = 'cancelled', 'Impayé : compensation annulée');
  perform tests.check((select count(*) from public.finance_audit_log where action = 'promotion_released' and (details->>'order_id')::uuid = oid) = 1, 'Impayé : une seule restitution journalisée');
end $$;

-- Annulation d'une commande payée par Wave ; compensation déjà PAYÉE à une boutique
select tests.reset_promo();
select tests.new_promo('W10', 'percent', 10);
do $$
declare o jsonb;
begin
  o := tests.buy_code(tests.uid('c1'), jsonb_build_array(tests.it('1'), tests.it('2')), 'W10');
  perform tests.put('w', to_jsonb((o->>'id')::uuid));
  update public.promotion_compensations set status = 'paid', paid_at = now(), paid_method = 'wave', paid_reference = 'T-1'
   where order_id = (o->>'id')::uuid and shop_id = tests.uid('b1');
end $$;
update public.orders set status = 'cancelled' where id = tests.getid('w');
update public.orders set status = 'cancelled', updated_at = now() where id = tests.getid('w');
do $$
declare oid uuid := tests.getid('w');
begin
  perform tests.check((tests.promo('W10')->>'uses_count')::int = 0 and (tests.promo('W10')->>'budget_used')::int = 0, 'Annulation : utilisation et budget rendus (jamais sous 0)');
  perform tests.check((select status from public.promotion_compensations where order_id = oid and shop_id = tests.uid('b2')) = 'cancelled', 'Annulation : compensation « à reverser » annulée');
  perform tests.check((select status from public.promotion_compensations where order_id = oid and shop_id = tests.uid('b1')) = 'paid'
    and (select note from public.promotion_compensations where order_id = oid and shop_id = tests.uid('b1')) like '%Commande annulée après le versement%',
    'Annulation : compensation déjà payée reste payée, signalée dans la note');
  perform tests.check((select count(*) from public.ezial_events where event_type = 'finance.anomaly' and dedupe_key like '%promo_compensation_paid_cancelled') = 1,
    'Annulation : une anomalie financière signalée pour la compensation payée');
  perform tests.check((select bool_and(status = 'cancelled') from public.seller_transactions where order_id = oid), 'Annulation : ventes vendeurs annulées (comportement existant)');
end $$;

-- Part d'une seule boutique annulée : sa compensation est annulée, le reste de la commande garde la campagne
select tests.reset_promo();
select tests.new_promo('PART', 'percent', 10);
select tests.put('part', to_jsonb((tests.buy_code(tests.uid('c1'), jsonb_build_array(tests.it('1'), tests.it('2')), 'PART')->>'id')::uuid));
update public.order_shops set status = 'cancelled' where order_id = tests.getid('part') and shop_id = tests.uid('b2');
do $$
declare oid uuid := tests.getid('part');
begin
  perform tests.check((select status from public.promotion_compensations where order_id = oid and shop_id = tests.uid('b2')) = 'cancelled'
    and (select status from public.promotion_compensations where order_id = oid and shop_id = tests.uid('b1')) = 'due'
    and (select status from public.promotion_redemptions where order_id = oid) = 'counted', 'Part annulée : compensation de la boutique annulée, le reste inchangé');
end $$;
