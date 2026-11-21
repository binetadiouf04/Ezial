-- Retour arrière de docs/sql/push-campagne-image.sql (supprime l'image et le bouton des campagnes).
alter table public.push_campaigns drop constraint if exists push_campaigns_action_label_check;
alter table public.push_campaigns drop constraint if exists push_campaigns_image_url_check;
alter table public.push_campaigns drop column if exists action_label;
alter table public.push_campaigns drop column if exists image_url;
