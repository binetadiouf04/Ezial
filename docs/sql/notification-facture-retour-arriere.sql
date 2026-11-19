-- Retour arrière de notification-facture.sql : texte et lien d'origine.
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
      'Votre commande ' || coalesce(new.order_number, '') || ' a bien été enregistrée.',
      '/commandes', new.id
    );
  end if;
  return new;
end;
$function$;
