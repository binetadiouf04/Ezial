-- ÉTAT ACTUEL DE LA PRODUCTION (avant migrations) : sert de référence de non-régression.
select tests.reset();
select tests.put('wave', to_jsonb(tests.place('wave', true)));
select tests.put('wave_summary', tests.summary(tests.getid('wave')));
do $$
declare s jsonb := tests.get('wave_summary');
begin
  perform tests.check((s->>'seller_notifs')::int = 2, 'Wave : chaque vendeur est notifié à la création (2 boutiques)');
  perform tests.check((s->>'customer_confirmed')::int = 1, 'Wave : le client reçoit « Commande confirmée »');
  perform tests.check((s->>'admin_notifs')::int = 1, 'Wave : l''administrateur est notifié');
  perform tests.check((s->>'events_order_confirmed')::int = 1 and (s->>'events_seller_created')::int = 2, 'Wave : événements émis à la création');
  perform tests.check((s->>'whatsapp')::int = 1, 'Wave : WhatsApp en file à la création');
  perform tests.check((s->>'sales')::int = 2, 'Wave : une part vendeur par boutique');
  perform tests.check((s->>'sales_gross')::int = 30000 and (s->>'sales_commission')::int = 2600 and (s->>'sales_net')::int = 27400,
    'Wave : commissions 10 % (Free) + 8 % (Ezial Plus) = 1 000 + 1 600 = 2 600');
  perform tests.check(tests.stock() = 18, 'Wave : stock décrémenté (20 -> 18)');
end $$;
