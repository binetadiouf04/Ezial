# Suivi exhaustif des vulnérabilités — Ezial (13 novembre 2026)

Reprend tous les constats de `audit-securite-2026-11.md`, y compris les faibles, plus trois constats apparus pendant les corrections. Aucune correction n'est en production : « préparé » veut dire présent dans la PR n°21, testé localement, en attente de validation.

**Statuts** — *Corrigé (PR)* : code prêt dans la PR n°21, actif dès la fusion. *Préparé (SQL)* : dans `docs/sql/securite-corrections.sql`, actif après exécution. *Préparé (fonction)* : code de fonction Edge prêt, actif après redéploiement de la fonction. *Proposé* : étude ou proposition remise, rien de développé. *Non traité* : recommandation seulement.

**Priorités** — **A** indispensable avant le lancement · **B** recommandé après le lancement · **C** facultatif.

## Gravité élevée

| # | Vulnérabilité | Impact réel sur Ezial | Statut | Risque restant | Correction recommandée | Coût | Priorité |
|---|---|---|---|---|---|---|---|
| E1 | Compte livreur sans NIP prenable avec le nom d'utilisateur | Accès aux missions : nom, téléphone, adresse des clients concernés | Non traité (choix de la propriétaire) | Entier jusqu'à la création du NIP ; réapparaît à chaque nouveau livreur ou réinitialisation | Créer le NIP avec le livreur dès la création du compte (procédure ci-dessous) | 0 | A |
| E2 | Code de livraison lisible par le livreur, sans limite d'essais | Livraison « confirmée » sans le client, donc versement vendeur déclenché à tort | Préparé (SQL) + Corrigé (PR) | Code à 4 chiffres : 5 essais puis 15 min de blocage | Exécuter la migration après la fusion | 0 | A |
| E3 | Vendeur qui se déclare « boutique officielle » | Commission 0 %, Ezial Plus permanent, limite de produits levée | Préparé (SQL) | Aucun connu | Exécuter la migration | 0 | A |
| E4 | Livreur qui modifie sa rémunération et ses statuts | Montants faux dans le suivi des livreurs | Préparé (SQL) | Aucun connu | Exécuter la migration | 0 | A |
| E5 | Pas de double authentification administrateur | Un mot de passe volé ouvre tout l'espace admin | Proposé (`proposition-double-authentification.md`) | Entier tant que non développé | TOTP Supabase + exigence côté serveur | 0 | A |
| E6 | Aucune sauvegarde automatique | Perte définitive des données en cas d'erreur ou de compromission | Proposé (`etude-sauvegardes.md`) | Entier | GitHub Actions, sauvegarde chiffrée dans un dépôt privé | 0 | A |

## Gravité moyenne

| # | Vulnérabilité | Impact réel | Statut | Risque restant | Correction recommandée | Coût | Priorité |
|---|---|---|---|---|---|---|---|
| M1 | Stockage sans limite de type ni de taille | Hébergement de fichiers malveillants, quota gratuit épuisé | Préparé (SQL) | Faible | Exécuter la migration | 0 | A |
| M2 | Aucun en-tête de sécurité | Site intégrable dans une page piégée ; pas de filet contre un futur XSS | Corrigé (PR), CSP en mode rapport | La CSP ne bloque rien tant qu'elle est en mode rapport | Passer la CSP en mode blocage après 2 semaines sans écart | 0 | A puis B |
| M3 | Statut de commande libre pour le vendeur | Fausses notifications au client | Préparé (SQL) | Aucun connu | Exécuter la migration | 0 | A |
| M4 | Sous-catégorie produit utilisée comme chemin de fichier | Un vendeur écrase une page du site au build | Préparé (SQL) + Corrigé (PR) | Aucun connu | Fusion puis migration | 0 | A |
| M5 | Fonctions de notification push ouvertes si le secret est vide | Notifications arbitraires vers n'importe quel utilisateur | Préparé (fonction), testé | Dépend du redéploiement | Redéployer `send-push` et `send-push-campaign` | 0 | A |
| M6 | Calcul des frais de livraison appelable sans compte ni limite | Quota Google épuisé par un tiers | Préparé (fonction) + Préparé (SQL), testé | Dépend du redéploiement | Redéployer `calculate-delivery-fee` | 0 | A |
| M7 | Avis sans achat vérifié | Faux avis | Préparé (SQL) + Corrigé (PR) | Aucun connu (création et modification couvertes) | Exécuter la migration | 0 | A |
| M8 | Force brute : NIP livreur à 4 chiffres, code promo sans limite, noms d'utilisateur livreur devinables | Compte livreur ou code promo deviné à la longue | Non traité (blocages 5 et 10 essais / 15 min déjà en place) | Modéré | Limite d'essais sur les codes promo ; réponse identique pour « introuvable » et « suspendu » | 0 | B |
| M9 | Deux définitions d'« administrateur » | Fragilité : une future erreur sur `profiles.role` ouvrirait des droits | Partiel : fonction de campagne corrigée (PR) | Faible (rôle protégé, vérifié) | Table `admins` seule dans les politiques restantes | 0 | B |
| M10 | Protection contre les mots de passe compromis désactivée | Mots de passe faibles acceptés | Non traité | Faible à modéré | Option payante (Supabase Pro) : non retenue. Gratuit : longueur minimale 10 dans les réglages Auth | 0 | A (réglage) |

