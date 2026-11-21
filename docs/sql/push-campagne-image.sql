-- Campagnes de notifications : grande image et bouton pour Android (21 nov. 2026).
-- Deux colonnes facultatives sur public.push_campaigns ; les droits existants (réservés
-- aux administrateurs) s'appliquent tels quels. L'image n'est acceptée que si elle vient
-- du stockage public d'Ezial (site-content/push/, déposée depuis l'administration).
-- Retour arrière : docs/sql/push-campagne-image-retour-arriere.sql

alter table public.push_campaigns
  add column if not exists image_url text,
  add column if not exists action_label text;

alter table public.push_campaigns drop constraint if exists push_campaigns_image_url_check;
alter table public.push_campaigns add constraint push_campaigns_image_url_check check (
  image_url is null
  or (length(image_url) <= 500
      and image_url like 'https://lkqezdrdbogtborgjvlw.supabase.co/storage/v1/object/public/site-content/push/%')
);

alter table public.push_campaigns drop constraint if exists push_campaigns_action_label_check;
alter table public.push_campaigns add constraint push_campaigns_action_label_check check (
  action_label is null or char_length(btrim(action_label)) between 1 and 24
);
