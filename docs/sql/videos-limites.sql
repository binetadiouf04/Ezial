-- Ezial — Vidéos produit : limites d'abus imposées par la base (NON EXÉCUTÉ : à lancer par la propriétaire)
-- À exécuter dans Supabase → SQL Editor, EN 2 ÉTAPES SÉPARÉES (une étape = un copier-coller = un clic sur « Run »).
--
-- Constat en production (lecture seule, 25 nov. 2026) : 2 vidéos, aucun produit avec plus d'une vidéo ;
-- le bucket « product-images » accepte jusqu'à 52 428 800 octets (50 Mo) par fichier.
-- La règle « une seule vidéo par produit » n'existait que dans le formulaire (MAX_PRODUCT_VIDEOS) :
-- rien ne l'imposait en base. L'application envoie désormais des vidéos optimisées de 25 Mo au plus
-- (src/lib/videoOptimizeCore.ts : MAX_VIDEO_UPLOAD_MB), 30 s au plus.
--
-- Ordre conseillé : publier d'abord la nouvelle version de l'application (Ezial Pro), puis lancer ces
-- deux étapes. Les fichiers déjà en ligne (dont l'IMG_0360.mov de 10,3 Mo) ne sont pas touchés.

-- ÉTAPE 1 — une seule vidéo par produit, imposée par la base.
create unique index if not exists product_images_one_video_per_product
  on public.product_images (product_id)
  where media_type = 'video';

-- ÉTAPE 2 — plafond de poids du bucket : 25 Mo (26 214 400 octets) au lieu de 50 Mo.
-- Les photos pèsent quelques centaines de Ko ; seules les vidéos approchent cette limite.
update storage.buckets
   set file_size_limit = 26214400
 where id = 'product-images';

-- Retour arrière (si besoin) :
--   drop index if exists public.product_images_one_video_per_product;
--   update storage.buckets set file_size_limit = 52428800 where id = 'product-images';
