-- Banc « Campagnes promotionnelles » : aides pour la LIVRAISON URGENTE (en production depuis le 24-25 nov. 2026).
-- Chargé APRÈS 10-production.sql. Données FICTIVES. Le réglage est ouvert dans le banc (créneaux par défaut de la
-- migration, délai minimal 60 min, aujourd'hui + demain) : seules les commandes qui envoient urgentDelivery = true
-- sont concernées, les autres scénarios ne changent pas.
update public.urgent_delivery_settings set enabled = true, min_lead_minutes = 60, max_days_ahead = 1 where id;

-- Jour de Dakar (UTC+0) : aujourd'hui + n, au format envoyé par le site.
create function tests.dakar_day(n integer default 0) returns text language sql as
$$ select to_char((now() at time zone 'Africa/Dakar')::date + n, 'YYYY-MM-DD') $$;
-- Demande de livraison urgente (demain, 18h–20h : toujours réalisable quelle que soit l'heure du test).
create function tests.urgent(n integer default 1, p_slot text default '18h–20h') returns jsonb language sql as
$$ select jsonb_build_object('urgentDelivery', true, 'preferredDeliveryDate', tests.dakar_day(n), 'preferredDeliverySlot', p_slot) $$;