## Gravité faible

| # | Vulnérabilité | Impact réel | Statut | Risque restant | Correction recommandée | Coût | Priorité |
|---|---|---|---|---|---|---|---|
| F1 | 4 fonctions de déclencheur sans chemin de recherche fixe | Théorique | Préparé (SQL) | Aucun | Migration | 0 | A |
| F2 | Colonnes de `shops` lisibles par tous (`owner_id`, identifiant de connexion `seller_code`, GPS) | Facilite le ciblage d'un compte vendeur | Non traité | Faible (mot de passe exigé, 10 essais / 15 min) | Vue publique à colonnes limitées ; touche le catalogue, à tester | 0 | B |
| F3 | Messages d'erreur internes renvoyés au navigateur | Détails techniques visibles | Partiel : `send-push` corrigé | Faible | Messages génériques dans `create-driver`, `delete-account` | 0 | C |
| F4 | CORS `*` sur les fonctions Edge | Faible (jeton exigé) | Non traité | Faible | Restreindre à `ezial.net` ; risque de casser les aperçus | 0 | C |
| F5 | Brouillon de commande conservé en `localStorage` | Nom et téléphone visibles sur un appareil partagé | Corrigé (PR) : effacé à la déconnexion | Aucun | — | 0 | A |
| F6 | Résidus GitHub Pages (`public/CNAME`, workflow manuel) | Un lancement manuel réactiverait Pages | Non traité | Très faible | Supprimer le workflow (votre accord requis) | 0 | C |
| F7 | 22 alertes `npm audit`, toutes dans les outils de build | Aucun sur le site servi aux clients | Non traité (mise à jour essayée puis annulée : plus de 1000 lignes modifiées) | Faible | Mise à jour testée à part, après le lancement | 0 | B |
| F8 | Politique de lecture des photos de réclamation erronée | Défaut fonctionnel : le vendeur ne voit pas les photos ; accès fermé, pas ouvert | Non traité | Aucun en sécurité | Corriger la politique après vérification du besoin | 0 | B |
| F9 | Politiques de stockage au nom `shop-images` sans bucket correspondant | Aucun | Non traité | Aucun | Nettoyage | 0 | C |
| F10 | Lien Markdown `/\hôte` accepté | Lien externe déguisé dans un article (rédigé par l'admin) | Corrigé (PR) | Aucun | — | 0 | A |
| F11 | Route de reprise lue sans contrôle | Redirection externe théorique | Corrigé (PR) | Aucun | — | 0 | A |
| F12 | Ancien lien `#//x` : page blanche | Gêne | Corrigé (PR) | Aucun | — | 0 | A |
| F13 | `.gitignore` incomplet pour les fichiers `.env` | Fuite accidentelle de clés | Corrigé (PR) | Aucun | — | 0 | A |
| F14 | L'inscription révèle qu'un e-mail a déjà un compte | Énumération de comptes | Non traité | Faible | Choix d'ergonomie ; à laisser | 0 | C |
| F15 | SVG accepté côté navigateur | Fichier actif hébergé | Couvert par M1 (refus par le serveur) | Aucun | — | 0 | A |
| F16 | Campagne push envoyée deux fois sur double clic | Doublon de notification | Préparé (fonction) | Dépend du redéploiement | Redéployer | 0 | A |
| F17 | Création de livreur : `_` traité comme joker | Faux « déjà utilisé » | Non traité | Aucun en sécurité | Correction simple au prochain redéploiement | 0 | C |
| F18 | URL d'images externes acceptées depuis la base | Pistage des visiteurs par un vendeur | Non traité | Faible | Bloqué par la CSP une fois en mode blocage | 0 | B |
| F19 | Jetons de session en `localStorage` | Vol de session en cas de XSS | Inhérent à Supabase ; atténué par la CSP | Faible | CSP en mode blocage | 0 | B |
| F20 | Changement de mot de passe sans l'ancien dans le flux de récupération | Session volée = mot de passe changé | Non traité | Faible | Réglage Auth « Secure password change » | 0 | B |
| F21 | `.claude/settings.json` autorise le SQL de production sans confirmation | Erreur d'outil | Non traité (réglage personnel) | Faible | Passer `execute_sql` et `apply_migration` en confirmation | 0 | C |
| F22 | Preuve photo renvoyée à chaque essai de code | Encombrement du stockage | Non traité (observé pendant les tests) | Très faible | Réutiliser la photo déjà envoyée | 0 | C |
| F23 | Les livreurs voient nom, téléphone et adresse des commandes des missions « disponibles », avant acceptation | Données client visibles par tous les livreurs | Non traité | Faible (livreurs recrutés par Ezial) | Masquer téléphone et adresse précise jusqu'à l'acceptation | 0 | B |

## Constats apparus pendant les corrections

| # | Constat | Impact réel | Statut | Correction recommandée | Coût | Priorité |
|---|---|---|---|---|---|---|
| N1 | Le dépôt GitHub est **public** : code, migrations et ce rapport sont lisibles par tous | Les failles non encore corrigées en production sont décrites publiquement | Non traité (décision de la propriétaire) | Passer le dépôt en privé (gratuit, Cloudflare Pages continue de fonctionner) ou, à défaut, déployer les corrections sans attendre | 0 | A |
| N2 | Tâches de régénération du site en échec depuis leur création | Pages statiques jamais régénérées automatiquement | Instructions remises (`actions-manuelles.md`) | Renseigner le Deploy Hook dans le coffre Supabase | 0 | A |
| N3 | Défaut trouvé dans ma première version de la migration (création de commande bloquée) | Aurait cassé les commandes en production | Corrigé avant toute exécution, grâce au test ajouté | Garder la suite de tests ; test réel après migration | 0 | — |

## E1 — précisions demandées

**Risque exact.** Tant que le compte est « en attente de NIP », la fonction de création de NIP n'exige que le nom d'utilisateur. Un tiers qui le connaît ou le devine choisit le NIP et obtient la session du livreur. Le site indique si un nom d'utilisateur existe et s'il attend son NIP.

**Ce que donne une session livreur (vérifié dans les politiques de production).** Les missions disponibles et les siennes ; pour ces missions : numéro de commande, prénom, nom, téléphone, quartier, adresse, position et consignes de livraison du client ; les arrêts et les boutiques concernées (données publiques) ; ses propres notifications et transactions. **Pas d'accès** aux autres clients, aux paiements, aux revenus des vendeurs, à l'administration, aux mots de passe. Après la migration : plus aucun code de livraison lisible, plus de rémunération modifiable.

**Créer le NIP en sécurité.**
1. Choisir un nom d'utilisateur non devinable (pas le prénom seul).
2. Créer le compte dans l'admin au moment où le livreur est avec vous, ou en ligne avec vous.
3. Le livreur ouvre l'espace livreur sur son propre téléphone, saisit son nom d'utilisateur et choisit lui-même son NIP, sans le dire ni l'écrire.
4. Vérifier dans l'admin que le compte n'est plus « en attente de NIP ».
5. Ne jamais laisser un compte en attente : s'il n'est pas activé tout de suite, le suspendre jusqu'au rendez-vous.
6. Même règle après « Réinitialiser le NIP ».
