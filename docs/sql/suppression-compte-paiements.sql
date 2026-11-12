-- Ezial — suppression de compte vendeur possible même avec un paiement d'abonnement.
-- Cause : subscription_payments.requested_by et reviewed_by référençaient auth.users
-- sans ON DELETE, ce qui faisait échouer la suppression du compte
-- (« Database error deleting user »). Les paiements sont CONSERVÉS pour la
-- comptabilité ; seul le lien vers le compte supprimé est vidé. Aucun remboursement.
-- Rejouable, une transaction, aucune donnée modifiée.
begin;

alter table public.subscription_payments drop constraint if exists subscription_payments_requested_by_fkey;
alter table public.subscription_payments add constraint subscription_payments_requested_by_fkey
  foreign key (requested_by) references auth.users(id) on delete set null;

alter table public.subscription_payments drop constraint if exists subscription_payments_reviewed_by_fkey;
alter table public.subscription_payments add constraint subscription_payments_reviewed_by_fkey
  foreign key (reviewed_by) references auth.users(id) on delete set null;

commit;

-- Vérification : 2 lignes « ok » attendues.
select 'paiements : lien « demandé par » libéré à la suppression du compte' as element,
       case when exists (select 1 from pg_constraint where conname = 'subscription_payments_requested_by_fkey' and confdeltype = 'n') then 'ok' else 'À VÉRIFIER' end as etat
union all
select 'paiements : lien « validé par » libéré à la suppression du compte',
       case when exists (select 1 from pg_constraint where conname = 'subscription_payments_reviewed_by_fkey' and confdeltype = 'n') then 'ok' else 'À VÉRIFIER' end;
