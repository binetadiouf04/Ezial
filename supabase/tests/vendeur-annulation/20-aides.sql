-- Banc « Annulation par la boutique » : boutiques, produits et aides de scénario. Données FICTIVES uniquement.
-- Boutiques : b1 (vendeur d1), b2 (d2, Ezial Plus), b3 (d3, officielle). Clients c1, c2. Admin a1.
-- Produits : e1 (b1, 10 000), e2 (b2, 20 000), e3 (b3, 15 000), e4 (b1, promo 6 000) ; variantes f1..f5.

-- Un vendeur supplémentaire pour la boutique supprimée et un second client sont déjà créés par 00-complement.
insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000d4') on conflict do nothing;
insert into public.profiles (id, role) values ('00000000-0000-4000-8000-0000000000d4', 'seller') on conflict do nothing;
insert into public.shops (id, owner_id, name, latitude, longitude, status) values
  ('00000000-0000-4000-8000-0000000000b4', '00000000-0000-4000-8000-0000000000d4', 'Boutique supprimée', 14.73, -17.48, 'deleted') on conflict do nothing;

set check_function_bodies = off;
-- Remise à zéro (stock 10, aucune commande, Orange Money fermé)
create function tests.reset_a() returns void language plpgsql as $$
begin
  perform tests.reset_promo();
  update public.product_variants set stock = 10;
  update public.payment_settings set orange_money_enabled = false, collections_enabled = false;
  truncate public.payment_transactions cascade;
  perform set_config('request.jwt.claims', '', false);
