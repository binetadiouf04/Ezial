-- Aides qui dépendent de la table créée par la migration (chargées juste après).
set check_function_bodies = off;
create or replace function tests.cancellation(p_order uuid, p_shop text) returns public.order_shop_cancellations language sql as
$$ select c.* from public.order_shop_cancellations c where c.order_id = p_order and c.shop_id = tests.uid('b' || p_shop) $$;
