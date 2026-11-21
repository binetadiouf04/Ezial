-- Aides de scénario propres aux tests Wave (ne modifient pas les aides Orange Money de 20-fixtures.sql).
create function tests.reset_wave() returns void language plpgsql as $$
begin
  perform tests.reset();
  if exists (select 1 from information_schema.columns where table_name = 'payment_settings' and column_name = 'wave_enabled') then
    execute 'update public.payment_settings set wave_enabled = false';
  end if;
end $$;

-- Commande passée par un client donné (C1 par défaut dans tests.place)
create function tests.place_as(p_user uuid, p_method text, p_two_shops boolean default false, p_qty numeric default 1) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  perform tests.as_user(p_user);
  select (public.create_order(tests.cart(p_two_shops, p_qty) || jsonb_build_object('paymentMethod', p_method))->'order'->>'id')::uuid into v_id;
  perform tests.as_system();
  return v_id;
end $$;

-- Parts vendeurs d'une commande, par boutique : sert à comparer deux commandes de moyens de paiement différents
create function tests.shares(p_order uuid) returns jsonb language sql as $$
  select coalesce(jsonb_agg(jsonb_build_array(os.shop_id, t.gross_amount, t.commission_amount, t.net_amount, t.status) order by os.shop_id), '[]'::jsonb)
    from public.seller_transactions t join public.order_shops os on os.id = t.order_shop_id where t.order_id = p_order
$$;
