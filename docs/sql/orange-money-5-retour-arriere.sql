-- Retour arrière de la migration 5 (testeurs Orange Money) : remet exactement les
-- versions des migrations 2 et 4 (interrupteur général seul) et supprime la liste.
begin;

create or replace function ezial_private.trg_orders_set_payment_required() returns trigger
language plpgsql security definer set search_path = '' as $$
declare s public.payment_settings;
begin
  select * into s from public.payment_settings where id;
  if new.payment_method = 'orange_money' and coalesce(s.orange_money_enabled, false) then
    new.payment_required := true;
    new.payment_deadline := now() + make_interval(mins => s.payment_window_minutes);
    new.payment_grace_until := new.payment_deadline + make_interval(mins => s.payment_grace_minutes);
  end if;
  return new;
end; $$;

create or replace function public.payments_create_transaction(p_order_id uuid, p_provider text, p_user_id uuid)
returns public.payment_transactions language plpgsql security definer set search_path = '' as $function$
declare o public.orders; t public.payment_transactions; s public.payment_settings; v_enabled boolean;
begin
  select * into s from public.payment_settings where id;
  if p_provider not in ('wave', 'orange_money') then raise exception 'Moyen de paiement inconnu.' using errcode = 'P0001'; end if;
  v_enabled := case when p_provider = 'orange_money' then coalesce(s.orange_money_enabled, false) else coalesce(s.collections_enabled, false) end;
  if not v_enabled then
    raise exception 'Le paiement en ligne est en cours d''activation.' using errcode = 'P0001';
  end if;
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null or o.customer_id is distinct from p_user_id then raise exception 'Commande introuvable.' using errcode = 'P0001'; end if;
  if o.status = 'cancelled' then raise exception 'Cette commande est annulée.' using errcode = 'P0001'; end if;
  if o.payment_status = 'paid' then raise exception 'Cette commande est déjà payée.' using errcode = 'P0001'; end if;
  if coalesce(o.total_amount, 0) <= 0 then raise exception 'Montant de commande invalide.' using errcode = 'P0001'; end if;
  if p_provider = 'orange_money' and not o.payment_required then
    raise exception 'Cette commande ne peut pas être payée avec Orange Money.' using errcode = 'P0001';
  end if;
  if o.payment_required and p_provider <> 'orange_money' then
    raise exception 'Cette commande doit être payée avec Orange Money.' using errcode = 'P0001';
  end if;
  if o.payment_required and o.payment_deadline - now() < interval '60 seconds' then
    raise exception 'Le délai de paiement est dépassé.' using errcode = 'P0001';
  end if;

  select * into t from public.payment_transactions
   where order_id = o.id and status in ('initiated', 'pending') and provider = p_provider and amount = o.total_amount
     and (expires_at is null or expires_at > now());
  if t.id is not null then return t; end if;

  if p_provider = 'orange_money' then
    update public.payment_transactions set status = 'superseded', superseded_at = now(), failure_reason = 'remplacée par une nouvelle tentative', updated_at = now()
     where order_id = o.id and status in ('initiated', 'pending');
  else
    update public.payment_transactions set status = 'cancelled', failure_reason = 'remplacée par une nouvelle tentative', updated_at = now()
     where order_id = o.id and status in ('initiated', 'pending');
  end if;

  insert into public.payment_transactions (order_id, provider, amount, idempotency_key)
  values (o.id, p_provider, o.total_amount, 'pay_' || replace(gen_random_uuid()::text, '-', ''))
  returning * into t;
  update public.orders set payment_method = p_provider where id = o.id and payment_method is distinct from p_provider;
  perform ezial_private.audit('service', 'payment_initiated', 'payment_transaction', t.id, jsonb_build_object('order_id', o.id, 'provider', p_provider, 'amount', t.amount));
  return t;
end;
$function$;

drop function if exists ezial_private.is_payment_tester(uuid);
drop table if exists public.payment_testers;

commit;
