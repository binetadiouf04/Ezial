# Audit de sécurité Ezial — 12 novembre 2026

Audit en lecture seule de la production Supabase (`lkqezdrdbogtborgjvlw`), du code (`main`, commit `bf0fa27`) et du dépôt GitHub. Aucun test intrusif n'a été lancé sur la production : les constats côté base viennent de la lecture des politiques RLS, des droits, des déclencheurs et du code des fonctions.

**Hébergement réel :** le site est aujourd'hui servi par **Cloudflare Pages** (offre gratuite), pas par GitHub Pages : l'ancien déploiement GitHub Pages a été retiré et ne subsiste qu'un workflow manuel inactif. Cela ne coûte rien et ne change rien aux protections ci-dessous. Les API Supabase sont appelées directement par le navigateur : la vraie barrière de sécurité est donc dans Supabase (politiques RLS, fonctions, droits).

**Périmètre retenu (13 novembre 2026) :** protections natives et automatiques, sans agent de surveillance permanent, sans serveur, sans service payant.

**Suivi à jour de chaque constat :** `docs/securite/suivi-vulnerabilites.md`.

**Aucun système n'est sûr à 100 %.** Ce rapport distingue ce qui est vérifié, ce qui est corrigé, ce qui est préparé et ce qui reste à configurer.

## Critique

