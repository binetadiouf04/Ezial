-- AVANT la migration : create_order de production. On enregistre les montants de référence de six commandes types.
select tests.reset_wave();
create table if not exists tests.ref (scenario text primary key, total integer, delivery integer, subtotal integer, discount integer, gift_wrap integer, shares jsonb);
truncate tests.ref;

create or replace function tests.shop_shares(p_order uuid) returns jsonb language sql as $$
  select jsonb_build_object(
    'order_shops', (select coalesce(jsonb_agg(jsonb_build_array(shop_id, fulfillment_type, subtotal::int, commission_amount::int, net_amount::int) order by shop_id), '[]') from public.order_shops where order_id = p_order),
    'seller_transactions', (select coalesce(jsonb_agg(jsonb_build_array(shop_id, type, gross_amount, commission_amount, net_amount) order by shop_id), '[]') from public.seller_transactions where order_id = p_order))
$$;

create or replace function tests.scenario(p_name text) returns public.orders language plpgsql as $$
begin
  return case p_name
    when 'A_une_boutique'   then tests.order_with(false, '{}')
    when 'B_deux_creneau'   then tests.order_with(true, jsonb_build_object('preferredDeliveryDate', tests.dakar_day(1), 'preferredDeliverySlot', '18h–20h'))
    when 'C_retrait_seul'   then tests.order_with(false, tests.pickup_b1())
    when 'D_mixte'          then tests.order_with(true, tests.pickup_b1())
    when 'E_cadeau_emballe' then tests.order_with(true, '{"isGift": true, "giftRecipientName": "Fatou", "giftRecipientPhone": "+221770000000", "giftWrap": true}')
    when 'F_drapeau_urgent' then tests.order_with(true, tests.urgent(1, '18h–20h'))
  end;
end $$;

create or replace function tests.record_ref(p_name text) returns void language plpgsql as $$
declare o public.orders := tests.scenario(p_name);
begin
  insert into tests.ref values (p_name, o.total_amount, o.delivery_fee, o.products_subtotal, o.discount_amount, o.gift_wrap_fee, tests.shop_shares(o.id));
end $$;

select tests.record_ref(s) from unnest(array['A_une_boutique', 'B_deux_creneau', 'C_retrait_seul', 'D_mixte', 'E_cadeau_emballe', 'F_drapeau_urgent']) s;

do $$ begin
  perform tests.check((select count(*) from tests.ref) = 6, 'Avant : 6 commandes de référence créées avec le create_order de production');
  perform tests.check((select total from tests.ref where scenario = 'A_une_boutique') = 10000 + 1500, 'Avant : une boutique livrée = 10 000 + livraison 1 500 (frais simulés du banc)');
  perform tests.check((select total from tests.ref where scenario = 'C_retrait_seul') = 10000, 'Avant : retrait seul = 10 000, sans frais de livraison');
  perform tests.check((select total from tests.ref where scenario = 'E_cadeau_emballe') = 30000 + 1500 + 2000, 'Avant : cadeau emballé = 30 000 + 1 500 + 2 000');
  perform tests.check((select total from tests.ref where scenario = 'F_drapeau_urgent') = (select total from tests.ref where scenario = 'B_deux_creneau'),
    'Avant : le drapeau urgentDelivery est ignoré par la production (aucun supplément tant que la migration n''est pas exécutée)');
end $$;
