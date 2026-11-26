-- Retour arrière de abonnement-wave.sql : rend les deux fonctions dont la signature a changé à leur version d'abonnement-om.sql.
-- Le plan de test « test_25 » n'est PAS rétabli (il n'existe plus). Les autres fonctions (création, confirmation, vérification)
-- restent compatibles : elles gèrent Wave et Orange Money et n'ont plus de plan de test.
begin;
drop function if exists public.subscription_payments_reconcile_candidates(integer, text);
create or replace function public.subscription_payments_reconcile_candidates(p_limit integer default 50)
returns table (transaction_id uuid, order_id uuid, reference text, status text, expires_at timestamptz, created_at timestamptz, check_count integer)
language sql stable security definer set search_path = '' as $fn$
  select t.id, null::uuid, t.id::text, t.status, t.expires_at, t.created_at, t.check_count
    from public.subscription_payment_attempts t
   where t.provider = 'orange_money' and t.provider_closed_at is null and t.status in ('initiated', 'pending', 'superseded')
     and t.created_at > now() - interval '72 hours'
     and (t.last_checked_at is null or t.last_checked_at < now() - interval '45 seconds')
   order by t.last_checked_at nulls first, t.created_at
   limit greatest(1, least(coalesce(p_limit, 50), 200));
$fn$;
revoke all on function public.subscription_payments_reconcile_candidates(integer) from public, anon, authenticated;
grant execute on function public.subscription_payments_reconcile_candidates(integer) to service_role;

drop function if exists public.seller_subscription_attempt_state(uuid);
create or replace function public.seller_subscription_attempt_state(p_shop_id uuid)
returns table (attempt_id uuid, status text, payment_state text, billing_period text, expires_at timestamptz, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $fn$
begin
  if not exists (select 1 from public.shops s where s.id = p_shop_id and s.owner_id = (select auth.uid())) then
    raise exception 'Boutique introuvable.' using errcode = 'P0001';
  end if;
  return query
    select t.id, t.status,
           case when t.status in ('confirmed', 'duplicate') then 'paid' when t.status in ('failed', 'cancelled') then 'failed'
                when t.status = 'expired' then 'expired' else 'pending' end,
           t.billing_period, t.expires_at, t.created_at
      from public.subscription_payment_attempts t
     where t.shop_id = p_shop_id and t.created_at > now() - interval '3 days'
     order by t.created_at desc limit 1;
end;
$fn$;
revoke all on function public.seller_subscription_attempt_state(uuid) from public, anon;
grant execute on function public.seller_subscription_attempt_state(uuid) to authenticated;
commit;
