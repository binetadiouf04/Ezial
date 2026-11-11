-- Ezial — deux comptes de réception par boutique (Wave ET Orange Money).
-- Règle (décision du 11/11/2026) : une vente payée par Wave est versée sur
-- le compte Wave du vendeur, une vente payée par Orange Money sur son compte
-- Orange Money. Un vendeur qui n'a enregistré qu'un seul compte reçoit tout
-- sur celui-là. Chaque numéro reste validé par un administrateur ; pendant
-- la vérification d'un nouveau numéro, les versements vers CE fournisseur
-- sont suspendus. Aucune donnée supprimée (seulement deux index remplacés).
-- Rejouable, une transaction.
begin;

-- 1. Un compte validé et une demande en attente PAR FOURNISSEUR.
drop index if exists public.seller_payout_methods_one_approved;
drop index if exists public.seller_payout_methods_one_pending;
create unique index if not exists seller_payout_methods_one_approved_per_provider
  on public.seller_payout_methods (shop_id, provider) where status = 'approved';
create unique index if not exists seller_payout_methods_one_pending_per_provider
  on public.seller_payout_methods (shop_id, provider) where status = 'pending_review';

-- 2. Nouvelle demande : remplace seulement la demande en attente du MÊME fournisseur.
create or replace function public.submit_payout_method(p_provider text, p_phone text, p_holder_name text, p_consent boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_shop uuid; v_phone text; v_id uuid;
begin
  select s.id into v_shop from public.shops s where s.owner_id = v_uid limit 1;
  if v_uid is null or v_shop is null then raise exception 'Boutique introuvable.' using errcode = 'P0001'; end if;
  if p_provider not in ('wave', 'orange_money') then raise exception 'Choisissez Wave ou Orange Money.' using errcode = 'P0001'; end if;
  if not coalesce(p_consent, false) then raise exception 'Votre autorisation est nécessaire pour recevoir les versements.' using errcode = 'P0001'; end if;
  v_phone := ezial_private.normalize_wallet_phone(p_phone);
  if v_phone is null then raise exception 'Numéro invalide : indiquez un numéro mobile sénégalais (ex. 77 123 45 67).' using errcode = 'P0001'; end if;

  update public.seller_payout_methods set status = 'superseded'
   where shop_id = v_shop and provider = p_provider and status = 'pending_review';
  insert into public.seller_payout_methods (shop_id, provider, phone, holder_name, status, consent_given_at, submitted_by)
  values (v_shop, p_provider, v_phone, nullif(trim(p_holder_name), ''), 'pending_review', now(), v_uid)
  returning id into v_id;
  perform ezial_private.audit('seller', 'payout_method_submitted', 'seller_payout_method', v_id, jsonb_build_object('shop_id', v_shop, 'provider', p_provider,
    'phone_end', right(v_phone, 2)));
  perform public.notify_admins('payout_method_review', 'Nouveau moyen de réception à valider pour une boutique', '/pro/admin/paiements', null, null, null, v_shop);
  return jsonb_build_object('id', v_id, 'status', 'pending_review');
end;
$$;

-- 3. Validation : remplace seulement le compte validé du MÊME fournisseur.
create or replace function public.admin_review_payout_method(p_method_id uuid, p_approve boolean, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.seller_payout_methods; v_owner uuid;
begin
  if not exists (select 1 from public.admins a where a.user_id = (select auth.uid())) then raise exception 'Accès refusé.' using errcode = 'P0001'; end if;
  select * into m from public.seller_payout_methods where id = p_method_id for update;
  if m.id is null or m.status <> 'pending_review' then raise exception 'Demande introuvable ou déjà traitée.' using errcode = 'P0001'; end if;
  if p_approve then
    update public.seller_payout_methods set status = 'superseded' where shop_id = m.shop_id and provider = m.provider and status = 'approved';
    update public.seller_payout_methods set status = 'approved', reviewed_by = (select auth.uid()), reviewed_at = now(), review_note = left(p_note, 300) where id = m.id;
  else
    update public.seller_payout_methods set status = 'rejected', reviewed_by = (select auth.uid()), reviewed_at = now(), review_note = left(p_note, 300) where id = m.id;
  end if;
  perform ezial_private.audit('admin', case when p_approve then 'payout_method_approved' else 'payout_method_rejected' end, 'seller_payout_method', m.id,
    jsonb_build_object('shop_id', m.shop_id, 'provider', m.provider, 'note', left(p_note, 300)));
  select owner_id into v_owner from public.shops where id = m.shop_id;
  perform public.notify_user(v_owner, 'payout_method_reviewed',
    case when p_approve then 'Moyen de réception validé' else 'Moyen de réception refusé' end,
    case when p_approve then 'Votre numéro ' || case m.provider when 'wave' then 'Wave' else 'Orange Money' end || ' a été validé.'
         else 'Votre numéro ' || case m.provider when 'wave' then 'Wave' else 'Orange Money' end || ' n''a pas été validé.' || coalesce(' Motif : ' || left(p_note, 200), '') end,
    '/pro/seller/finances', null, null, null, m.shop_id);
  return jsonb_build_object('status', case when p_approve then 'approved' else 'rejected' end);
end;
$$;

-- 4. Fournisseur de versement d'une vente : celui du paiement du client si
--    le vendeur a un compte (validé ou en vérification) chez lui ; sinon
--    son autre compte. NULL si aucun compte.
create or replace function ezial_private.payout_provider_for_sale(p_shop_id uuid, p_order_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  with paid as (
    select pt.provider from public.payment_transactions pt where pt.order_id = p_order_id and pt.status = 'confirmed' limit 1
  ), accounts as (
    select distinct pm.provider from public.seller_payout_methods pm
     where pm.shop_id = p_shop_id and pm.status in ('approved', 'pending_review')
  )
  select coalesce(
    (select a.provider from accounts a join paid on paid.provider = a.provider),
    (select a.provider from accounts a order by case a.provider when 'wave' then 0 else 1 end limit 1));
$$;
revoke all on function ezial_private.payout_provider_for_sale(uuid, uuid) from public, anon, authenticated;

-- 5. Préparation : un versement par boutique ET par fournisseur.
create or replace function public.payouts_prepare_due()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  s public.payment_settings; v record; v_payout uuid; v_count integer := 0; v_key text;
begin
  select * into s from public.payment_settings where id;
  if not s.payouts_enabled then return 0; end if;
  if s.payout_frequency = 'weekly' and extract(isodow from now() at time zone 'Africa/Dakar') <> s.payout_weekday then return 0; end if;
  v_key := case when s.payout_frequency = 'weekly' then to_char(now() at time zone 'Africa/Dakar', 'IYYY-IW') else to_char(now() at time zone 'Africa/Dakar', 'YYYY-MM-DD') end;

  for v in
    with due as (
      select st.id, st.shop_id, st.net_amount, ezial_private.payout_provider_for_sale(st.shop_id, o.id) as target
        from public.seller_transactions st
        join public.order_shops os on os.id = st.order_shop_id
        join public.orders o on o.id = os.order_id
       where st.type = 'sale' and st.status = 'available' and st.payout_id is null
         and o.payment_status = 'paid'
         and exists (select 1 from public.payment_transactions pt where pt.order_id = o.id and pt.status = 'confirmed')
    )
    select d.shop_id, d.target as provider, pm.id as method_id, pm.phone, sum(d.net_amount)::integer as amount
      from due d
      join public.seller_payout_methods pm on pm.shop_id = d.shop_id and pm.provider = d.target and pm.status = 'approved'
     where d.target is not null
       -- Nouveau numéro de ce fournisseur en vérification : versements suspendus.
       and not exists (select 1 from public.seller_payout_methods pend where pend.shop_id = d.shop_id and pend.provider = d.target and pend.status = 'pending_review')
       and not exists (select 1 from public.seller_payouts p where p.shop_id = d.shop_id and p.provider = d.target and p.status in ('scheduled', 'processing', 'unknown', 'blocked'))
     group by d.shop_id, d.target, pm.id, pm.phone
    having sum(d.net_amount) > 0
  loop
    insert into public.seller_payouts (shop_id, payout_method_id, provider, recipient_phone, amount, idempotency_key)
    values (v.shop_id, v.method_id, v.provider, v.phone, v.amount, 'payout_' || v.shop_id || '_' || v.provider || '_' || v_key)
    on conflict (idempotency_key) do nothing
    returning id into v_payout;
    if v_payout is not null then
      update public.seller_transactions st set payout_id = v_payout
        from public.order_shops os, public.orders o
       where st.shop_id = v.shop_id and st.type = 'sale' and st.status = 'available' and st.payout_id is null
         and os.id = st.order_shop_id and o.id = os.order_id and o.payment_status = 'paid'
         and ezial_private.payout_provider_for_sale(st.shop_id, o.id) = v.provider;
      update public.seller_payouts p set amount = (select sum(net_amount)::integer from public.seller_transactions where payout_id = v_payout)
       where p.id = v_payout;
      perform ezial_private.audit('system', 'payout_scheduled', 'seller_payout', v_payout, jsonb_build_object('shop_id', v.shop_id, 'provider', v.provider, 'amount', v.amount));
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

-- 6. Envoi : suspendu si un nouveau numéro du même fournisseur est en vérification.
create or replace function public.payouts_claim_batch(p_limit integer default 10)
returns setof public.seller_payouts language sql security definer set search_path = '' as $$
  with due as (
    select p.id from public.seller_payouts p, public.payment_settings s
     where s.id and s.payouts_enabled and p.status in ('scheduled', 'blocked') and p.next_attempt_at <= now()
       and exists (select 1 from public.seller_payout_methods pm where pm.id = p.payout_method_id and pm.status = 'approved')
       and not exists (select 1 from public.seller_payout_methods pend where pend.shop_id = p.shop_id and pend.provider = p.provider and pend.status = 'pending_review')
     order by p.created_at limit greatest(1, least(coalesce(p_limit, 10), 50))
     for update of p skip locked
  )
  update public.seller_payouts p set status = 'processing', attempts = p.attempts + 1, updated_at = now(), sent_at = coalesce(p.sent_at, now())
    from due where p.id = due.id
  returning p.*;
$$;

revoke all on function public.payouts_prepare_due(), public.payouts_claim_batch(integer) from public, anon, authenticated;
grant execute on function public.payouts_prepare_due(), public.payouts_claim_batch(integer) to service_role;

commit;

-- Vérification : 3 lignes « ok » attendues.
select 'un compte par fournisseur' as element,
       case when exists (select 1 from pg_indexes where indexname = 'seller_payout_methods_one_approved_per_provider')
             and not exists (select 1 from pg_indexes where indexname = 'seller_payout_methods_one_approved') then 'ok' else 'À VÉRIFIER' end as etat
union all
select 'versement selon le moyen de paiement du client',
       case when position('payout_provider_for_sale' in pg_get_functiondef('public.payouts_prepare_due()'::regprocedure)) > 0 then 'ok' else 'À VÉRIFIER' end
union all
select 'versements : toujours désactivés',
       case when not (select payouts_enabled from public.payment_settings) then 'ok' else 'À VÉRIFIER' end;
