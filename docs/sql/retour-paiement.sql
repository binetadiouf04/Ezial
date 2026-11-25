-- ============================================================================
-- Retour après paiement (Orange Money / Wave) : état du paiement lisible SANS connexion
--
-- Pourquoi : après un paiement dans Max It / Orange Money, iPhone ouvre l'adresse de
-- retour dans Safari, pas dans l'application installée. Safari n'a pas la session du
-- client : la page de retour ne pouvait rien lire (« Commande introuvable »).
--
-- Ce que fait cette fonction, et rien d'autre :
--   * entrée : l'identifiant (uuid aléatoire, gen_random_uuid) de la tentative de paiement
--     public.payment_transactions.id, transmis dans l'adresse de retour (« ref= ») ;
--     jamais le numéro de commande, qui est séquentiel et devinable ;
--   * sortie : le numéro de commande et un état parmi paid / pending / failed / expired ;
--     aucun montant, aucun nom, téléphone, adresse ni référence Orange / Wave ;
--   * lecture seule ; ne modifie ni la commande ni le paiement (la confirmation reste faite
--     uniquement par le serveur après vérification auprès du fournisseur).
--
-- États :
--   paid    : orders.payment_status = 'paid' (ou 'refunded' : le paiement a bien été reçu) ;
--   failed  : cette tentative est refusée / annulée chez le fournisseur ;
--   expired : cette tentative est close sans paiement, ou la commande est annulée ;
--   pending : tout le reste (en attente, en cours de vérification, QR remplacé encore surveillé).
--
-- Sûre à relancer. Retour arrière : docs/sql/retour-paiement-retour.sql
-- ============================================================================
begin;

create or replace function public.payment_return_status(p_ref uuid)
returns table (order_number text, payment_state text)
language sql
stable
security definer
set search_path = ''
as $function$
  select o.order_number::text,
         case
           when o.payment_status in ('paid', 'refunded') then 'paid'
           when t.status in ('failed', 'cancelled') then 'failed'
           when t.status = 'expired' then 'expired'
           when o.status = 'cancelled' then 'expired'
           else 'pending'
         end
    from public.payment_transactions t
    join public.orders o on o.id = t.order_id
   where t.id = p_ref
   limit 1;
$function$;

comment on function public.payment_return_status(uuid) is
  'Page de retour après paiement : numéro de commande + état (paid/pending/failed/expired) à partir de l''uuid de la tentative de paiement. Aucune donnée personnelle ni montant.';

revoke all on function public.payment_return_status(uuid) from public;
grant execute on function public.payment_return_status(uuid) to anon, authenticated;

commit;

-- Vérification (doit afficher « ok » sur chaque ligne)
select 'fonction présente' as element,
       case when to_regprocedure('public.payment_return_status(uuid)') is not null then 'ok' else 'À VÉRIFIER' end as etat
union all
select 'SECURITY DEFINER + search_path fixé',
       case when exists (select 1 from pg_proc where oid = to_regprocedure('public.payment_return_status(uuid)')
                          and prosecdef and proconfig @> array['search_path=""']) then 'ok' else 'À VÉRIFIER' end
union all
select 'exécutable par anon',
       case when has_function_privilege('anon', 'public.payment_return_status(uuid)', 'execute') then 'ok' else 'À VÉRIFIER' end
union all
select 'identifiant inconnu : aucune ligne',
       case when not exists (select 1 from public.payment_return_status('00000000-0000-0000-0000-000000000000')) then 'ok' else 'À VÉRIFIER' end;
