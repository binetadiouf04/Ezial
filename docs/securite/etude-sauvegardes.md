# Étude — sauvegardes automatiques gratuites de la base Supabase

État au 13 novembre 2026 : **scripts préparés et testés localement, rien n'est activé** (aucun dépôt créé, aucun secret, aucune tâche planifiée). Le kit et la marche à suivre sont dans `docs/securite/sauvegardes/`.

Deux choix ont évolué depuis l'étude : la connexion se fait avec un **rôle en lecture seule** (et non le mot de passe principal de la base), et le chiffrement utilise une **phrase secrète** (`gpg`, AES-256) plutôt qu'une paire de clés `age`, plus simple à conserver et à utiliser le jour d'une restauration.

## Situation

- Offre Supabase gratuite : **aucune sauvegarde automatique** (sauvegardes quotidiennes à partir de l'offre Pro). Les fichiers du Storage (photos) ne sont jamais inclus dans les sauvegardes, quelle que soit l'offre.
- Le dépôt `binetadiouf04/Ezial` est **public** : aucune sauvegarde, même chiffrée, ne doit y être stockée, et son espace d'artefacts est téléchargeable par tout utilisateur connecté à GitHub.

## Solution étudiée : GitHub Actions + outils PostgreSQL officiels

**Principe.** Un workflow planifié lance `pg_dump` (ou `supabase db dump`, l'outil officiel de Supabase), chiffre le fichier, le conserve comme artefact, puis vérifie qu'il se restaure.

| Question | Réponse |
|---|---|
| Compatibilité avec le projet actuel | Oui. Les serveurs GitHub n'ont pas d'IPv6 et la connexion directe gratuite de Supabase est en IPv6 : il faut utiliser l'adresse « Session pooler » (IPv4, gratuite), visible dans le bouton « Connect » du tableau de bord. La version de `pg_dump` doit être au moins celle du serveur. |
| Programmation | Oui (`schedule` de GitHub Actions), par exemple chaque nuit. L'heure réelle peut glisser de quelques minutes. |
| Coût | 0. Dépôt privé : 2 000 minutes d'Actions par mois gratuites ; une sauvegarde prend 1 à 2 minutes. |
| Identifiants | Un rôle dédié `ezial_backup`, en lecture seule, est enregistré comme « secret » chiffré du dépôt ; il n'apparaît jamais dans les journaux. Il ne peut rien modifier, mais il peut tout lire : dépôt sans collaborateur et double authentification GitHub obligatoires. |
| Fichiers | Chiffrés avant stockage (AES-256) avec une phrase secrète que vous conservez (gestionnaire de mots de passe + copie papier). Contrepartie : phrase perdue = sauvegardes inutilisables. |
| Stockage, durée, quotas | Artefacts du dépôt privé : conservation réglable de 1 à 90 jours ; 500 Mo gratuits. La base pèse quelques Mo : 30 jours de sauvegardes quotidiennes tiennent largement. |
| Restauration réelle | Le même workflow peut restaurer chaque sauvegarde dans une base PostgreSQL temporaire et compter les lignes des tables principales : la preuve de restauration est alors refaite à chaque exécution. Une restauration complète vers un projet Supabase vide doit être répétée une fois à la main avant le lancement. |
| Contenu | Données et structure de la base, comptes compris (mots de passe hachés). Pas les photos : environ 100 Mo aujourd'hui, à copier à part une fois par mois, ou à accepter comme risque (les vendeurs peuvent les renvoyer). |

**Risques de GitHub pour des données personnelles.** Un dépôt public ou des artefacts non chiffrés exposeraient noms, téléphones et adresses : exclu. Dans un dépôt privé dédié, avec fichiers chiffrés et clé privée hors ligne, le risque résiduel est la compromission du compte GitHub (vol du secret de connexion par modification du workflow), d'où la double authentification GitHub.

## Comparaison des options gratuites

| Option | Automatique | Hors de Supabase | Remarque |
|---|---|---|---|
| **GitHub Actions, dépôt privé dédié, fichiers chiffrés** | Oui | Oui | **Recommandée** |
| Export manuel depuis un ordinateur (`supabase db dump`) | Non | Oui | Demande un ordinateur ; peu praticable sur tablette |
| Copie des tables dans le Storage Supabase par tâche planifiée | Oui | Non | Disparaît avec le projet : ce n'est pas une sauvegarde |
| Cloudflare Workers planifié | Oui | Oui | Ne peut pas exécuter `pg_dump` ; export partiel et fragile |
| Supabase Pro | Oui | Chez Supabase | 25 $ par mois : non retenu |

## Recommandation

Un dépôt GitHub **privé** séparé (par exemple `ezial-sauvegardes`), contenant uniquement le workflow : sauvegarde quotidienne chiffrée, conservation 30 jours, test de restauration automatique à chaque exécution. Votre intervention se limite à créer le dépôt, exécuter un court script SQL (rôle de lecture seule), enregistrer deux secrets et conserver la phrase secrète. Détail : `docs/securite/sauvegardes/README.md`.
