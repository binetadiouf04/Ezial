# PR n°21 — validation finale et plan de déploiement

Ce document distingue ce qui est prouvé localement de ce qui est vérifié en réel. Le reste du document décrit la validation faite avant la fusion (13 novembre 2026).

## État de déploiement au 14 novembre 2026

| Étape | État | Vérification |
|---|---|---|
| Correctif des commandes clients (`commande-profil-client.sql`) | **En production** | 2 lignes « ok » ; les 5 clients inscrits ont leur ligne de profil ; déclencheur actif |
| PR n°21 fusionnée dans `main` (commit `edd52a7`) | **Fusionnée** | Aperçu Cloudflare du même code vert ; déploiement Production à confirmer dans Cloudflare par la propriétaire |
| Corrections de sécurité (`securite-corrections.sql`) | **En production** | 9 lignes « ok » ; les 15 fonctions installées sont identiques à l'octet près à celles testées localement ; rapport de sécurité Supabase sans erreur |
| Fonctions serveur `send-push`, `send-push-campaign`, `calculate-delivery-fee`, `create-driver` | **En production** | Démarrage et refus testés localement avec Deno, puis en réel : appel sans secret ou sans session refusé, appel de la tâche planifiée accepté |
| Commande de test complète en réel | À faire | — |
| Deploy Hook et fréquence SEO de 6 heures | À faire | Les deux tâches échouent encore |
| Double authentification administrateur | À activer par la propriétaire | Aucun appareil enregistré ; script serveur non exécuté |
| Sauvegardes | Non activées | Kit prêt |
| Dépôt GitHub en privé | À faire par la propriétaire | — |

Note de déploiement des fonctions serveur : chaque fonction est déployée avec son `index.ts` et une copie de `_shared/guards.ts` placée à côté (`./guards.ts`). C'est la seule différence avec les fichiers du dépôt. La fonction `create-driver` est déployée sous le nom `bright-function`.

## Conclusion

**PR n°21 prête à fusionner : OUI, avec réserves.**

