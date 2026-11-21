# Banc de test Orange Money (local, sans production)

PostgreSQL 16 jetable : le schéma Ezial est reproduit en version simplifiée (`00-scaffold.sql`), avec les fonctions et
déclencheurs de PRODUCTION copiés le 20 nov. 2026 (`10`, `11`, `12`). Les migrations testées sont `docs/sql/orange-money-*.sql`.
Écarts connus avec la production : tables réduites aux colonnes utiles, `create_order` sans quelques contrôles de coordonnées,
fonctions annexes (livraison, promo, push, WhatsApp) simplifiées.

```
PGHOST=/tmp PGPORT=54555 PGUSER=postgres ./run.sh      # démarre à zéro, applique et teste tout
./build-rollback.sh                                     # régénère docs/sql/orange-money-retour-arriere.sql
```
Ordre : état de production (`10`) → migrations 1 à 4 → seconde application (idempotence) → tests `30` à `35` →
concurrence réelle (`80`, plusieurs processus psql en parallèle) → retour arrière → test `90`.
Aucune transaction réelle, aucun appel à Orange ni à Supabase.

## Wave (migration `docs/sql/wave-1-commandes.sql`)
```
PGHOST=/tmp PGPORT=54555 PGUSER=postgres ./run-wave.sh   # base distincte (ezial_wave_test) : Orange 1 à 6 -> tests Orange -> Wave x2 -> tests Orange + Wave -> retour arrière -> tests Orange
./build-rollback-wave.sh                                  # régénère docs/sql/wave-retour-arriere.sql depuis 13-baseline-pre-wave.sql
```
`13-baseline-pre-wave.sql` = fonctions de production d'avant Wave (relues en lecture seule le 21 nov. 2026 ; identiques à orange-money-1 à 6 au
commentaire et aux fins de ligne près). `14-vault-simule.sql` simule le coffre (secrets fictifs). Tests Wave : `tests/4*.sql`, `81-wave-concurrence.sh`, `98-wave-retour-arriere.sql`.
Après Wave, deux assertions Orange sont adaptées dans une copie temporaire (30 : « Wave expire localement » ; 35 : signature de `payments_reconcile_candidates`) ; les fichiers eux-mêmes ne changent pas.
