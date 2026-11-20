-- ============================================================================
-- Orange Money (QR Code – OM) — migration 3/4 : STOCK
--   * filet de sécurité : le stock d'une variante ne peut jamais être négatif ;
--   * restitution du stock d'une commande annulée faute de paiement :
--       - atomique (une seule transaction),
--       - une seule fois, même en cas d'appels simultanés (verrou sur la commande + marqueur),
--       - réservée aux commandes à paiement obligatoire jamais payées (Wave et commandes existantes : jamais touchées).
-- La réservation du stock à la commande reste celle de create_order (verrou de ligne + contrôle + décrément
-- dans la même transaction) : elle n'est pas modifiée.
-- Prérequis : migration 1. Sûre à relancer. Retour arrière : orange-money-retour-arriere.sql
-- ============================================================================
begin;

-- Contrôle préalable : la migration s'arrête (sans rien modifier) si un stock négatif existe déjà.
do $$
begin
  if exists (select 1 from public.product_variants where stock < 0) then
    raise exception 'Des variantes ont un stock négatif : à corriger avant cette migration.';
  end if;
end $$;

alter table public.product_variants drop constraint if exists product_variants_stock_non_negative;
alter table public.product_variants add constraint product_variants_stock_non_negative check (stock >= 0);

create or replace function ezial_private.restock_order(p_order_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare o public.orders; v_lines integer;
begin
  -- Verrou sur la commande : deux appels simultanés passent l'un après l'autre.
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then return 'not_found'; end if;
  if not o.payment_required then return 'not_applicable'; end if;            -- Wave, commandes existantes
  if o.paid_processed_at is not null then return 'paid_order'; end if;       -- jamais pour une commande payée
  if o.status <> 'cancelled' then return 'not_cancelled'; end if;
  if o.stock_released_at is not null then return 'already_released'; end if; -- une seule restitution

  -- Verrous des variantes dans un ordre fixe (évite les blocages croisés entre restitutions).
  perform 1 from public.product_variants pv
   where pv.id in (select oi.variant_id from public.order_items oi where oi.order_id = o.id and oi.variant_id is not null)
   order by pv.id for update;

  update public.product_variants pv set stock = pv.stock + s.qty, updated_at = now()
    from (select oi.variant_id, sum(oi.quantity) as qty from public.order_items oi
           where oi.order_id = o.id and oi.variant_id is not null group by oi.variant_id) s
   where pv.id = s.variant_id;
  get diagnostics v_lines = row_count;

  update public.orders set stock_released_at = now() where id = o.id;
  perform ezial_private.audit('system', 'order_stock_released', 'order', o.id, jsonb_build_object('variants', v_lines));
  return 'released';
end; $$;
revoke execute on function ezial_private.restock_order(uuid) from public, anon, authenticated;

commit;
