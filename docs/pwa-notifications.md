# Ezial — application installable (PWA) et notifications Web Push

État au 18 novembre 2026. Hébergement : Cloudflare Pages (projet `ezial`) ;
données, comptes et envois : Supabase (projet `lkqezdrdbogtborgjvlw`).

## 1. Installation (iPhone, Android)

| Élément | Fichier | Rôle |
| --- | --- | --- |
| Manifeste | `public/manifest.webmanifest` | Nom « Ezial Marketplace » (« Ezial » sous l'icône), `display: standalone`, pas d'orientation imposée, couleur bordeaux `#5A0D1E`, icônes 192 / 512 / adaptative 512. |
| Icônes | `public/apple-touch-icon.png` (180), `public/icons/` | Papillon officiel crème sur fond bordeaux, générées par `scripts/generate-app-icons.py` depuis `docs/identite/logo-ezial-source.png`. |
| Balises | `index.html` | `apple-touch-icon`, `manifest`, `apple-mobile-web-app-capable`, `mobile-web-app-capable`, barre d'état « default », titre « Ezial ». Recopiées dans les pages statiques SEO. |
| Service worker | `public/sw.js` | Notifications + page hors connexion. Aucun cache de données. |

Aucune fenêtre d'installation n'est imposée par le site : Android propose
l'installation via le menu de Chrome (et son propre bandeau) ; sur iPhone,
Partager → « Sur l'écran d'accueil ».

Sous-domaines `admin.ezial.net` et `livreur.ezial.net` : même build, donc même
manifeste ; chacun est une application distincte pour le navigateur (origine
différente), qui s'ouvre sur son espace.

### Ezial Admin : icône et favicon propres (19 nov. 2026)

`admin.ezial.net` reçoit sa propre identité, pour ne pas être confondue avec Ezial
Marketplace une fois installée : papillon **bordeaux sur fond crème** (Marketplace :
papillon crème sur fond bordeaux). Même symbole officiel (`docs/identite/logo-ezial-source.png`),
jamais redessiné ; seules les couleurs changent (charte : crème `#F8F3EE`, bordeaux `#5A0D1E`,
fond et symbole unis, aucune inscription).

| Élément | Marketplace (inchangé) | Admin |
| --- | --- | --- |
| Manifeste | `/manifest.webmanifest` (« Ezial Marketplace ») | `/manifest-admin.webmanifest` (« Ezial Admin ») |
| Icônes | `/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | `/icons/admin/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` |
| iPhone / iPad | `/apple-touch-icon.png` | `/icons/admin/apple-touch-icon.png` |
| Favicon | `/favicon.ico` (16, 32, 48 px), `/favicon-32x32.png`, `/favicon-16x16.png` | `/icons/admin/favicon.ico`, `favicon-32x32.png`, `favicon-16x16.png` |

- Choix de l'identité : `src/lib/pwaIdentity.ts`, appelé au démarrage (`src/main.tsx`) ;
  seul l'hôte `admin.*` change les balises `<link rel="manifest">`, `rel="icon"`,
  `rel="apple-touch-icon"` et les titres d'application. Tout autre hôte (www.ezial.net,
  livreur.ezial.net, aperçus Cloudflare, local) garde l'identité d'origine. Aucun effet sur
  l'interface, les fonctions ni les droits.
- Génération : `python3 scripts/generate-app-icons.py --admin` (icônes d'application Admin) et
  `--favicons` (favicons Marketplace et Admin). Sans option, le script régénère les icônes
  Marketplace existantes (non modifiées).
- Favicon : pas de `favicon.svg`. Un SVG fidèle demanderait de redessiner le symbole ; le
  fichier officiel est un PNG. Le navigateur utilise l'ICO / le PNG, que Google accepte
  (multiple de 48 px, adresse indiquée par `<link rel="icon">` dans la page d'accueil).
- Icône des notifications Web Push : inchangée (`/icons/icon-192.png`, dans `public/sw.js`).

#### Actualiser l'icône sur les appareils déjà équipés

Les nouvelles adresses portent `?v=2` (favicons, apple-touch-icon) et l'icône Admin est un
nouveau fichier : aucun cache du site ne retient l'ancienne. L'icône d'écran d'accueil, elle,
est une copie enregistrée par le téléphone au moment de l'ajout :
- **iPhone / iPad** : supprimer l'icône « Ezial » (Admin) de l'écran d'accueil (appui long,
  « Supprimer l'app »), ouvrir `admin.ezial.net` dans Safari, Partager, « Sur l'écran d'accueil ».
  Le nom proposé est « Ezial Admin ».
- **Android (Chrome)** : l'application installée se met à jour seule sous 1 à 3 jours ; pour
  l'avoir tout de suite, la désinstaller puis la réinstaller depuis le menu de Chrome.
- **Favicon dans les onglets** : si l'ancienne lettre « E » s'affiche encore, fermer l'onglet,
  vider le cache du navigateur pour le site, ou ouvrir `admin.ezial.net/favicon.ico?v=2`.
- **Google** : l'actualisation du favicon dans les résultats de recherche prend de quelques
  jours à quelques semaines ; on peut demander une nouvelle exploration de la page d'accueil
  dans la Search Console.


### Ezial Livreur : icône propre (21 nov. 2026)

`livreur.ezial.net` reçoit sa propre identité : l'icône fournie par la propriétaire (livreur à
scooter crème sur fond rouge, sans texte ni papillon ; source `docs/identite/icone-livreur-source.png`).

| Élément | Fichier |
| --- | --- |
| Manifeste | `/manifest-livreur.webmanifest` (« Ezial Livreur », `standalone`, thème et fond `#8C1024`) |
| Icônes Android | `/icons/livreur/icon-192.png`, `icon-512.png` (carré arrondi, coins transparents) |
| Icône adaptative | `/icons/livreur/icon-maskable-512.png` (pictogramme dans le cercle sûr de 40 %) |
| iPhone / iPad | `/icons/livreur/apple-touch-icon.png` (180 px, coins remplis : iOS arrondit lui-même) |
| Notifications | icône `/icons/livreur/icon-192.png` sur `livreur.*` (`public/sw.js`) |

- Génération : `python3 scripts/generate-livreur-icons.py` (numpy + Pillow). Le dessin et les
  couleurs ne sont pas modifiés ; seul le pourtour est adapté à chaque système.
- Identité appliquée par `src/lib/pwaIdentity.ts` (hôte `livreur.*` seulement) ; favicon inchangé.
- Autre origine que www et admin : installer Ezial Livreur ne remplace aucune autre application.
- Icône déjà installée : l'icône d'écran d'accueil est une copie faite à l'installation. iPhone :
  supprimer l'icône puis la rajouter depuis Safari. Android : se met à jour seule sous quelques
  jours, ou désinstaller puis réinstaller depuis Chrome.

## 2. Mises à jour sans réinstallation

- Chaque build porte un identifiant (`CF_PAGES_COMMIT_SHA`, sinon l'heure),
  embarqué dans le JS et publié dans `/version.json` (en-tête `no-store`).
- L'application vérifie `/version.json` 10 s après l'ouverture, à chaque retour
  au premier plan, au retour du réseau et toutes les 30 min
  (`src/lib/appUpdate.ts`). Si une autre version est en ligne, un bandeau
  discret propose « Mettre à jour » (`src/components/UpdateBanner.tsx`).
- **Jamais de rechargement imposé.** Le bandeau n'apparaît pas pendant le
  paiement (`/checkout`), la confirmation / le suivi de commande, le panier,
  l'abonnement vendeur ou la saisie d'un produit (`src/lib/appUpdateCore.ts`).
- Fichiers d'une ancienne version supprimés par un déploiement (navigation vers
  une page jamais chargée) : un seul rechargement automatique, au plus une fois
  par minute ; au-delà, un écran « Recharger » remplace l'écran blanc
  (`src/components/AppErrorBoundary.tsx`).
- Le service worker se met à jour seul (`updateViaCache: 'none'`,
  `skipWaiting`) sans recharger aucune page : il ne sert aucun fichier de
  l'application. L'ancien rechargement automatique de tous les onglets à chaque
  nouveau worker a été supprimé (il pouvait couper un paiement).
- Cache HTTP Cloudflare (`public/_headers`) : `/assets/*` un an (noms de
  fichiers versionnés) ; `sw.js`, `/`, `/index.html`, les trois manifestes et
  `offline.html` revalidés à chaque fois (les autres pages HTML : réglage par
  défaut de Cloudflare Pages, `max-age=0, must-revalidate`) ; `version.json`
  jamais en cache.
- Anciens workers déjà installés (dont le tout premier, qui gardait les
  fichiers `/assets` dans `ezial-static-v1`) : tous faisaient `skipWaiting` et
  laissaient passer `sw.js` au réseau ; ils sont remplacés sans désinstaller,
  et `activate` efface leurs caches. « Mettre à jour » envoie aussi
  `SKIP_WAITING` à un worker resté en attente (cas rare).

### Actualiser dans l'application installée (24 nov. 2026)

En mode écran d'accueil, ni l'iPhone ni Chrome Android n'offrent de geste
« tirer pour actualiser » ni de bouton recharger. Ezial en fournit un, actif
**seulement dans l'application installée** (le navigateur garde le sien) :

- Geste (`src/components/PullToRefresh.tsx`, règles pures dans
  `src/lib/pullToRefreshCore.ts`) : page tout en haut, un doigt, mouvement
  nettement vertical vers le bas, seuil de 72 px après amortissement, petit
  indicateur rond. Ignoré sur un carrousel (geste horizontal), un champ de
  saisie, une fenêtre modale, un tiroir, la barre d'achat ou tout élément fixe,
  une liste défilante qui n'est pas en haut.
- **Jamais** au paiement, sur une commande, le panier ou une saisie vendeur
  (mêmes pages que le bandeau, `isSensitivePath`), ni quand un formulaire a été
  modifié sans être enregistré (saisie repérée par `src/lib/pageRefresh.ts` ;
  recherche, cases à cocher et listes de filtres exclues).
- Entrée « Actualiser » (`src/components/RefreshMenuButton.tsx`) : menu de la
  marketplace, menu mobile Admin, barre du haut Livreur. Absente aux pages
  sensibles ; demande confirmation si des modifications ne sont pas enregistrées.

### Barre d'état (haut de l'écran) : blanche

Bande rouge signalée en haut de l'iPhone 13 : la balise `theme-color` valait
bordeaux `#5A0D1E` (rubis `#8C1024` sur `livreur.*`, via `pwaIdentity.ts`) alors
que tous les en-têtes sont blancs ; Safari (iOS 15 et suivants) et l'application
installée peignent la zone de la barre d'état avec cette couleur. Elle vaut
maintenant `#FFFFFF` partout (le fond de `html` aussi, pour le rebond), la page
hors connexion `#F8F3EE` (son fond). Les manifestes gardent leurs couleurs
(écran de démarrage Android) ; une fois la page chargée, Android suit la balise.

## 3. Données sensibles

Le service worker n'intercepte que les navigations (ouverture de page) : réseau
d'abord, page hors connexion seulement en cas d'échec. Il ne lit ni ne garde
aucune réponse Supabase, session, commande ou paiement. Seul `/offline.html`
(page statique) est en cache (`ezial-offline-v1`).

## 4. Notifications Web Push — ce qui existe déjà en production

Architecture standard Web Push + VAPID, sans Firebase :

1. **Abonnement** (navigateur) : bouton « Activer » explicite
   (`src/components/NotificationOptIn.tsx`, et la fenêtre dédiée aux vendeurs et
   livreurs `NotificationGateModal.tsx`). Clé publique VAPID dans
   `VITE_VAPID_PUBLIC_KEY`.
2. **Stockage** : `public.push_subscriptions` (un appareil = une ligne,
   plusieurs appareils par compte, RLS « chacun ses abonnements »).
3. **Déclenchement** : les déclencheurs de notification de la base
   (`notify_user`, `notify_admins`) écrivent la notification dans l'application
   ET appellent `public.push_notify` → fonction `send-push` (secret partagé lu
   dans le Vault, clé VAPID privée dans les secrets Supabase, jamais dans le site).
4. **Nettoyage** : `send-push` supprime un abonnement expiré (réponse 404/410).

Événements déjà reliés (déclencheurs existants, non modifiés) :

| Destinataire | Événement | Lien |
| --- | --- | --- |
| Acheteur | Commande confirmée, statut de la commande, mission de livraison (en route, livrée), réclamation | `/commandes`, `/compte/commandes` |
| Vendeur | Nouvelle commande, commande annulée, stock faible, statut de la boutique, nouvelle réclamation | `/pro/seller/...` |
| Livreur | Nouvelle mission disponible, mission attribuée / annulée | `/pro/driver` |
| Administrateur | Nouvelle commande, commande prête, paiement d'abonnement | `/pro/admin/...` |

**L'envoi automatique est donc déjà câblé** ; il n'envoie rien tant qu'aucun
appareil n'est abonné (0 abonnement au 18/11/2026) et que les clés VAPID ne
sont pas configurées. Cette PR ne l'active ni ne le désactive.

## 5. Ce que cette PR ajoute pour les notifications

- iPhone : dans Safari (sans écran d'accueil), une explication remplace le
  bouton (« ajoutez Ezial à l'écran d'accueil ») — iOS n'autorise les
  notifications qu'aux applications installées (iOS 16.4+).
- Appareil partagé : à la déconnexion, l'appareil est retiré des abonnements du
  compte (`forgetThisDeviceOnSignOut`) ; « Activées » ne s'affiche que si CET
  appareil est abonné pour CE compte.
- Lien `/compte/commandes` (utilisé par les notifications acheteur) : il menait
  à une page introuvable, il ouvre maintenant « Mes commandes ».
- `sw.js` accepte un `tag` facultatif : deux notifications de même `tag` se
  remplacent au lieu de s'empiler (anti-doublon sur l'appareil).
- Migration proposée **non exécutée** : `docs/sql/push-appareils.sql`
  (fonction `register_push_subscription` qui rattache l'appareil au compte
  connecté, colonnes `user_agent` / `last_seen_at`). Le site l'utilise
  automatiquement si elle existe, sinon il garde l'enregistrement actuel.

## 6. Configuration à faire (par la propriétaire, après validation)

1. Générer une paire de clés VAPID (une fois) : `npx web-push generate-vapid-keys`.
2. Cloudflare Pages → `ezial` → Settings → Variables : `VITE_VAPID_PUBLIC_KEY`
   = clé **publique**, en Production ET en Preview, puis redéployer.
3. Supabase → Edge Functions → Secrets : `VAPID_PUBLIC_KEY`,
   `VAPID_PRIVATE_KEY` (clé **privée**, uniquement ici), `VAPID_SUBJECT`
   (`mailto:contact@ezial.net`). `PUSH_WEBHOOK_SECRET` existe déjà (Vault).
4. Exécuter `docs/sql/push-appareils.sql` (facultatif mais recommandé).

Changer la paire VAPID invalide tous les abonnements existants : à faire une
seule fois.

## 7. Évolutions proposées (non faites)

- **Paiement confirmé** (acheteur) : aucun déclencheur dédié aujourd'hui ; à
  relier au retour de paiement (`payment-webhook`) quand l'API Wave / Orange
  Money sera branchée.
- **Rappel de préparation** (vendeur) : tâche planifiée (pg_cron) qui appelle
  `notify_user` pour les commandes payées non préparées depuis X heures (le
  rappel WhatsApp de 24 h existe déjà et peut servir de modèle).
- **Anti-doublon serveur** : passer un `tag` (type + commande/mission) de
  `notify_user` à `push_notify` puis à `send-push` (le service worker l'accepte
  déjà).

## 8. Tests manuels sur appareils (à faire, non réalisés)

iPhone (Safari, iOS 16.4+) :
1. Ouvrir ezial.net → Partager → « Sur l'écran d'accueil » : icône papillon, nom « Ezial ».
2. Ouvrir depuis l'icône : plein écran, sans barre Safari ; navigation, panier, connexion.
3. Avec les clés VAPID configurées : Mon compte → Mes informations → « Activer » → autoriser ; passer une commande test → notification reçue, clic → bonne page.
4. Après un déploiement : rouvrir l'app → bandeau « Nouvelle version » → « Mettre à jour ».

Android (Chrome) :
1. Menu ⋮ → « Installer l'application » (ou bandeau Chrome) : icône adaptative correcte.
2. Ouverture plein écran, liens et retour arrière.
3. Notifications (mêmes étapes que l'iPhone, sans écran d'accueil obligatoire).
4. Mode avion : page « Vous êtes hors connexion », puis « Réessayer ».
