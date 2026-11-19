# Ezial — règles de travail

Marketplace React + TypeScript + Vite + Tailwind, backend Supabase (projet `lkqezdrdbogtborgjvlw`), déployée sur Cloudflare Pages (`npm run build`, sortie `dist`). Toutes les réponses et tous les textes visibles par les utilisateurs sont en français.

## Bug de code ou problème de configuration : toujours trancher avant de corriger

Quand quelque chose échoue (build, déploiement, fonctionnalité), ne jamais supposer que c'est un bug de code. Suivre cet ordre :

1. **Lire le message d'erreur exact** (log de build, console), pas seulement le statut global.
2. **Vérifier le code dans le repo** : ce qui est réellement sur GitHub, fichiers de config commités (`.env*`, Wrangler, `_redirects`), noms de variables cohérents partout.
3. **Reproduire localement** avec exactement les mêmes conditions que la plateforme (mêmes variables présentes/absentes). Si la reproduction donne le même résultat, le comportement du code est établi.
4. **Vérifier les prérequis de la plateforme** (Cloudflare, Supabase, GitHub) : variables par environnement (Production ≠ Preview), domaines, réglages de build. S'appuyer sur la documentation officielle, pas sur la mémoire.
5. **Croiser avec des données réelles** quand c'est possible (logs Supabase, logs de build) plutôt que des hypothèses.
6. Conclure explicitement : « bug de code » ou « problème de configuration », avec la preuve. Ne corriger le code que si c'est le code.

## La personne travaille souvent sur tablette (iPad)

Quand une option, un menu ou un bouton attendu n'apparaît pas sur une capture d'écran, toujours évoquer que l'affichage tablette peut le masquer (exemple réel : le sélecteur Production/Preview de Cloudflare n'apparaît qu'en mode paysage). Proposer : passer en paysage, « Demander le site pour ordinateur » dans Safari, dézoomer, ou utiliser un ordinateur.

## Autonomie

Avancer sans attendre de validation sur tout ce qui est réversible et à portée (lecture, code, build, tests, commits et push sur la branche de travail). S'arrêter uniquement pour ce qui exige vraiment la personne : actions dans un dashboard externe auquel on n'a pas accès, décisions qui changent une règle établie, actions irréversibles.

Utiliser des sous-agents pour aller plus vite dès qu'une tâche se découpe en parties indépendantes (fichiers distincts), en parallèle. Garder la coordination : consignes précises, aucun commit par les sous-agents, relecture et tests de leur travail avant de l'annoncer.

## Règles permanentes

- Travailler sur la branche de développement. **Accord permanent de la personne (8 nov. 2026) : publier ses changements sans attendre son accord**, une fois typecheck, lint, build et tests passés, via une pull request fusionnée dans `main` (jamais de push direct sur `main`). Les règles sur les migrations SQL ci-dessous restent valables : une interface qui dépend d'une migration n'est publiée qu'après son exécution en production. Après chaque publication, dire à la personne ce qu'elle doit vérifier dans Cloudflare.
- `www.ezial.net` : ne pas modifier le DNS ni la configuration du domaine.
- Ne jamais contourner la RLS depuis le frontend ; la clé `service_role` ne doit jamais atteindre le frontend.
- Migrations SQL : les donner en texte brut dans la conversation pour que la personne les exécute ; ne jamais déployer une interface qui dépend d'une migration pas encore en production.
- Ne jamais inventer de contenu (avis, notes, stock, produits de démo) ; ne jamais supprimer de données sans avoir vérifié qu'il s'agit de données de test.
- Distinguer ce qui a été testé sur la branche/preview de ce qui est réellement en ligne ; ne jamais annoncer qu'un problème est résolu sans l'avoir vérifié.
- **Fournisseur (demande de la personne, 19 nov. 2026)** : le champ « Fournisseur » est réservé à Ezial Boutique (compte officiel, `shops.is_official`), jamais proposé aux autres vendeurs, et imposé par la base (RLS `product_suppliers`, verrou sur `is_official`). Son nom est affiché aux clients sur la fiche produit (fonction serveur `public_product_suppliers`, nom seulement, jamais de coordonnées). **Pas de précommande ni de produit « Sur commande »** : tout produit en vente est disponible selon son stock réel (`create_order` refuse au-delà).
- **Textes du site : toujours optimisés SEO, AEO et GEO** (demande de la personne, 11 nov. 2026), pour tout texte visible ajouté ou réécrit sur le site :
  - SEO : un seul H1, titres H2/H3 hiérarchisés, `<title>` ≤ 60 caractères et description ≤ 160 avec les mots recherchés (« Sénégal », « Dakar », catégorie, « vendre / acheter en ligne »), URL canonique, page présente dans la version statique (`scripts/prerender-seo.mjs`) et le sitemap.
  - AEO : titres sous forme de questions réelles quand c'est pertinent, réponse directe dans la première phrase, FAQ balisée `FAQPage` lorsque la page répond à des questions.
  - GEO : phrases autonomes et factuelles, citables seules, qui nomment les entités (Ezial, Dakar, Sénégal, FCFA, chiffres tirés de `src/shared/plans.js` et `src/shared/siteInfo.js`) ; données structurées schema.org adaptées.
  - Jamais de bourrage de mots-clés ni d'affirmation non vérifiée (la règle « ne jamais inventer » prime).

