-- Versions de PRODUCTION (20 nov. 2026) des fonctions que les migrations Orange Money
-- remplacent. Ce fichier sert (1) de point de départ des tests et (2) de partie
-- « restauration » du script de retour arrière (voir build-rollback.sh).

create or replace function public.notify_customer_order_confirmed() returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if new.customer_id is not null then
    perform public.notify_user(
      new.customer_id, 'order_confirmed', 'Commande confirmée',
      'Votre commande ' || coalesce(new.order_number, '') || ' est enregistrée. Votre facture est disponible.',
      '/compte/commande/' || coalesce(new.order_number, ''), new.id
    );
  end if;
  return new;
end;
$function$;

create or replace function public.notify_seller_new_order() returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare v_owner_id uuid;
begin
  select owner_id into v_owner_id from public.shops where id = new.shop_id;
  if v_owner_id is null then return new; end if;
  perform public.notify_user(v_owner_id, 'seller_new_order', 'Nouvelle commande reçue', 'Une nouvelle commande vient d''arriver.', '/pro/seller/commandes', new.order_id, null, null, new.shop_id);
  return new;
end;
$function$;

create or replace function public.notify_seller_order_cancelled() returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare v_owner_id uuid;
begin
  if new.status is distinct from 'cancelled' then return new; end if;
  select owner_id into v_owner_id from public.shops where id = new.shop_id;
  if v_owner_id is null then return new; end if;
  perform public.notify_user(v_owner_id, 'seller_order_cancelled', 'Commande annulée', 'Une commande a été annulée.', '/pro/seller/commandes', new.order_id, null, null, new.shop_id);
  return new;
end;
$function$;

create or replace function public.trg_fn_notify_admin_new_order() returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  perform public.notify_admins('new_order', 'Nouvelle commande ' || new.order_number, '/pro/admin/commandes/' || new.id, new.id);
  return new;
end;
$function$;

create or replace function ezial_private.trg_events_order_created() returns trigger language plpgsql security definer set search_path to '' as $function$
declare v uuid;
begin
  begin
    if new.status <> 'cancelled' then
      perform ezial_private.emit_event('order.confirmed', new.id);
      for v in select id from public.order_shops where order_id = new.id loop
        perform ezial_private.emit_event('seller_order.created', v);
      end loop;
    end if;
  exception when others then
    raise warning 'events order created: %', sqlerrm;
  end;
  return null;
end;
$function$;

create or replace function ezial_private.whatsapp_on_order_accepted(p_order_id uuid) returns void language plpgsql security definer set search_path to '' as $function$
declare v_order record; v_requires_paid boolean;
begin
  select o.id, o.status, o.payment_status, o.customer_id, o.phone into v_order from public.orders o where o.id = p_order_id;
  if v_order.id is null or v_order.status = 'cancelled' then return; end if;
  select s.confirmation_requires_paid into v_requires_paid from public.whatsapp_settings s where s.id;
  if coalesce(v_requires_paid, false) and v_order.payment_status is distinct from 'paid' then return; end if;
  perform ezial_private.whatsapp_enqueue('buyer_order_confirmed', 'buyer_order_confirmed:' || v_order.id, v_order.id, null, null, v_order.customer_id, v_order.phone, interval '24 hours');
end;
$function$;

create or replace function public.payments_create_transaction(p_order_id uuid, p_provider text, p_user_id uuid) returns public.payment_transactions
language plpgsql security definer set search_path to '' as $function$
declare o public.orders; t public.payment_transactions; v_enabled boolean;
begin
  select s.collections_enabled into v_enabled from public.payment_settings s where s.id;
  if not coalesce(v_enabled, false) then
    raise exception 'Le paiement en ligne est en cours d''activation.' using errcode = 'P0001';
  end if;
  if p_provider not in ('wave', 'orange_money') then raise exception 'Moyen de paiement inconnu.' using errcode = 'P0001'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null or o.customer_id is distinct from p_user_id then raise exception 'Commande introuvable.' using errcode = 'P0001'; end if;
  if o.status = 'cancelled' then raise exception 'Cette commande est annulée.' using errcode = 'P0001'; end if;
  if o.payment_status = 'paid' then raise exception 'Cette commande est déjà payée.' using errcode = 'P0001'; end if;
  if coalesce(o.total_amount, 0) <= 0 then raise exception 'Montant de commande invalide.' using errcode = 'P0001'; end if;
  select * into t from public.payment_transactions
   where order_id = o.id and status in ('initiated', 'pending') and provider = p_provider and amount = o.total_amount
     and (expires_at is null or expires_at > now());
  if t.id is not null then return t; end if;
  update public.payment_transactions set status = 'cancelled', failure_reason = 'remplacée par une nouvelle tentative', updated_at = now()
   where order_id = o.id and status in ('initiated', 'pending');
  insert into public.payment_transactions (order_id, provider, amount, idempotency_key)
  values (o.id, p_provider, o.total_amount, 'pay_' || replace(gen_random_uuid()::text, '-', ''))
  returning * into t;
  update public.orders set payment_method = p_provider where id = o.id and payment_method is distinct from p_provider;
  perform ezial_private.audit('service', 'payment_initiated', 'payment_transaction', t.id, jsonb_build_object('order_id', o.id, 'provider', p_provider, 'amount', t.amount));
  return t;