Aucune faille critique confirmée (pas de clé secrète exposée, pas d'accès administrateur ouvert, pas de fuite massive de données). Les paiements en ligne ne sont pas encore activés.

## Élevée

| # | Constat | Preuve | Correction |
|---|---|---|---|
| E1 | **Compte livreur prenable avec le seul nom d'utilisateur** (risque accepté le 12 nov. 2026 : rien n'est changé). Tant qu'un livreur n'a pas créé son NIP, n'importe qui connaissant (ou devinant) son nom d'utilisateur peut choisir le NIP et obtenir sa session : missions, noms, téléphones et adresses des clients. | `set_driver_pin(username, pin)` sans preuve ; `driver_login_status` répond « needs_pin_setup » sans session. 1 livreur est dans cet état aujourd'hui. Choix fait le 8 nov. 2026 (retrait du code d'activation). | Aucune (choix de la propriétaire). Précaution gratuite : créer le NIP avec le livreur juste après avoir créé son compte. |
| E2 | **Le code de livraison du client est lisible par le livreur**, et par tout compte connecté tant que la mission est « disponible ». Aucune limite d'essais ; code à 4 chiffres tiré avec `random()`. La confirmation de livraison déclenche l'éligibilité des versements. | Politique « Drivers can view available or own missions » (tout `authenticated`), colonne `delivery_code` lisible ; `orders.delivery_code` lisible par les livreurs ; `driver_complete_delivery` sans compteur. | Codes déplacés dans une table privée, colonnes publiques vidées, compteur d'échecs avec blocage et alerte, missions disponibles visibles des seuls livreurs. |
| E3 | **Un vendeur peut se déclarer « boutique officielle »** (`shops.is_official`) : commission 0 %, Ezial Plus permanent, limite de produits levée. Il peut aussi modifier `active_product_limit`, `seller_code`, `suspension_reason`. | Politique « Seller can update own shop » sur toutes les colonnes ; le déclencheur ne protège que `status`. | Déclencheur qui verrouille ces colonnes pour les non-administrateurs. |
| E4 | **Un livreur peut modifier sa rémunération** (`delivery_missions.driver_earning`) et tout statut sauf « livrée » ; il peut modifier librement les arrêts de sa mission. | Politique « Driver can update own mission » sans verrou de colonnes. | Verrou des colonnes et transitions de statut autorisées seulement. |
| E5 | **Aucune double authentification pour l'administrateur** (0 facteur enregistré, 1 seul administrateur). Un mot de passe volé suffit pour tout l'espace admin. | `auth.mfa_factors` vide. | Double authentification (TOTP), gratuite dans Supabase : à développer sur validation. En attendant : mot de passe long et unique, réservé à Ezial. |
| E6 | **Aucune sauvegarde automatique** : l'offre Supabase gratuite n'en fournit pas (documentation officielle : sauvegardes quotidiennes à partir de l'offre Pro). Les fichiers du Storage ne sont jamais inclus dans les sauvegardes. | Documentation Supabase « Database Backups ». | Passer à l'offre Pro (7 jours de sauvegardes) ou export régulier `supabase db dump` hors site ; procédure de restauration documentée. |

## Moyenne

| # | Constat | Correction |
|---|---|---|
| M1 | **Stockage sans limite** : buckets `product-images`, `Shop-images`, `secure-photos` sans type ni taille imposés (tout fichier, toute taille, y compris HTML/SVG). | Types et taille maximale imposés sur les buckets. |
| M2 | **Aucun en-tête de sécurité** (CSP, anti-clickjacking, `nosniff`, `Referrer-Policy`, HSTS). Les jetons de session sont en `localStorage`. | `public/_headers` : en-têtes + CSP en mode rapport d'abord. |
| M3 | **Statut de commande libre pour le vendeur** (`order_shops.status` : n'importe quel texte, n'importe quelle transition). L'argent n'est pas libéré par ce statut, mais le client reçoit de fausses notifications. | Transitions autorisées seulement (confirmée → en préparation → prête). |
| M4 | **Sous-catégorie produit non contrainte**, utilisée telle quelle comme chemin de fichier par le build statique : un vendeur peut écraser une page du site au prochain build. Le slug, lui, est fixé par le serveur (vérifié). | Contrainte de format en base + filtre dans `scripts/prerender-seo.mjs`. |
| M5 | `send-push` et `send-push-campaign` acceptent tout appel si le secret n'est pas défini ; comparaison non constante. | Refus si secret vide, comparaison à durée constante. |
| M6 | `calculate-delivery-fee` appelable sans compte ni limite : coût Google Routes abusable. | Session exigée, coordonnées bornées. |
| M7 | **Avis sans achat vérifié** : tout compte peut noter tout produit (un avis par produit). | Avis réservés aux clients ayant reçu le produit (décision du 12 nov. 2026). |
| M8 | Force brute : NIP livreur à 4 chiffres (5 essais / 15 min), connexion vendeur par nom d'utilisateur (10 / 15 min), code promo sans limite, énumération des noms d'utilisateur livreur. | Blocages temporaires déjà en place ; tentatives sur les champs protégés et codes de livraison incorrects désormais journalisés. |
| M9 | Deux définitions d'« administrateur » (`admins` et `profiles.role = 'admin'`). Le rôle est protégé (vérifié), mais la double règle est fragile. | Table `admins` seule. |
| M10 | Protection contre les mots de passe compromis désactivée ; réglages Auth non lisibles par SQL. | À vérifier dans le tableau de bord Supabase. |

## Faible

- 4 fonctions de déclencheur sans `search_path` fixe.
- Colonnes de `shops` lisibles par tous (`owner_id`, `seller_code`, coordonnées GPS).
- Messages d'erreur internes renvoyés au navigateur ; CORS `*` sur les fonctions Edge.
- Brouillon de commande (nom, téléphone) conservé en `localStorage`.
- Résidus GitHub Pages (`public/CNAME`, workflow manuel).
- `npm audit` : 22 alertes, 21 en outils de développement, 1 dépendance transitive absente du navigateur.
- Politique de lecture des photos de réclamation erronée (compare le nom de la boutique) : défaut fonctionnel, fermé par défaut.
- Politiques du bucket `shop-images` qui ne correspondent pas au nom réel `Shop-images`.

## Vérifié sans défaut

- RLS activée sur toutes les tables publiques ; les tables sans politique sont inaccessibles.
- Aucune clé `service_role`, aucun secret dans le dépôt ni dans son historique.
- Aucun point d'injection XSS dans le code (Markdown rendu en éléments React, liens filtrés).
- `create_order` : prix, stock, commission, promotion et frais de livraison recalculés par le serveur ; identité tirée de la session ; la distance fournie par le navigateur ne peut pas faire baisser les frais.
- Un acheteur ne lit que ses commandes ; un vendeur ne lit et n'écrit que sa boutique et ses produits ; revenus par boutique.
- `profiles.role` non modifiable par l'utilisateur, ni à l'inscription ; table `admins` sans écriture possible.
- Abonnements et paiements d'abonnement : aucune écriture directe, montants imposés par le serveur, confirmation réservée aux administrateurs.
- Fonctions de paiement préparées : identité et montants côté serveur, signature vérifiée avant lecture, anti-doublon ; aucune n'est déployée.

## Corrections préparées (rien n'est déployé sans validation)

| Correction | Constats couverts | Où | État |
|---|---|---|---|
| Migration SQL de corrections | E2, E3, E4, M1, M3, M4, M7 + journal des tentatives | `docs/sql/securite-corrections.sql` (retour arrière fourni) | Testée sur une base locale reproduisant les politiques de production : 50 contrôles réussis, 0 échec ; rejouable ; retour arrière testé. **Pas exécutée en production.** |
| Application livreur : le code de livraison n'est plus jamais lu par le navigateur | E2 | `src/lib/supabaseDriverMissions.ts` | Sur la branche de travail. **À publier avant la migration.** |
| En-têtes de sécurité (CSP en mode rapport, anti-clickjacking, HSTS) | M2 | `public/_headers` | Sur la branche de travail. |
| Build statique : chemins contrôlés | M4 | `scripts/prerender-seo.mjs`, `scripts/seo/safe-segment.mjs` | Sur la branche de travail. |
| Message clair quand un avis est refusé | M7 | `src/lib/supabaseReviews.ts` | Sur la branche de travail. |

Non traités, à faire sur validation : E5 (double authentification admin), M5 et M6 (fonctions Edge à redéployer), M9, constats « Faible ».

## Coûts

Toutes les corrections ci-dessus : **0 FCFA**. Deux protections seulement sont payantes chez Supabase et ne sont donc **pas** recommandées aujourd'hui : les sauvegardes automatiques et la protection contre les mots de passe compromis (offre Pro, 25 $ par mois). L'alternative gratuite pour les sauvegardes est un export manuel régulier (voir `docs/securite/actions-manuelles.md`).

## Non vérifiable d'ici

Réglages Supabase Auth (confirmation d'e-mail, longueur minimale, limites de débit, durée de session), protection de branche GitHub, secrets des fonctions Edge, configuration Cloudflare (WAF, règles). Voir `docs/securite/actions-manuelles.md`.