## Identité visuelle (fournie par la personne, à respecter pour tout changement de design)

- Couleurs : bordeaux `#5A0D1E`, rouge rubis `#8C1024`, crème `#F8F3EE`, beige `#D8C6C2`.
- Typographies : le **logo « EZIAL » est en Playfair Display** (validé). Les titres et textes du site restent en Cormorant Garamond + Inter (la personne a refusé Playfair pour les écritures du site).
- Positionnement : « La marketplace sénégalaise qui rassemble vos boutiques préférées. » Promesse : Découvrir, Commander, Se faire livrer.
- Style : fonds bordeaux avec ondulations satinées, motif géométrique beige, icônes en trait fin, coins arrondis.
- **Logo : ne jamais ajouter le papillon.** Le logo reste le mot « EZIAL » seul ; le symbole papillon de la planche d'identité n'est pas utilisé (ni dans le logo, ni en favicon, ni en icône d'application) sans demande explicite.
  - **Exception demandée par la personne (18 nov. 2026) :** le symbole papillon-E (fichier fourni, `docs/identite/logo-ezial-source.png`) sert d'icône d'écran d'accueil iPhone / Android (`public/apple-touch-icon.png`, `public/icons/`, `public/manifest.webmanifest`, générés par `scripts/generate-app-icons.py`). Le logo du site et les en-têtes restent inchangés.
  - **Extension demandée par la personne (19 nov. 2026) :** le même symbole officiel (jamais redessiné, seulement recoloré) sert aussi de **favicon** (onglets, favoris, résultats de recherche : `public/favicon.ico`, `favicon-*.png`) et d'icône de l'application **Ezial Admin** (`admin.ezial.net`, couleurs inversées : papillon bordeaux sur fond crème, dans `public/icons/admin/` et `public/manifest-admin.webmanifest`, identité appliquée par `src/lib/pwaIdentity.ts`). Ezial Marketplace et Ezial Pro gardent leurs icônes. Toujours sans texte « EZIAL ».
  - **Extension demandée par la personne (19 nov. 2026) :** le même symbole officiel, en crème uni sur **fond rouge rubis `#8C1024`**, sert d'**image d'aperçu des liens** partagés (WhatsApp, iMessage, réseaux : `public/ezial-partage.png`, 1200×630, générée par `scripts/generate-app-icons.py --partage`, référencée par `og:image` / `twitter:image` dans `index.html`, `src/lib/seoHead.ts` et `scripts/prerender-seo.mjs`). Elle remplace l'image « Image indisponible » pour l'accueil et les pages sans photo ; l'aperçu d'un lien Admin garde l'icône Ezial Admin. Toujours sans texte.
- **Application installable (PWA), demandée le 18 nov. 2026** (remplace la décision « site web uniquement » du 7 nov.) : manifeste `standalone`, service worker limité aux notifications et à la page hors connexion (jamais de cache de données), mises à jour proposées par un bandeau et jamais imposées (pas pendant un paiement ou une commande). Détails : `docs/pwa-notifications.md`.
- Appliquée au site : `burgundy` = bordeaux `#5A0D1E` (`burgundy-ruby` = rouge rubis `#8C1024`), `cream` `#F8F3EE`, `beige` `#D8C6C2` ; `font-display` = Cormorant Garamond, `font-logo` = Playfair Display (logo seulement), texte en Inter (voir `tailwind.config.js` et `src/index.css`).