end;
$function$;

create or replace function public.payments_confirm(p_transaction_id uuid, p_provider_reference text, p_confirmed_amount integer) returns text
language plpgsql security definer set search_path to '' as $function$
declare t public.payment_transactions; o public.orders;
begin
  select * into t from public.payment_transactions where id = p_transaction_id for update;
  if t.id is null then return 'not_found'; end if;
  if t.status = 'confirmed' then return 'already_confirmed'; end if;
  select * into o from public.orders where id = t.order_id for update;
  if p_confirmed_amount is distinct from t.amount or t.amount is distinct from o.total_amount then
    perform ezial_private.emit_event('finance.anomaly', t.id, 'amount_mismatch', jsonb_build_object('reason', 'Montant confirmé différent du montant attendu.',
      'expected', t.amount, 'order_total', o.total_amount, 'confirmed', p_confirmed_amount));
    perform ezial_private.audit('service', 'payment_amount_mismatch', 'payment_transaction', t.id, jsonb_build_object('expected', t.amount, 'confirmed', p_confirmed_amount));
    return 'amount_mismatch';
  end if;
  if exists (select 1 from public.payment_transactions x where x.order_id = t.order_id and x.status = 'confirmed') then
    perform ezial_private.emit_event('finance.anomaly', t.id, 'double_payment', jsonb_build_object('reason', 'Deuxième paiement confirmé pour la même commande : remboursement à prévoir.'));
    return 'duplicate_payment';
  end if;
  update public.payment_transactions set status = 'confirmed', confirmed_at = now(), updated_at = now(),
    provider_reference = coalesce(p_provider_reference, provider_reference), failure_reason = null where id = t.id;
  perform ezial_private.audit('service', 'payment_confirmed', 'payment_transaction', t.id, jsonb_build_object('order_id', o.id, 'amount', t.amount, 'provider', t.provider));
  perform ezial_private.emit_event('payment.confirmed', o.id, null, jsonb_build_object('provider', t.provider, 'amount', t.amount));
  if o.status = 'cancelled' then
    perform ezial_private.emit_event('finance.anomaly', o.id, 'paid_but_cancelled', jsonb_build_object('reason', 'Paiement confirmé sur une commande annulée : remboursement à prévoir.'));
    return 'confirmed_on_cancelled_order';
  end if;
  update public.orders set payment_status = 'paid' where id = o.id and payment_status is distinct from 'paid';
  return 'confirmed';
end;
$function$;

create or replace function public.payments_fail(p_transaction_id uuid, p_status text, p_reason text) returns text
language plpgsql security definer set search_path to '' as $function$
declare t public.payment_transactions;
begin
  if p_status not in ('failed', 'cancelled', 'expired') then raise exception 'Statut invalide.'; end if;
  select * into t from public.payment_transactions where id = p_transaction_id for update;
  if t.id is null then return 'not_found'; end if;
  if t.status not in ('initiated', 'pending') then return t.status; end if;
  update public.payment_transactions set status = p_status, failure_reason = left(p_reason, 300), updated_at = now() where id = t.id;
  perform ezial_private.audit('service', 'payment_' || p_status, 'payment_transaction', t.id, jsonb_build_object('reason', left(p_reason, 300)));
  return p_status;
end;
$function$;

create or replace function public.payments_maintenance() returns void language plpgsql security definer set search_path to '' as $function$
begin
  update public.payment_transactions set status = 'expired', failure_reason = 'délai dépassé', updated_at = now()
   where status in ('initiated', 'pending') and coalesce(expires_at, created_at + interval '2 hours') < now();
end;
$function$;
