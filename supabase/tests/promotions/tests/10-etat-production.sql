-- ÉTAT DE DÉPART = PRODUCTION : les fonctions utilisées par les tests sont le texte EXACT de production
-- (empreintes md5 relues en lecture seule le 21 nov. 2026, create_order et livraison urgente le 25 nov. 2026, sans les « \r »).
do $$
declare v record;
begin
  for v in select * from (values
    ('create_order(jsonb)', '10178f6554882cf5390eb6f0a7a13381'),
    ('ezial_private.order_urgent_fee(jsonb,boolean)', '5d24b3e2bdcfe9f31e6c94f68e167042'),
    ('ezial_private.urgent_delivery_refusal(date,text,timestamp with time zone)', 'a634263283ea9c74ffaae1d06ac4eb3d'),
    ('ezial_private.urgent_delivery_fee()', 'e433b56ee0e85294f6792eb697822de8'),
    ('ezial_private.trg_orders_on_paid()', '0b3d5a31187d24b38dc0e1f88d809e10'),
    ('validate_promo_code(text,integer)', 'e201da3dc59f4e72e8b74073bcdf670d'),
    ('ezial_private.orders_finalize_unpaid()', '11eebc87ef5cd368df6568cd4646d3da'),
    ('ezial_private.restock_order(uuid)', 'ecc67ee8590cfc690af6fd2f7f01ea5d'),
    ('ezial_private.refresh_order_shop_eligibility(uuid)', '76bb563dcd13c611fb18423847226b45'),
    ('ezial_private.refresh_order_eligibility(uuid)', '3e86cd9fbc60652c75b0301fb325bef7'),
    ('ezial_private.trg_finance_refresh()', '2c32d365322929e7d73b79b3564720a5'),
    ('ezial_private.trg_seller_sale_starts_pending()', 'f1d7751c7877c9c35ed1cf43346fc1fb'),
    ('ezial_private.trg_skip_unpaid_sale()', '4cc6f19fa604d4557fbbf908f3d69f22'),
    ('ezial_private.emit_event(text,uuid,text,jsonb)', '99eea8d8bf132ec04325cf22d9f6dba0'),
    ('ezial_private.order_shop_delivered(uuid)', '90730e91a6d3d8e0a1d6a963775dc441'),
    ('order_is_unpaid(uuid)', '50592dc0343634f8287131fdee28d08f'),
    ('ezial_private.trg_orders_set_payment_required()', '444ca2f207d1a749e01e1e9dae8a3287'),
    ('ezial_private.audit(text,text,text,uuid,jsonb)', '34cee1a0e2ff3a0231b2de0517cfe5f0')) t(sig, h) loop
    perform tests.check(md5(replace(pg_get_functiondef(v.sig::regprocedure), chr(13), '')) = v.h, 'Production : ' || v.sig || ' identique au texte de production');
  end loop;
  perform tests.check(to_regclass('public.promotions') is null, 'Production : aucune table de campagnes avant migration');
end $$;
