-- Fonctions de production NON modifiées par les migrations, mais nécessaires aux
-- tests, puis création des déclencheurs de notification de production.

create function public.payments_set_pending(p_transaction_id uuid, p_provider_reference text, p_checkout_url text, p_expires_at timestamptz) returns void
language plpgsql security definer set search_path to '' as $function$
begin
  update public.payment_transactions
     set status = 'pending', provider_reference = coalesce(p_provider_reference, provider_reference),
         checkout_url = p_checkout_url, expires_at = p_expires_at, updated_at = now()
   where id = p_transaction_id and status in ('initiated', 'pending');
end;
$function$;

create function public.payments_record_event(p_provider text, p_capability text, p_provider_event_id text, p_event_type text, p_provider_reference text,
  p_reported_status text, p_reported_amount integer, p_signature_valid boolean) returns jsonb
language plpgsql security definer set search_path to '' as $function$
declare v_id uuid; v_processed boolean;
begin
  insert into public.payment_events (provider, capability, provider_event_id, event_type, provider_reference, reported_status, reported_amount, signature_valid)
  values (p_provider, p_capability, p_provider_event_id, p_event_type, p_provider_reference, p_reported_status, p_reported_amount, coalesce(p_signature_valid, false))
  on conflict (provider, capability, provider_event_id) do nothing returning id into v_id;
  if v_id is not null then return jsonb_build_object('new', true, 'id', v_id, 'processed', false); end if;
  select e.id, e.processed_at is not null into v_id, v_processed from public.payment_events e
   where e.provider = p_provider and e.capability = p_capability and e.provider_event_id = p_provider_event_id;
  return jsonb_build_object('new', false, 'id', v_id, 'processed', coalesce(v_processed, true));
end;
$function$;

create function ezial_private.trg_whatsapp_order_accepted() returns trigger language plpgsql security definer set search_path to '' as $function$
begin
  begin
    perform ezial_private.whatsapp_on_order_accepted(new.id);
  exception when others then
    raise warning 'whatsapp_on_order_accepted(%) : %', new.id, sqlerrm;
  end;
  return null;
end;
$function$;

revoke execute on function public.payments_set_pending(uuid, text, text, timestamptz), public.payments_record_event(text, text, text, text, text, text, integer, boolean),
  public.payments_create_transaction(uuid, text, uuid), public.payments_confirm(uuid, text, integer), public.payments_fail(uuid, text, text),
  public.payments_maintenance() from public, anon, authenticated;

create trigger trg_notify_admin_new_order after insert on public.orders for each row execute function public.trg_fn_notify_admin_new_order();
create trigger trg_notify_customer_order_confirmed after insert on public.orders for each row execute function public.notify_customer_order_confirmed();
create constraint trigger trg_events_order_created after insert on public.orders deferrable initially deferred for each row execute function ezial_private.trg_events_order_created();
create constraint trigger trg_whatsapp_order_inserted after insert on public.orders deferrable initially deferred for each row execute function ezial_private.trg_whatsapp_order_accepted();
create constraint trigger trg_whatsapp_order_updated after update on public.orders deferrable initially deferred for each row
  when (old.status is distinct from new.status or old.payment_status is distinct from new.payment_status) execute function ezial_private.trg_whatsapp_order_accepted();
create trigger trg_notify_seller_new_order after insert on public.order_shops for each row execute function public.notify_seller_new_order();
create trigger trg_notify_seller_order_cancelled after update on public.order_shops for each row
  when (old.status is distinct from new.status and new.status = 'cancelled') execute function public.notify_seller_order_cancelled();
