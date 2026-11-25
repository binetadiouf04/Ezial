-- Retour arrière de docs/sql/retour-paiement.sql : supprime la fonction de lecture
-- de l'état du paiement sans connexion. Aucune donnée n'est touchée.
-- La page de retour du site reste correcte sans elle (message neutre
-- « Paiement en cours de vérification, revenez dans l'application Ezial »).
begin;
drop function if exists public.payment_return_status(uuid);
commit;

select 'fonction supprimée' as element,
       case when to_regprocedure('public.payment_return_status(uuid)') is null then 'ok' else 'À VÉRIFIER' end as etat;
