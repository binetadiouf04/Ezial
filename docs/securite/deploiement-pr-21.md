# PR n°21 — validation avant fusion et plan de déploiement

Rien n'est fusionné ni exécuté en production. Ce document distingue ce qui est prouvé localement de ce qui doit être vérifié en réel.

## Ce que contient la PR

| Élément | Actif quand |
|---|---|
| Code du site (application livreur, en-têtes, build, liens, routes, brouillon de commande, message d'avis) | À la fusion (Cloudflare redéploie) |
| `docs/sql/securite-corrections.sql` | Quand vous l'exécutez dans Supabase |
| Fonctions Edge `send-push`, `send-push-campaign`, `calculate-delivery-fee` | Quand elles sont redéployées |

## Compatibilité entre versions

| Situation | Effet |
|---|---|
| Nouveau site + ancienne base (juste après la fusion) | Compatible. L'application livreur comprend l'ancienne et la nouvelle réponse du serveur (vérifié dans un navigateur de test). |
| Nouveau site + nouvelle base | Cible. |
| **Ancien site + nouvelle base** | À éviter : un livreur dont l'onglet est resté ouvert sur l'ancienne version verrait « Livraison terminée » après un code incorrect, alors que le serveur n'a rien confirmé. D'où l'ordre : site d'abord, base ensuite, et les livreurs rechargent la page. |
| Anciennes fonctions Edge + nouvelle base | Compatible. |
| Nouvelle fonction de frais de livraison + ancienne base | Compatible : sans la fonction de quota, le calcul reste autorisé. |
| Nouvelle fonction de frais de livraison + ancien site | Compatible : le site envoie déjà la session du client ; sans réponse, il affiche l'estimation habituelle. |

## Effets sur les parcours existants (analyse du code de production)

- **Commandes** : `create_order` n'est pas modifiée. Le code de livraison qu'elle écrit est déplacé dans la table privée par un déclencheur (testé). Prix, stock, commissions, frais : inchangés.
- **Commissions, abonnements, paiements** : aucune fonction ni table de ces modules n'est modifiée. Le verrou des boutiques ne touche pas `status` en modification (pause, activation, suppression de compte inchangées).
- **Vendeur** : les deux seules étapes utilisées par l'interface restent acceptées (« en préparation » vers « prête » ou « prête à récupérer »).
- **Livreur** : accepter, récupérer, démarrer la livraison, confirmer avec le code : acceptés (testé de bout en bout localement).
- **Avis** : l'interface n'affiche déjà le formulaire qu'aux acheteurs.
- **Photos** : types déjà utilisés conservés (JPEG, PNG, WebP, GIF, AVIF, vidéos MP4/MOV/WebM). Une photo iPhone est convertie avant envoi ; un fichier HEIC non converti serait refusé (il n'était déjà pas affichable).

## Retour arrière

`docs/sql/securite-corrections-retour-arriere.sql` : ne supprime aucune donnée, recopie les codes de livraison dans leurs colonnes d'origine, conserve le journal. Il rouvre les failles corrigées : son dernier message le dit explicitement (« FAILLES DE NOUVEAU OUVERTES »). Testé : application, retour arrière, ré-application.

## Preuves locales (ne valent pas preuve en production)

- 50 contrôles sur une base PostgreSQL locale reproduisant politiques, droits et déclencheurs de production : 0 échec.
- 8 tests automatiques des contrôles des fonctions Edge (`npm run test:security`).
- Parcours livreur dans un navigateur de test : 10 contrôles (code incorrect, ancien et nouveau serveur, blocage, succès, code jamais demandé par le navigateur).
- Typecheck, lint (0 erreur), build.
- Vérification en lecture seule sur la production : toutes les tables, colonnes et fonctions utilisées par la migration existent avec les bonnes signatures ; aucun objet du même nom n'existe déjà ; aucune catégorie existante ne viole le nouveau format.

## Ce qui ne peut être vérifié qu'en réel

1. La vraie fonction `create_order` avec la migration (une commande de test complète).
2. Les fonctions Edge redéployées (pas d'environnement Deno ici : syntaxe vérifiée, exécution non).
3. Les limites de type et de taille du Storage (appliquées par le service Supabase).
4. Les en-têtes servis par Cloudflare et les éventuels écarts signalés par la CSP en mode rapport.
5. Une notification push réelle après redéploiement.

## Ordre de déploiement (à lancer seulement avec votre accord)

1. **Fusion de la PR n°21.** Attendre le déploiement Cloudflare vert. Vérifier que le site s'ouvre et qu'une fiche produit s'affiche.
2. **Demander aux livreurs de recharger** l'espace livreur (ils sont deux aujourd'hui).
3. **Exécuter `docs/sql/securite-corrections.sql`** : 9 lignes « ok » attendues. Je vérifie ensuite en lecture seule.
4. **Commande de test complète** : commander, « prête » côté vendeur, accepter et livrer côté livreur avec un mauvais code puis le bon, laisser un avis. En cas d'anomalie : script de retour arrière.
5. **Redéployer les trois fonctions Edge** (je peux le faire avec votre accord, une approbation vous sera demandée) puis vérifier : une notification de commande arrive ; les frais de livraison s'affichent au paiement.
6. Supprimer la commande de test.
