-- État de départ du banc = production du 25 nov. 2026 pour toutes les fonctions que la migration modifie ou dont elle dépend
-- (empreinte md5 de pg_get_functiondef, fins de ligne CR retirées, relevée en lecture seule sur le projet de production).
do $$
declare r record; v_ok boolean;
begin
  for r in select * from (values
    ('ezial_private.audit(text,text,text,uuid,jsonb)', '34cee1a0e2ff3a0231b2de0517cfe5f0'),
    ('ezial_private.emit_event(text,uuid,text,jsonb)', '99eea8d8bf132ec04325cf22d9f6dba0'),
    ('ezial_private.guard_delivery_confirmation()', 'c08760ea3117230daa36fd99f1c05c9a'),
    ('ezial_private.guard_order_shop_status()', 'e03ab3821815f9279fe46138f32684e3'),
    ('ezial_private.lock_delivery_stops_columns()', '1ced050e3628c35666d63c7bfdc161fa'),
    ('ezial_private.log_security_event(text,text,jsonb,uuid)', 'd9d20e2d60120172dc2053b5f2ce44c2'),
    ('ezial_private.order_shop_delivered(uuid)', '90730e91a6d3d8e0a1d6a963775dc441'),
    ('ezial_private.orders_finalize_unpaid()', '11eebc87ef5cd368df6568cd4646d3da'),
    ('ezial_private.promotion_release_order(uuid)', '9e492440810b7694d5681526ef7b1b54'),
    ('ezial_private.refresh_order_eligibility(uuid)', '3e86cd9fbc60652c75b0301fb325bef7'),
    ('ezial_private.refresh_order_shop_eligibility(uuid)', '76bb563dcd13c611fb18423847226b45'),
    ('ezial_private.restock_order(uuid)', 'ecc67ee8590cfc690af6fd2f7f01ea5d'),
    ('ezial_private.trg_block_unpaid_mission()', '4b94d26ee3fa2f0832f7c5af1edc4206'),
    ('ezial_private.trg_block_unpaid_progress()', '3db5b0cce1d165c8f6b438c6cc0e9ce6'),
    ('ezial_private.trg_finance_refresh()', '2c32d365322929e7d73b79b3564720a5'),
    ('ezial_private.trg_orders_on_paid()', '82709e6446cebbf964652298b855098d'),
    ('ezial_private.trg_promotions_order_cancelled()', '4c80b34f0dee7ddc0667f888e7c3df5d'),
    ('ezial_private.trg_seller_sale_starts_pending()', 'f1d7751c7877c9c35ed1cf43346fc1fb'),
    ('ezial_private.trg_skip_unpaid_sale()', '4cc6f19fa604d4557fbbf908f3d69f22'),
    ('public.create_delivery_mission_when_ready()', '0c24a1e9101db81a7d90001cfab339d8'),
    ('public.create_order(jsonb)', '179004b9be2c2f03ce36d9f7b08a25a7'),
    ('public.lock_delivery_missions_identity_columns()', '654ce04cf4e5717e468eebf9ccb8d851'),
    ('public.lock_order_shops_identity_columns()', '70dabcaee4f5f2a509091890f5905b43'),
    ('public.notify_admins(text,text,text,uuid,uuid,uuid,uuid)', '4078a10f9625736bcf8d984e20b97e73'),
    ('public.notify_customer_mission_status()', '0820183db90e488394940a3fb293a034'),
    ('public.notify_customer_order_shop_status()', '414c8c049bb3114e9c724ac1c8c99285'),
    ('public.notify_driver_mission_assigned_or_cancelled()', '29e3b67a4d01ade837d650b4ca96907d'),
    ('public.notify_seller_order_cancelled()', '56d7452528065a265adaeb3d59b0f5ae'),
    ('public.notify_user(uuid,text,text,text,text,uuid,uuid,uuid,uuid)', '443c75a4578552e080d2aefef15210d9'),
    ('public.order_is_unpaid(uuid)', '50592dc0343634f8287131fdee28d08f'),
    ('public.trg_fn_notify_admin_order_ready_for_delivery()', 'a9a56a5a6c04c1bf807d4f8263fee4ab')
  ) t(sig, h) loop
    v_ok := md5(replace(pg_get_functiondef(to_regprocedure(r.sig)), chr(13), '')) = r.h;
    perform tests.check(v_ok, 'état de production : ' || r.sig || ' identique à la production');
  end loop;
  perform tests.check(to_regclass('public.order_shop_cancellations') is null and to_regprocedure('public.seller_cancel_order_shop(uuid,text,text)') is null,
    'état de production : ni table ni fonction d''annulation avant la migration');
end $$;
