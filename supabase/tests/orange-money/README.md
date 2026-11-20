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
