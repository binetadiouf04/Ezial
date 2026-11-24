-- Aides propres au banc « livraison urgente » (données FICTIVES).
-- Boutique Un accepte le retrait en boutique (pour les commandes « retrait seul » et mixtes).
update public.shops set pickup_enabled = true where id = '00000000-0000-4000-8000-0000000000b1';

-- Jour de Dakar (UTC+0) : aujourd'hui + n, au format attendu par le site.
create function tests.dakar_day(n integer default 0) returns text language sql as
$$ select to_char((now() at time zone 'Africa/Dakar')::date + n, 'YYYY-MM-DD') $$;

-- Commande passée par le client C1 avec un panier de base + des options ; renvoie la commande créée.
create function tests.order_with(p_two_shops boolean, p_extra jsonb) returns public.orders language plpgsql as $$
declare v_id uuid; o public.orders;
begin
  perform tests.as_user('00000000-0000-4000-8000-0000000000c1');
  select (public.create_order(tests.cart(p_two_shops) || jsonb_build_object('paymentMethod', 'wave') || p_extra)->'order'->>'id')::uuid into v_id;
  perform tests.as_system();
  select * into o from public.orders where id = v_id;
  return o;
end $$;

-- Même chose, mais renvoie le message de refus (ou 'accepté').
create function tests.refusal(p_two_shops boolean, p_extra jsonb) returns text language plpgsql as $$
begin
  perform tests.order_with(p_two_shops, p_extra);
  return 'accepté';
exception when others then
  perform tests.as_system();
  return sqlerrm;
end $$;

-- Options de livraison : retrait de la Boutique Un.
create function tests.pickup_b1() returns jsonb language sql as
$$ select jsonb_build_object('shopFulfillments', jsonb_build_object('00000000-0000-4000-8000-0000000000b1', jsonb_build_object('type', 'pickup'))) $$;

-- Demande d'urgence pour un jour (aujourd'hui + n) et un créneau.
create function tests.urgent(n integer, p_slot text) returns jsonb language sql as
$$ select jsonb_build_object('urgentDelivery', true, 'preferredDeliveryDate', tests.dakar_day(n), 'preferredDeliverySlot', p_slot) $$;
