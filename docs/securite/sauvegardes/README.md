# Sauvegardes automatiques d'Ezial — kit préparé, non activé

État au 13 novembre 2026 : **rien n'est activé**. Aucun dépôt créé, aucun secret enregistré, aucune tâche planifiée. Ce dossier contient les fichiers prêts à être copiés dans un futur dépôt GitHub **privé** séparé, et la marche à suivre.

Coût : **0 FCFA** (offre gratuite de GitHub pour les dépôts privés). Aucune carte bancaire n'est nécessaire ; sans moyen de paiement enregistré, GitHub arrête les tâches en cas de dépassement au lieu de facturer.

## Ce que fait le kit

| Besoin | Réponse |
|---|---|
| Sauvegarde quotidienne | Chaque nuit à 02:23 UTC (heure de Dakar), plus un lancement manuel possible. |
| Lecture seule | Connexion avec un rôle dédié `ezial_backup` qui peut lire mais ne peut rien modifier ni supprimer (`role-sauvegarde.sql`). Le mot de passe principal de la base n'est jamais utilisé. |
| Chiffrement avant stockage | AES-256 (outil `gpg`), avec une phrase secrète que vous seule détenez. Le fichier conservé par GitHub est illisible sans elle. |
| Aucun secret ni donnée dans les journaux | Les scripts n'affichent que des messages d'état et des nombres de lignes. Les adresses de connexion sont masquées même en cas d'erreur (vérifié). |
| Conservation 30 jours | Artefacts du dépôt privé, supprimés automatiquement après 30 jours. |
| Vérification d'intégrité | Empreinte SHA-256 de l'archive ; le fichier chiffré est déchiffré puis comparé à l'empreinte avant d'être conservé. |
| Test de restauration isolé | Chaque sauvegarde est restaurée dans une base temporaire créée sur la machine de GitHub, puis le nombre de lignes de chaque table est comparé à l'origine. Le script **refuse** toute cible qui n'est pas locale : il ne peut pas écrire dans la production. |
| Photos | Sauvegarde mensuelle distincte des photos publiques (produits, boutiques), avec contrôle de la taille de chaque fichier. |

## Contenu d'une sauvegarde de la base

| Fichier | Contenu |
|---|---|
| `structure.sql` | Tables, fonctions, déclencheurs, règles d'accès d'Ezial (schémas `public` et `ezial_private`). |
| `donnees.sql` | Toutes les données d'Ezial, les comptes (mots de passe hachés) et la liste des fichiers. |
| `objets-auth-storage.sql` | Règles d'accès des photos et déclencheur d'inscription, qu'Ezial a ajoutés dans les schémas gérés par Supabase. |
| `taches-planifiees.sql` | Les tâches planifiées, sous forme de texte rejouable. Elles ne sont jamais chargées dans la base d'essai : une restauration d'essai ne peut donc déclencher ni notification ni reconstruction du site. |
| `lignes-origine.txt` | Nombre de lignes par table au moment de la sauvegarde. |

**Non sauvegardé, à recréer à la main après une restauration** : les secrets du coffre Supabase (secret des notifications, adresse du Deploy Hook), les secrets des fonctions Edge, les réglages d'authentification, et le dossier privé `secure-photos` (preuves de livraison ; vide aujourd'hui). Le code des fonctions Edge est dans le dépôt du site.

## Ce qui a été testé, et ce qui ne l'est pas encore

**Testé localement (13 novembre 2026)**, sur une copie de la structure réelle de production :
- export complet avec un rôle en lecture seule (une tentative de suppression avec ce rôle est refusée) ;
- restauration dans une base vierge : 61 tables, nombres de lignes strictement identiques ;
- règles d'accès des photos et déclencheur d'inscription restaurés ;
- une sauvegarde volontairement incomplète est détectée et fait échouer l'essai ;
- chiffrement, déchiffrement, empreinte identique ; mauvaise phrase secrète refusée ; aucun texte lisible dans le fichier chiffré ;
- en cas d'erreur de connexion, le mot de passe n'apparaît pas dans le journal ;
- copie des photos avec noms accentués, et détection d'un fichier dont la taille ne correspond pas.

**Ne peut être confirmé qu'au premier lancement réel** (lancement manuel, avec votre accord) :
1. la connexion du rôle `ezial_backup` par l'adresse « Session pooler » de Supabase ;
2. l'export avec `pg_dump` version 17 exécuté dans un conteneur sur la machine de GitHub ;
3. le démarrage de la base d'essai Supabase (`supabase db start`, outil officiel en version 3.1.0) et la restauration des comptes dans celle-ci.

