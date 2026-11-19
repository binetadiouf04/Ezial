# Titres et descriptions SEO — source unique

Mise à jour du 19 novembre 2026.

## Où se trouvent les textes

- `src/shared/siteInfo.js` : constante `SEO` (titre et description de l'accueil), construite avec `DELIVERY` (dès 800 FCFA, 4 à 48 h). Ne jamais recopier ces chiffres à la main ailleurs.
- `src/shared/seoText.js` : descriptions des catégories, sous-catégories, liste des boutiques, produit ou boutique sans description, pages utilitaires. Chaque description nomme sa page ; aucune n'est identique à une autre ; 160 caractères au plus.
- `src/shared/infoPages.js` : titres et descriptions des pages Livraison, Paiement, À propos, etc.
- `index.html` : reprend à l'identique le titre, la description, Open Graph et Twitter de l'accueil (HTML initial lu par les robots). Le test `src/shared/seo.test.mjs` échoue si les textes divergent de `SEO`.
- `scripts/prerender-seo.mjs` : génère les pages statiques (titres, descriptions, canonical, Open Graph, Twitter, JSON-LD, sitemap) avec les mêmes fonctions que le site.

## Textes officiels de l'accueil

- Titre : « Ezial, mode, beauté et accessoires à Dakar »
- Description : « Ezial, marketplace 100 % en ligne réunissant plusieurs boutiques à Dakar. Mode, beauté, parfumerie et accessoires. Livraison dès 800 FCFA en 4 à 48 h. »

## Règles

- Pas de « cheveux » dans les descriptions et métadonnées générales (le test le vérifie).
- Titres éditoriaux en « Ezial, … » plutôt que « Ezial — … ».
- Titres propres aux produits, catégories et boutiques conservés ; la page Paiement garde ses informations fonctionnelles.
