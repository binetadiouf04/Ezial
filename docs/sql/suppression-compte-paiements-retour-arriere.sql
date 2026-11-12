-- Retour arrière : remet les deux liens sans ON DELETE (la suppression d'un compte
-- ayant un paiement d'abonnement échouera de nouveau).
begin;
alter table public.subscription_payments drop constraint if exists subscription_payments_requested_by_fkey;
alter table public.subscription_payments add constraint subscription_payments_requested_by_fkey foreign key (requested_by) references auth.users(id);
alter table public.subscription_payments drop constraint if exists subscription_payments_reviewed_by_fkey;
alter table public.subscription_payments add constraint subscription_payments_reviewed_by_fkey foreign key (reviewed_by) references auth.users(id);
commit;
