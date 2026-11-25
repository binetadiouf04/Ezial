-- ============================================================================
-- Ezial — RETOUR ARRIÈRE de docs/sql/abonnement-om.sql
--
-- Remet les 3 fonctions de production dans leur état d'origine (copie enregistrée par la migration), restaure la
-- politique « le vendeur peut déclarer un paiement » et l'ancienne contrainte des moyens de remboursement (qui
-- re-autorisait « espèces » : c'est l'état d'origine exact, à ne remettre que pour revenir en arrière), supprime les
-- fonctions ajoutées, puis supprime la table des tentatives SI ELLE EST VIDE (avec les colonnes ajoutées).
-- Si elle contient des lignes d'historique, la table et les colonnes sont CONSERVÉES (aucun enregistrement de paiement n'est détruit).
-- REFUSÉ (rien n'est modifié) tant qu'une tentative est ouverte (initiated / pending) ou qu'un paiement a été confirmé / doublé :
-- l'argent d'un vendeur ne doit jamais perdre son lien avec l'abonnement activé. Les abonnements déjà activés restent actifs.
-- RELANÇABLE : oui (sans effet la seconde fois).
-- ============================================================================
begin;

do $$
declare v_open integer := 0;
begin
  if to_regclass('public.subscription_payment_attempts') is not null then
    execute 'select count(*) from public.subscription_payment_attempts where status in (''initiated'', ''pending'', ''confirmed'', ''duplicate'')' into v_open;
    if v_open > 0 then
      raise exception 'Retour arrière refusé : % tentative(s) de paiement ouverte(s) ou confirmée(s) (rien n''a été modifié).', v_open;
    end if;
  end if;
  if to_regprocedure('public.subscription_payments_confirm(uuid,text,integer)') is not null
     and to_regclass('ezial_private.abonnement_om_saved_functions') is null then
    raise exception 'Copie des fonctions d''origine introuvable : retour arrière refusé (rien n''a été modifié).';
  end if;
end $$;

-- 1. Fonctions de production d'origine.
do $$
declare r record;
begin
  if to_regclass('ezial_private.abonnement_om_saved_functions') is not null then
    for r in select def from ezial_private.abonnement_om_saved_functions loop
      execute r.def;
    end loop;
  end if;
end $$;

-- 2. Contrainte des moyens de remboursement d'origine.
alter table public.order_shop_cancellations drop constraint if exists order_shop_cancellations_refund_method_check;
alter table public.order_shop_cancellations add constraint order_shop_cancellations_refund_method_check
  check (refund_method is null or refund_method in ('orange_money', 'wave', 'especes', 'virement', 'autre'));

-- 3. Politique d'origine.
drop policy if exists subscription_payments_insert_own on public.subscription_payments;
create policy subscription_payments_insert_own on public.subscription_payments for insert
  with check ((exists (select 1 from public.shops s where s.id = subscription_payments.shop_id and s.owner_id = auth.uid())) and status = 'pending_review');

-- 4. Fonctions ajoutées.
drop function if exists public.subscription_payments_create_attempt(uuid, text, text, uuid);
drop function if exists public.subscription_payments_set_pending(uuid, text, text, timestamptz);
drop function if exists public.subscription_payments_fail(uuid, text, text);
drop function if exists public.subscription_payments_confirm(uuid, text, integer);
drop function if exists public.subscription_payments_record_verification(uuid, text, integer, text);
drop function if exists public.subscription_payments_reconcile_candidates(integer);
drop function if exists public.subscription_payment_return_status(uuid);
drop function if exists public.seller_subscription_attempt_state(uuid);
drop function if exists public.admin_subscription_payments(integer);
drop function if exists public.admin_confirm_subscription_attempt(uuid, text, text);
drop function if exists public.admin_reject_subscription_attempt(uuid, text);
drop function if exists ezial_private.subscription_confirm_attempt(uuid, text, integer, uuid);
drop function if exists ezial_private.subscription_attempt_price(text);
drop function if exists public.subscription_test_plan_available();

-- 5. Table et colonnes : supprimées seulement si la table est vide (sinon conservées, voir l'en-tête).
do $$
declare v_rows integer := 0;
begin
  if to_regclass('public.subscription_payment_attempts') is not null then
    execute 'select count(*) from public.subscription_payment_attempts' into v_rows;
    if v_rows = 0 then
      drop index if exists public.payment_anomalies_once_per_sub_attempt;
      alter table public.payment_anomalies drop column if exists subscription_attempt_id;
      drop index if exists public.subscription_payments_attempt_key;
      alter table public.subscription_payments drop constraint if exists subscription_payments_source_check;
      alter table public.subscription_payments drop column if exists attempt_id;
      alter table public.subscription_payments drop column if exists source;
      drop table public.subscription_payment_attempts;
    else
      raise notice 'Table subscription_payment_attempts conservée (% ligne(s) d''historique).', v_rows;
    end if;
  end if;
end $$;

drop table if exists ezial_private.abonnement_om_saved_functions;

commit;

-- VÉRIFICATION (résultat attendu : tout « ok »)
select 'fonction d''activation supprimée' as element,
       case when to_regprocedure('public.subscription_payments_confirm(uuid,text,integer)') is null then 'ok' else 'À VÉRIFIER' end as etat
union all select 'fonctions de production d''origine',
       case when position('abonnement-om' in pg_get_functiondef('public.process_subscription_expirations()'::regprocedure)) = 0
             and position('abonnement-om' in pg_get_functiondef('public.notify_admin_new_subscription_payment()'::regprocedure)) = 0
             and position('abonnement-om' in pg_get_functiondef('public.admin_mark_refunded(uuid,text,text,text)'::regprocedure)) = 0 then 'ok' else 'À VÉRIFIER' end;