end $$;
create function tests.os(p_order uuid, p_shop text) returns uuid language sql as
$$ select id from public.order_shops where order_id = p_order and shop_id = tests.uid('b' || p_shop) $$;
-- Commande NON PAYÉE (Wave, paiement non requis comme en production aujourd'hui) : 1 boutique (b1) ou 2 (b1 + b2)
create function tests.mk_unpaid(p_shops text default '1', p_extra jsonb default '{}') returns uuid language plpgsql as $$
declare v_items jsonb := case p_shops when '1' then jsonb_build_array(tests.it('1')) when '12' then jsonb_build_array(tests.it('1'), tests.it('2'))
                                     when '123' then jsonb_build_array(tests.it('1'), tests.it('2'), tests.it('3')) else jsonb_build_array(tests.it(p_shops)) end;
begin
  return (tests.buy(tests.uid('c1'), v_items, p_extra, 'wave')->>'id')::uuid;
end $$;
-- Commande PAYÉE par Orange Money (paiement requis puis confirmé, comme en production)
create function tests.mk_paid(p_shops text default '1', p_extra jsonb default '{}') returns uuid language plpgsql as $$
declare v_items jsonb := case p_shops when '1' then jsonb_build_array(tests.it('1')) when '12' then jsonb_build_array(tests.it('1'), tests.it('2'))
                                     when '123' then jsonb_build_array(tests.it('1'), tests.it('2'), tests.it('3')) else jsonb_build_array(tests.it(p_shops)) end;
  v_id uuid; t public.payment_transactions;
begin
  update public.payment_settings set orange_money_enabled = true;
  v_id := (tests.buy(tests.uid('c1'), v_items, p_extra, 'orange_money')->>'id')::uuid;
  t := public.payments_create_transaction(v_id, 'orange_money', tests.uid('c1'));
  perform public.payments_record_verification(t.id, 'confirmed', tests.total(v_id), 'MPREF-' || left(v_id::text, 6));
  update public.payment_settings set orange_money_enabled = false;
  return v_id;
end $$;
-- Le vendeur de la boutique fait avancer sa part (mise à jour directe, comme depuis le site)
create function tests.seller_move(p_shop text, p_order uuid, p_status text) returns void language plpgsql as $$
begin
  perform tests.as_user(tests.uid('d' || p_shop));
  update public.order_shops set status = p_status where order_id = p_order and shop_id = tests.uid('b' || p_shop);
  perform tests.as_system();
end $$;
-- Prête pour la collecte (confirmed -> preparing -> ready)
create function tests.ready(p_shop text, p_order uuid) returns void language plpgsql as $$
begin
  perform tests.seller_move(p_shop, p_order, 'preparing');
  perform tests.seller_move(p_shop, p_order, 'ready');
end $$;
-- Appel de la fonction par l'utilisateur ; renvoie « ok » + JSON, ou le message d'erreur
create function tests.try_cancel(p_user uuid, p_os uuid, p_reason text default 'out_of_stock', p_note text default null, p_role text default 'authenticated') returns text language plpgsql as $$
declare r jsonb;
begin
  perform tests.as_user(p_user, p_role);
  r := public.seller_cancel_order_shop(p_os, p_reason, p_note);
  perform tests.as_system();
  return 'ok ' || r::text;
exception when others then
  perform tests.as_system();
  return sqlerrm;
end $$;
-- Annulation par le propriétaire de la boutique p_shop ; renvoie le JSON
create function tests.cancel(p_shop text, p_order uuid, p_reason text default 'out_of_stock', p_note text default null) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform tests.as_user(tests.uid('d' || p_shop));
  r := public.seller_cancel_order_shop(tests.os(p_order, p_shop), p_reason, p_note);
  perform tests.as_system();
  return r;
end $$;
create function tests.stock_of(p_variant text) returns numeric language sql as $$ select stock from public.product_variants where id = tests.uid(p_variant) $$;
create function tests.notifs(p_order uuid, p_type text) returns integer language sql as
$$ select count(*)::integer from public.notifications where order_id = p_order and type = p_type $$;
create function tests.alerts(p_order uuid) returns integer language sql as
$$ select count(*)::integer from public.admin_notifications where order_id = p_order and type = 'refund_to_make' $$;
create function tests.sale_status(p_order uuid, p_shop text) returns text language sql as
$$ select status from public.seller_transactions where order_id = p_order and shop_id = tests.uid('b' || p_shop) and type = 'sale' $$;
create function tests.mission(p_order uuid) returns public.delivery_missions language sql as
$$ select * from public.delivery_missions where order_id = p_order order by created_at desc limit 1 $$;
create function tests.stops(p_order uuid) returns integer language sql as
$$ select count(*)::integer from public.delivery_stops s join public.delivery_missions m on m.id = s.mission_id where m.order_id = p_order $$;
-- Un livreur (profil « driver ») ; accepte la mission
insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000e9') on conflict do nothing;
insert into public.profiles (id, role) values ('00000000-0000-4000-8000-0000000000e9', 'driver') on conflict do nothing;
create function tests.accept(p_order uuid) returns void language plpgsql as $$
begin
  perform tests.as_user(tests.uid('e9'));
  perform public.accept_delivery_mission((select id from public.delivery_missions where order_id = p_order limit 1));
  perform tests.as_system();
end $$;
create function public.accept_delivery_mission(p_mission_id uuid) returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_role public.user_role;
  v_updated_id uuid;
begin
  select role into v_role from profiles where id = auth.uid();
  if v_role is distinct from 'driver' then
    raise exception 'Non autorisé.';
  end if;

  update delivery_missions
  set driver_id = auth.uid(), status = 'accepted', accepted_at = now()
  where id = p_mission_id and driver_id is null and status = 'available'
  returning id into v_updated_id;

  if v_updated_id is null then
    raise exception 'Cette mission n''est plus disponible.';
  end if;

  return jsonb_build_object('success', true, 'mission_id', v_updated_id);
end;
$function$;
create function tests.snap_all(p_order uuid) returns jsonb language sql as $$
  select jsonb_build_object('os', (select jsonb_agg(jsonb_build_object('s', status) order by shop_id) from public.order_shops where order_id = p_order),
    'o', (select jsonb_build_object('status', status, 'pay', payment_status, 'total', total_amount) from public.orders where id = p_order),
    'stock', (select jsonb_agg(stock order by id) from public.product_variants),
    'tx', (select coalesce(jsonb_agg(status order by shop_id), '[]') from public.seller_transactions where order_id = p_order),
    'missions', (select coalesce(jsonb_agg(status), '[]') from public.delivery_missions where order_id = p_order),
    'stops', tests.stops(p_order),
    'cancellations', (select count(*) from public.order_shop_cancellations where order_id = p_order),
    'notifs', (select count(*) from public.notifications where order_id = p_order),
    'alerts', tests.alerts(p_order))
$$;
-- Exécute une requête et renvoie « ok » ou le message d'erreur
create function tests.err(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlerrm;   -- le rôle d'origine est restauré par l'annulation de la sous-transaction
end $$;
-- Message de refus (ou « ok ») d'une annulation tentée par p_user
create function tests.cancel_msg(p_user uuid, p_os uuid, p_reason text default 'out_of_stock') returns text language plpgsql as $$
declare v text;
begin
  v := tests.try_cancel(p_user, p_os, p_reason);
  return case when v like 'ok %' then 'ok' else v end;
end $$;