1. **Avant ou juste après la fusion, exécuter `docs/sql/commande-profil-client.sql`.** Indépendamment de la PR, la production a aujourd'hui un défaut : un client inscrit ne peut pas valider de commande (les 5 clients inscrits sont concernés, vérifié le 13 novembre). Ce script le corrige ; il n'a besoin ni de la PR ni des autres scripts.
2. **Respecter l'ordre : site d'abord, base ensuite.** `docs/sql/securite-corrections.sql` ne s'exécute qu'après la fusion et le rechargement de l'espace livreur.
3. **Les preuves sont locales.** Une commande de test complète en réel reste nécessaire après la migration ; le script de retour arrière est prêt.
4. **Les fonctions serveur ne sont pas vérifiables ici en exécution** (pas d'environnement Deno) : syntaxe et contrôles testés, exécution à vérifier après redéploiement.
5. **La double authentification reste inactive** tant que vous n'avez pas enregistré d'appareil : la fusion ne change rien à votre connexion.

## Ce que contient la PR

| Élément | Actif quand |
|---|---|
| Code du site : application livreur, en-têtes de sécurité, build, liens, routes, brouillon de commande, message d'avis, écrans de double authentification (inertes sans appareil enregistré) | À la fusion (Cloudflare redéploie) |
| `docs/sql/commande-profil-client.sql` — correctif des commandes des clients inscrits | Quand vous l'exécutez |
| `docs/sql/securite-corrections.sql` — corrections de sécurité | Quand vous l'exécutez, après la fusion |
| `docs/sql/securite-mfa-admin.sql` — contrôle serveur de la double authentification | Quand vous l'exécutez, après avoir enregistré vos appareils |
| `docs/sql/seo-frequence-6h.sql` — vérification SEO toutes les 6 heures | Quand vous l'exécutez |
| Fonctions serveur `send-push`, `send-push-campaign`, `calculate-delivery-fee`, `create-driver` | Quand elles sont redéployées |
| Kit de sauvegardes (`docs/securite/sauvegardes/`) | Jamais dans ce dépôt : fichiers modèles pour un dépôt privé séparé |

Les corrections des deux fonctions de notification (`send-push`, `send-push-campaign`) sont bien incluses, ainsi que celles de `calculate-delivery-fee` et le contrôle de double authentification de `create-driver`.

## Compatibilité entre versions

| Situation | Effet |
|---|---|
| Nouveau site + base actuelle (juste après la fusion) | Compatible. L'application livreur comprend l'ancienne et la nouvelle réponse du serveur ; les avis utilisent l'ancien calcul si la nouvelle fonction manque ; les écrans de double authentification ne s'affichent pas. |
| Nouveau site + nouvelle base | Cible. |
| **Ancien site + nouvelle base** | À éviter : un livreur dont l'onglet est resté ouvert sur l'ancienne version verrait « Livraison terminée » après un code incorrect, alors que le serveur n'a rien confirmé. D'où l'ordre : site d'abord, base ensuite, et les livreurs rechargent la page. |
| Anciennes fonctions serveur + nouvelle base | Compatible. |
| Nouvelle fonction de frais de livraison + base actuelle | Compatible : sans la fonction de quota, le calcul reste autorisé. |
| Nouvelle fonction de frais de livraison + ancien site | Compatible : le site envoie déjà la session du client. |

## Effets sur les parcours existants

- **Commandes** : `create_order` n'est pas modifiée. Le code de livraison qu'elle écrit est déplacé dans une table privée par un déclencheur. Prix, stock, commissions, frais : inchangés.
- **Commissions, abonnements, paiements** : aucune fonction ni table de ces modules n'est modifiée.
- **Vendeur** : étapes « en préparation » → « prête » ou « prête à récupérer », puis « récupérée » pour un retrait en boutique : acceptées. Toute autre valeur est refusée.
- **Livreur** : accepter, récupérer, démarrer la livraison, confirmer avec le code : acceptés. Après 5 codes incorrects, blocage de 15 minutes.
- **Client** : le suivi de livraison passe par des fonctions dédiées, non modifiées. Les avis sont réservés aux clients ayant reçu le produit.
- **Photos** : types déjà utilisés conservés (JPEG, PNG, WebP, GIF, AVIF, vidéos MP4/MOV/WebM).

## Preuves locales (rejouées le 13 novembre 2026 sur l'état final de la branche)

Sur une copie de la **structure réelle de production** (tables, fonctions, déclencheurs, règles d'accès exportés en lecture seule ; aucune donnée réelle) :

- les scripts s'appliquent dans l'ordre de déploiement : 2 + 9 lignes « ok » ; la migration de sécurité est rejouable (9 « ok » la seconde fois) ;
- parcours réel complet sans erreur : inscription, commande de deux boutiques, commissions 10 % / 8 % / 0 %, stock, étapes vendeur, mission, mauvais code puis bon code, avis, essai gratuit, paiement d'abonnement, retrait en boutique, tâches planifiées ;
- le même parcours sur la base **sans** la migration de sécurité (situation juste après la fusion) passe aussi : les seules différences entre les deux sont les changements voulus (codes masqués, statut vendeur contrôlé, rémunération livreur verrouillée, faux avis refusés) ;
- 50 contrôles d'accès : 0 échec ;
- retour arrière puis ré-application : codes de livraison restitués, aucune donnée perdue ;
- double authentification : une session administrateur sans code est refusée avant toute requête, y compris par appel direct ; clients, vendeurs, livreurs et visiteurs inchangés ;
- 10 tests des contrôles des fonctions serveur, 10 contrôles du parcours livreur et 19 du parcours de double authentification dans un navigateur de test ;
- typecheck, lint (0 erreur), build.

Vérifications en lecture seule sur la production : tous les objets utilisés par les scripts existent ; aucun objet du même nom n'existe déjà ; aucune commande ni mission en cours (0 commande à ce jour).

## Ce qui ne peut être vérifié qu'en réel

1. La création de commande réelle après les deux scripts (une commande de test complète).
2. Les fonctions serveur redéployées (une notification, un calcul de frais).
3. Les limites de type et de taille des photos (appliquées par le service Supabase).
4. Les en-têtes servis par Cloudflare et les éventuels écarts signalés par la CSP en mode rapport.

## Retour arrière

| Élément | Retour arrière |
|---|---|
| Site | Cloudflare Pages → Deployments → déploiement précédent → « Rollback to this deployment » |
| `commande-profil-client.sql` | `commande-profil-client-retour-arriere.sql` (déconseillé : rouvre le défaut de commande) |
| `securite-corrections.sql` | `securite-corrections-retour-arriere.sql` : ne supprime aucune donnée, restitue les codes ; son dernier message rappelle que les failles sont de nouveau ouvertes |
| `securite-mfa-admin.sql` | `securite-mfa-admin-retour-arriere.sql` |
| `seo-frequence-6h.sql` | `seo-frequence-6h-retour-arriere.sql` |
| Fonctions serveur | Redéploiement de la version précédente (conservée par Supabase et dans l'historique du dépôt) |

## Ordre de déploiement (chaque étape seulement avec votre accord explicite)

1. **`docs/sql/commande-profil-client.sql`** : 2 lignes « ok ». Les clients inscrits peuvent commander.
2. **Fusion de la PR n°21.** Attendre le déploiement Cloudflare vert ; vérifier que le site s'ouvre, qu'une fiche produit s'affiche, que l'admin se connecte comme avant.
3. **Demander aux livreurs de recharger** l'espace livreur.
4. **`docs/sql/securite-corrections.sql`** : 9 lignes « ok ». Je vérifie ensuite en lecture seule.
5. **Commande de test complète** : commander, « prête » côté vendeur, accepter et livrer avec un mauvais code puis le bon, laisser un avis. En cas d'anomalie : script de retour arrière.
6. **Redéployer les quatre fonctions serveur**, puis vérifier une notification et l'affichage des frais de livraison.
7. Supprimer la commande de test (après vérification qu'il s'agit bien de la commande de test).

Suite, indépendante de la PR : Deploy Hook et fréquence SEO, double authentification, sauvegardes (`actions-manuelles.md`).
