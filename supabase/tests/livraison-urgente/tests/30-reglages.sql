-- RÉGLAGES : droits et contrôles de la fonction d'administration.
do $$
declare ok boolean; msg text;
begin
  -- Un client ne peut ni lire ni modifier les réglages
  perform tests.as_user('00000000-0000-4000-8000-0000000000c1');
  ok := false; begin perform public.admin_update_urgent_delivery_settings(true, 0, 7, '[]'); exception when others then ok := sqlerrm = 'Action réservée aux administrateurs.'; end;
  perform tests.check(ok, 'Droits : un client ne peut pas modifier les réglages');
  perform tests.check((select count(*) from public.urgent_delivery_settings) = 0, 'Droits : un client ne voit pas la table de réglages (RLS)');
  perform tests.as_system();
  perform tests.as_user(null, 'anon');
  ok := false; begin perform count(*) from public.urgent_delivery_settings; exception when others then ok := true; end;
  perform tests.check(ok, 'Droits : un visiteur sans compte ne peut pas lire la table');
  perform tests.as_system();
  perform tests.check(not has_function_privilege('authenticated', 'ezial_private.order_urgent_fee(jsonb, boolean)', 'execute')
    and not has_function_privilege('anon', 'ezial_private.urgent_delivery_refusal(date, text, timestamptz)', 'execute'),
    'Droits : fonctions internes non exécutables par le site');

  -- Administrateur : lecture et contrôles
  perform tests.as_user('00000000-0000-4000-8000-0000000000a1');
  perform tests.check((select count(*) from public.urgent_delivery_settings) = 1, 'Admin : lit les réglages');
  msg := null; begin perform public.admin_update_urgent_delivery_settings(true, 60, 1, '[{"label": "A", "start": "12:00", "end": "11:00", "cutoff": "10:00", "enabled": true}]'); exception when others then msg := sqlerrm; end;
  perform tests.check(msg = 'Le créneau « A » doit commencer avant de finir.', 'Admin : créneau qui finit avant de commencer refusé');
  msg := null; begin perform public.admin_update_urgent_delivery_settings(true, 60, 1, '[{"label": "A", "start": "10:00", "end": "11:00", "cutoff": "10:30", "enabled": true}]'); exception when others then msg := sqlerrm; end;
  perform tests.check(msg = 'L''heure limite du créneau « A » doit être au plus tard à son début.', 'Admin : heure limite après le début refusée');
  msg := null; begin perform public.admin_update_urgent_delivery_settings(true, 60, 1, '[{"label": "A", "start": "10:00", "end": "11:00", "cutoff": "09:00", "enabled": true}, {"label": "A", "start": "12:00", "end": "13:00", "cutoff": "11:00", "enabled": true}]'); exception when others then msg := sqlerrm; end;
  perform tests.check(msg = 'Le créneau « A » apparaît deux fois.', 'Admin : libellé en double refusé');
  msg := null; begin perform public.admin_update_urgent_delivery_settings(true, 60, 1, '[{"label": "A", "start": "10h", "end": "11:00", "cutoff": "09:00", "enabled": true}]'); exception when others then msg := sqlerrm; end;
  perform tests.check(msg like 'Heures invalides%', 'Admin : heure mal écrite refusée');
  msg := null; begin perform public.admin_update_urgent_delivery_settings(true, 60, 1, '[{"label": "A", "start": "10:00", "end": "11:00", "cutoff": "09:00", "enabled": false}]'); exception when others then msg := sqlerrm; end;
  perform tests.check(msg = 'Activez au moins un créneau avant d''ouvrir la livraison urgente.', 'Admin : ouverture sans créneau actif refusée');
  msg := null; begin perform public.admin_update_urgent_delivery_settings(true, -5, 1, '[]'); exception when others then msg := sqlerrm; end;
  perform tests.check(msg like 'Délai minimal invalide%', 'Admin : délai minimal négatif refusé');
  msg := null; begin perform public.admin_update_urgent_delivery_settings(true, 60, 9, '[]'); exception when others then msg := sqlerrm; end;
  perform tests.check(msg like 'Nombre de jours invalide%', 'Admin : plus de 7 jours refusé');
  perform public.admin_update_urgent_delivery_settings(false, 90, 2, '[{"label": " Matin ", "start": "9:00", "end": "12:00", "cutoff": "8:00", "enabled": true}]');
  perform tests.check((select slots from public.urgent_delivery_settings) = '[{"label": "Matin", "start": "09:00", "end": "12:00", "cutoff": "08:00", "enabled": true}]'::jsonb
    and (select not enabled and min_lead_minutes = 90 and max_days_ahead = 2 and updated_by = '00000000-0000-4000-8000-0000000000a1' from public.urgent_delivery_settings),
    'Admin : réglages enregistrés et normalisés (libellé nettoyé, heures HH:MM, auteur noté)');
  perform tests.as_system();
end $$;