Si le point 3 échoue, la sauvegarde chiffrée est quand même conservée (elle est enregistrée avant l'essai) et GitHub envoie un e-mail d'échec.

## Quotas gratuits (situation mesurée en production le 13 novembre 2026)

| Élément | Mesure | Limite gratuite |
|---|---|---|
| Base de données | 25 Mo (une sauvegarde compressée pèse quelques Mo) | 500 Mo de stockage pour les dépôts privés |
| Photos publiques | 222 fichiers, environ 100 Mo | Même enveloppe de 500 Mo |
| Durée | Environ 5 minutes par nuit, soit 150 minutes par mois | Crédit mensuel inclus de 12 $ d'après la documentation GitHub, soit environ 2 000 minutes sur une machine Linux standard (0,006 $ la minute) |

À surveiller : quand les photos dépasseront environ 300 Mo, la sauvegarde mensuelle des photos ne tiendra plus dans l'enveloppe gratuite. Le journal affiche le volume à chaque exécution. La sauvegarde de la base, elle, reste très en dessous des limites.

## Mise en place (à faire seulement après votre accord final)

1. **Créer le dépôt privé** `ezial-sauvegardes` sur GitHub (visibilité : Private), sans collaborateur.
2. **Y copier** le contenu du dossier `modele-depot-prive/` (les dossiers `.github/` et `scripts/`). Je peux le faire à votre place si vous m'y autorisez.
3. **Créer le rôle de lecture seule** : dans un gestionnaire de mots de passe, générer un mot de passe de 40 caractères (lettres et chiffres uniquement) ; ouvrir `role-sauvegarde.sql`, remplacer `REMPLACER_PAR_UN_MOT_DE_PASSE_LONG`, exécuter dans l'éditeur SQL de Supabase. Résultat attendu : une ligne « ok ».
4. **Composer l'adresse de connexion** : Supabase → bouton **Connect** → **Session pooler**. Dans l'adresse affichée, remplacer `postgres.` (avant le point) par `ezial_backup.` et le mot de passe par celui de l'étape 3.
5. **Choisir la phrase secrète de chiffrement** : 40 caractères ou plus, générée par le gestionnaire de mots de passe.
6. **Enregistrer les secrets** dans le dépôt privé (Settings → Secrets and variables → Actions) : secrets `SUPABASE_DB_URL` (étape 4) et `BACKUP_PASSPHRASE` (étape 5) ; variable `SUPABASE_URL` (adresse publique du projet, `https://….supabase.co`).
7. **Premier lancement manuel** : onglet Actions → « Sauvegarde quotidienne de la base » → Run workflow. Je lis ensuite le journal avec vous.

Ne collez jamais le mot de passe, l'adresse de connexion ou la phrase secrète dans une conversation, un e-mail ou un dépôt.

Sur iPad, si « Run workflow », l'onglet « Secrets » ou le bouton « Connect » n'apparaît pas : passer en mode paysage, ou utiliser « Demander le site pour ordinateur » dans Safari.

## Gestion de la phrase secrète

- GitHub ne permet **jamais** de relire un secret enregistré. La phrase secrète doit donc exister ailleurs : gestionnaire de mots de passe **et** une copie papier rangée en lieu sûr.
- **Phrase perdue = sauvegardes illisibles**, sans aucun recours.
- Si vous la changez, les sauvegardes des 30 jours précédents restent chiffrées avec l'ancienne : conserver l'ancienne pendant 30 jours.
- Le mot de passe du rôle `ezial_backup` se change par `alter role ezial_backup password '…';` puis mise à jour du secret `SUPABASE_DB_URL`.
- Protéger le compte GitHub par la double authentification : quiconque contrôle le dépôt privé pourrait modifier les scripts pour lire les secrets.

## Restaurer une sauvegarde

À faire depuis un ordinateur (pas depuis une tablette). **Ne jamais restaurer par-dessus la base en service** : toujours dans un projet Supabase neuf.

1. Dépôt privé → Actions → exécution voulue → télécharger l'artefact (`ezial-base-AAAA-MM-JJ_HHMM`).
2. Déchiffrer : `gpg --output sauvegarde.tar.gz --decrypt ezial-base-….tar.gz.gpg` (la phrase secrète est demandée).
3. Vérifier l'empreinte : `sha256sum sauvegarde.tar.gz` doit afficher la valeur du fichier `.sha256`.
4. Extraire : `tar -xzf sauvegarde.tar.gz`.
5. Créer un projet Supabase vide, récupérer son adresse de connexion (rôle `postgres`).
6. Restaurer, dans cet ordre :
   `psql "<adresse du nouveau projet>" -v ON_ERROR_STOP=1 --single-transaction -f structure.sql`
   `psql "<adresse>" -v ON_ERROR_STOP=1 --single-transaction -f objets-auth-storage.sql`
   `psql "<adresse>" -v ON_ERROR_STOP=1 --single-transaction -f donnees.sql`
7. Comparer les nombres de lignes avec `lignes-origine.txt` (`psql "<adresse>" -At -F $'\t' -f scripts/compter.sql`).
8. Recréer les secrets du coffre, puis rejouer `taches-planifiees.sql`.
9. Redéployer les fonctions Edge et leurs secrets ; renvoyer les photos (archive `ezial-photos-AAAA-MM`) dans les dossiers de stockage.
10. Dans Cloudflare Pages, remplacer `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` (Production **et** Preview), puis redéployer.

Une restauration complète vers un projet Supabase vide reste à répéter une fois, à blanc, avant le lancement.

## Limites honnêtes

- Une sauvegarde par nuit : en cas d'incident, jusqu'à 24 heures de données peuvent manquer.
- Les photos ne sont copiées qu'une fois par mois ; entre deux copies, un vendeur peut renvoyer ses photos.
- Si la version de PostgreSQL de Supabase change (17 aujourd'hui), l'export échouera avec un message clair : il faudra changer un chiffre dans les fichiers du dépôt privé.
- GitHub peut décaler de quelques minutes l'heure d'une tâche planifiée.
