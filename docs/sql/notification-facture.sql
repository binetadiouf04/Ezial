-- Notification « Commande confirmée » : annonce la facture et ouvre le détail de la commande
-- (où s'affiche la carte de facture), au lieu de la liste générale « /commandes ».
-- Ne change que le texte et le lien ; même déclencheur, mêmes destinataires, même envoi push.
-- À exécuter APRÈS la publication de la carte de facture (PR 53), déjà en ligne.
-- Retour arrière : notification-facture-retour-arriere.sql

create or replace function public.notify_customer_order_confirmed()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
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
