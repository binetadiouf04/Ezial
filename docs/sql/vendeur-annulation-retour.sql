-- ============================================================================
-- Ezial — RETOUR ARRIÈRE de docs/sql/vendeur-annulation.sql
--
-- Remet les 5 fonctions de production dans leur état d'origine (copie enregistrée par la migration, puis
-- vérifiée), supprime les fonctions du vendeur et de l'administration, et retire la table des annulations
-- SI ELLE EST VIDE. Si des annulations ont déjà été enregistrées, la table est CONSERVÉE (historique, motifs,
-- remboursements) : elle n'est plus utilisée et pourra être réutilisée par une nouvelle application.
-- REFUSÉ (rien n'est modifié) tant qu'un remboursement est encore « à effectuer » : marquez-les d'abord dans l'admin.
-- Les parts déjà annulées (order_shops.status = 'cancelled') et le stock rendu restent tels quels : ce sont des
-- données de commandes réelles, jamais supprimées.
-- RELANÇABLE : oui (sans effet la seconde fois).
-- ============================================================================
begin;

do $$
declare v_pending integer := 0;
begin
  if to_regclass('public.order_shop_cancellations') is not null then
    execute 'select count(*) from public.order_shop_cancellations where refund_status = ''to_refund''' into v_pending;
    if v_pending > 0 then
      raise exception 'Retour arrière refusé : % remboursement(s) encore à effectuer (rien n''a été modifié).', v_pending;
    end if;
  end if;
  if to_regprocedure('public.seller_cancel_order_shop(uuid,text,text)') is not null
     and to_regclass('ezial_private.vendeur_annulation_saved_functions') is null then
    raise exception 'Copie des fonctions d''origine introuvable : retour arrière refusé (rien n''a été modifié).';
  end if;
end $$;

-- 1. Les fonctions d'origine reviennent (avant de supprimer l'aide dont la nouvelle version dépend).
do $$
declare r record;
begin
  if to_regclass('ezial_private.vendeur_annulation_saved_functions') is not null then
    for r in select def from ezial_private.vendeur_annulation_saved_functions loop
      execute r.def;
    end loop;
  end if;
end $$;

-- 2. Fonctions ajoutées.
drop function if exists public.seller_cancel_order_shop(uuid, text, text);
drop function if exists public.admin_refunds_to_make(text);
drop function if exists public.admin_mark_refunded(uuid, text, text, text);
drop function if exists public.admin_shop_cancellation_stats();
drop function if exists ezial_private.ensure_delivery_mission(uuid);

-- 3. Table : supprimée seulement si vide (sinon conservée, voir l'en-tête).
do $$
declare v_rows integer := 0;
begin
  if to_regclass('public.order_shop_cancellations') is not null then
    execute 'select count(*) from public.order_shop_cancellations' into v_rows;
    if v_rows = 0 then
      execute 'drop table public.order_shop_cancellations';
    else
      raise notice 'Table order_shop_cancellations conservée (% ligne(s) d''historique).', v_rows;
    end if;
  end if;
end $$;

drop table if exists ezial_private.vendeur_annulation_saved_functions;

commit;

-- VÉRIFICATION (résultat attendu : tout « ok »)
select 'fonction du vendeur supprimée' as element,
       case when to_regprocedure('public.seller_cancel_order_shop(uuid,text,text)') is null then 'ok' else 'À VÉRIFIER' end as etat
union all select 'fonctions de production d''origine',
       case when position('seller_cancel' in pg_get_functiondef('ezial_private.guard_order_shop_status()'::regprocedure)) = 0
             and position('seller_cancel' in pg_get_functiondef('public.lock_delivery_missions_identity_columns()'::regprocedure)) = 0
             and position('seller_cancel' in pg_get_functiondef('public.notify_customer_order_shop_status()'::regprocedure)) = 0
             and position('seller_cancel' in pg_get_functiondef('public.notify_seller_order_cancelled()'::regprocedure)) = 0
             and position('ensure_delivery_mission' in pg_get_functiondef('public.create_delivery_mission_when_ready()'::regprocedure)) = 0 then 'ok' else 'À VÉRIFIER' end;
