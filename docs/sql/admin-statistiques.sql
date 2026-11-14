-- Ezial — statistiques du tableau de bord administrateur.
-- Ajoute UNE fonction de lecture, réservée aux administrateurs, et un index
-- sur la date des commandes. Aucune donnée modifiée, aucune règle métier ni
-- aucun calcul existant touché : la fonction additionne les montants déjà
-- enregistrés par create_order() (total de la commande, sous-total par
-- boutique, commission par boutique).
--
-- Définitions (commandes et lignes annulées exclues) :
--   chiffre d'affaires = somme des totaux payés par les clients (orders.total_amount)
--   ventes produits    = somme des sous-totaux par boutique (order_shops.subtotal)
--   commissions Ezial  = somme des commissions par boutique (order_shops.commission_amount)
--   panier moyen       = chiffre d'affaires / nombre de commandes
-- Les dates sont comptées à l'heure de Dakar.
-- Rejouable. Retour arrière : docs/sql/admin-statistiques-retour-arriere.sql
begin;

create index if not exists orders_created_at_idx on public.orders (created_at);

create or replace function public.admin_sales_stats(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz constant text := 'Africa/Dakar';
  v_to timestamptz := least(coalesce(p_to, now()), now() + interval '1 day');
  v_from timestamptz;
  v_span interval;
  v_bucket text;
  v_result jsonb;
begin
  if not exists (select 1 from public.admins a where a.user_id = (select auth.uid())) then
    raise exception 'Action réservée aux administrateurs.' using errcode = '42501';
  end if;

  -- Sans date de début : depuis la première commande.
  v_from := coalesce(p_from, (select min(o.created_at) from public.orders o), v_to - interval '30 days');
  if v_from >= v_to then
    raise exception 'Période invalide.' using errcode = 'P0001';
  end if;
  v_span := v_to - v_from;
  v_bucket := case
    when v_span <= interval '31 days' then 'day'
    when v_span <= interval '190 days' then 'week'
    else 'month'
  end;

  with o as (
    select ord.id, ord.created_at, ord.total_amount, ord.delivery_fee, ord.discount_amount
      from public.orders ord
     where ord.created_at >= v_from and ord.created_at < v_to
       and ord.status is distinct from 'cancelled'
  ),
  os as (
    select s.id, s.order_id, s.shop_id, s.subtotal, s.commission_amount, o.created_at
      from public.order_shops s
      join o on o.id = s.order_id
     where s.status is distinct from 'cancelled'
  ),
  -- Période précédente, de même durée, pour les variations.
  po as (
    select ord.id, ord.total_amount
      from public.orders ord
     where ord.created_at >= v_from - v_span and ord.created_at < v_from
       and ord.status is distinct from 'cancelled'
  ),
  pos as (
    select s.subtotal, s.commission_amount
      from public.order_shops s
      join po on po.id = s.order_id
     where s.status is distinct from 'cancelled'
  ),
  buckets as (
    select g as bucket_start
      from generate_series(
             date_trunc(v_bucket, v_from at time zone v_tz),
             date_trunc(v_bucket, (v_to - interval '1 microsecond') at time zone v_tz),
             ('1 ' || v_bucket)::interval) g
  ),
  o_by as (
    select date_trunc(v_bucket, o.created_at at time zone v_tz) as b,
           count(*) as orders, coalesce(sum(o.total_amount), 0) as revenue
      from o group by 1
  ),
  os_by as (
    select date_trunc(v_bucket, os.created_at at time zone v_tz) as b,
           coalesce(sum(os.subtotal), 0) as product_sales,
           coalesce(sum(os.commission_amount), 0) as commission
      from os group by 1
  ),
  top_products as (
    select oi.product_id,
           max(oi.product_name) as name,
           max(sh.name) as shop_name,
           sum(oi.quantity) as quantity,
           coalesce(sum(oi.line_total), 0) as revenue
      from public.order_items oi
      join os on os.id = oi.order_shop_id
      left join public.shops sh on sh.id = os.shop_id
     group by oi.product_id
     order by revenue desc, quantity desc, name
     limit 8
  ),
  top_shops as (
    select os.shop_id,
           max(sh.name) as name,
           bool_or(coalesce(sh.is_official, false)) as is_official,
           count(distinct os.order_id) as orders,
           coalesce(sum(os.subtotal), 0) as product_sales,
           coalesce(sum(os.commission_amount), 0) as commission
      from os
      left join public.shops sh on sh.id = os.shop_id
     group by os.shop_id
     order by product_sales desc, orders desc, name
     limit 8
  )
  select jsonb_build_object(
    'from', v_from,
    'to', v_to,
    'bucket', v_bucket,
    'totals', jsonb_build_object(
      'orders', (select count(*) from o),
      'revenue', (select coalesce(sum(total_amount), 0) from o),
      'product_sales', (select coalesce(sum(subtotal), 0) from os),
      'commission', (select coalesce(sum(commission_amount), 0) from os),
      'delivery_fees', (select coalesce(sum(delivery_fee), 0) from o),
      'discounts', (select coalesce(sum(discount_amount), 0) from o),
      'items_sold', (select coalesce(sum(oi.quantity), 0) from public.order_items oi join os on os.id = oi.order_shop_id),
      'cancelled_orders', (select count(*) from public.orders c
                            where c.created_at >= v_from and c.created_at < v_to and c.status = 'cancelled')
    ),
    'previous', jsonb_build_object(
      'orders', (select count(*) from po),
      'revenue', (select coalesce(sum(total_amount), 0) from po),
      'product_sales', (select coalesce(sum(subtotal), 0) from pos),
      'commission', (select coalesce(sum(commission_amount), 0) from pos)
    ),
    'catalog', jsonb_build_object(
      'active_shops', (select count(*) from public.shops s where s.status = 'active'),
      'active_products', (select count(*) from public.products p
                            join public.shops s on s.id = p.shop_id
                           where p.status = 'active' and s.status = 'active')
    ),
    'series', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', to_char(b.bucket_start, 'YYYY-MM-DD'),
               'orders', coalesce(ob.orders, 0),
               'revenue', coalesce(ob.revenue, 0),
               'product_sales', coalesce(sb.product_sales, 0),
               'commission', coalesce(sb.commission, 0)) order by b.bucket_start)
        from buckets b
        left join o_by ob on ob.b = b.bucket_start
        left join os_by sb on sb.b = b.bucket_start), '[]'::jsonb),
    'top_products', coalesce((
      select jsonb_agg(jsonb_build_object(
               'product_id', t.product_id, 'name', t.name, 'shop_name', t.shop_name,
               'quantity', t.quantity, 'revenue', t.revenue)
             order by t.revenue desc, t.quantity desc, t.name)
        from top_products t), '[]'::jsonb),
    'top_shops', coalesce((
      select jsonb_agg(jsonb_build_object(
               'shop_id', t.shop_id, 'name', t.name, 'is_official', t.is_official,
               'orders', t.orders, 'product_sales', t.product_sales, 'commission', t.commission)
             order by t.product_sales desc, t.orders desc, t.name)
        from top_shops t), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.admin_sales_stats(timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_sales_stats(timestamptz, timestamptz) to authenticated;

commit;

-- Vérification : 2 lignes « ok » attendues.
select 'statistiques réservées aux administrateurs' as element,
       case when has_function_privilege('authenticated', 'public.admin_sales_stats(timestamptz, timestamptz)', 'execute')
             and not has_function_privilege('anon', 'public.admin_sales_stats(timestamptz, timestamptz)', 'execute')
             and position('public.admins' in pg_get_functiondef('public.admin_sales_stats(timestamptz, timestamptz)'::regprocedure)) > 0
            then 'ok' else 'À VÉRIFIER' end as etat
union all
select 'index sur la date des commandes',
       case when exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'orders_created_at_idx') then 'ok' else 'À VÉRIFIER' end;
