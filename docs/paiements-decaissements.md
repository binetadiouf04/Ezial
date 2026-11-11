# Paiements Wave / Orange Money et versements aux vendeurs — guide

Ce document décrit l'architecture des encaissements (le client paie sa
commande) et des décaissements (Ezial verse leur part aux vendeurs), les règles
décidées, et les étapes pour la mettre en service.

> **État actuel : rien n'est opérationnel.** Aucune API officielle Wave ou
> Orange Money n'est intégrée. Les quatre adaptateurs (Wave encaissement, Wave
> décaissement, Orange Money encaissement, Orange Money décaissement) sont « non
> configurés » : ils ne font rien et répondent « non prêt ». Tant que ce n'est
> pas fait, **aucun paiement ne peut être encaissé et aucun versement ne peut
> partir**, même si les réglages SQL étaient activés par erreur. Il n'existe
> aucun mode « simulation » activable en production : les faux adaptateurs
> n'existent que dans les tests automatiques.

---

## 1. Architecture

```
 ENCAISSEMENT
 ────────────
 Page de commande (site)
   │  supabase.functions.invoke('payment-initiate', { orderId, provider })
   │  avec la session du client (jeton vérifié)
   ▼
 Edge Function payment-initiate
   1. adaptateur prêt ? réglage collections_enabled ?  ── non ──► 503 « en cours d'activation », rien en base
   2. payments_create_transaction  (montant = orders.total_amount, recalculé en base ;
                                    commande du client seulement ; clé d'idempotence)
   3. adaptateur.createCheckout     (page de paiement du fournisseur)
   4. payments_set_pending          (référence fournisseur, adresse de la page)
   ▼
 Page de paiement Wave / Orange Money  ──►  le client paie
   │
   ▼
 Edge Function payment-webhook?provider=wave|orange_money
   1. signature vérifiée sur le corps brut (sinon 401, rien enregistré)
   2. payments_record_event        (une seule fois par notification : anti-doublon)
   3. VÉRIFICATION DU STATUT : adaptateur.getPaymentStatus(référence)
      — le contenu du webhook ne suffit jamais
   4. confirmé  → payments_confirm (montant donné par l'API du fournisseur ;
                  écart de montant ou double paiement → anomalie, pas de confirmation)
      échoué / annulé / expiré → payments_fail
      en attente / inconnu → rien
   5. payments_mark_event_processed
   ▼
 payments_confirm : orders.payment_status = 'paid', événement « payment.confirmed »
   ├──► notification WhatsApp de confirmation (si confirmation_requires_paid = true)
   └──► recalcul de l'admissibilité des parts vendeurs

 PART VENDEUR
 ────────────
 vente enregistrée « en attente »
   ──► paiement confirmé par le fournisseur
   + livraison confirmée (driver_complete_delivery, code client vérifié par le serveur)
     ou retrait en boutique confirmé par un admin
   + aucune réclamation ouverte, sous-commande non annulée
   ──► part « disponible »

 DÉCAISSEMENT
 ────────────
 tâche pg_cron payouts-dispatch (toutes les 15 min, À PLANIFIER plus tard)
   │  net.http_post + x-webhook-secret
   ▼
 Edge Function payouts-dispatch
   0. état réel des 4 API → payments_record_provider_status (visible dans l'admin)
   1. versements désactivés, ou aucune API de décaissement prête → STOP (rien n'est réservé)
   2. RAPPROCHEMENT d'abord : payouts_to_reconcile → getPayoutStatus
        réussi → payouts_record_result 'succeeded'
        échec affirmé par le fournisseur → 'failed' (les parts redeviennent versables)
        introuvable → reste 'unknown' (vérification manuelle, JAMAIS de renvoi)
        en cours → attend
   3. payouts_prepare_due  (un versement par boutique, quotidien ou hebdomadaire)
   4. payouts_claim_batch  (jamais un versement 'unknown' ou 'processing')
   5. pour chaque versement :
        API du fournisseur prête ? solde suffisant sur le compte DU MÊME fournisseur ?
          non → 'blocked' (nouvel essai dans 1 h, administrateur alerté)
        sendPayout avec la clé d'idempotence du versement
          accepté   → 'unknown' (une demande acceptée n'est PAS un succès),
                      puis une vérification immédiate ; sinon rapprochement au passage suivant
          refusé    → 'failed'
          incertain (réseau, délai dépassé, exception) → 'unknown' : jamais renvoyé
          erreur certaine avant envoi → 'retry' (re-planifié dans 15 min)
```

Fichiers :

- Migration SQL (tables `payment_settings`, `payment_provider_status`,
  `payment_transactions`, `payment_events`, `seller_payout_methods`,
  `seller_payouts`, `finance_audit_log`, `ezial_events` et les fonctions
  `payments_*` / `payouts_*` réservées à `service_role`).
- `supabase/functions/_shared/payments/core.ts` : interfaces des adaptateurs,
  les quatre adaptateurs « non configurés », et la logique
  (`initiatePayment`, `handleCollectionWebhook`, `runPayouts`). Aucun appel
  réseau, aucune API Deno ou Node.
- `supabase/functions/_shared/payments/core.test.ts` : tests
  (`node --test supabase/functions/_shared/payments/core.test.ts`).
- `supabase/functions/payment-initiate/index.ts`,
  `supabase/functions/payment-webhook/index.ts`,
  `supabase/functions/payouts-dispatch/index.ts` : points d'entrée des Edge
  Functions (accès base avec la clé serveur, jamais depuis le navigateur).

Les numéros de téléphone complets n'apparaissent jamais dans les journaux
(ils sont masqués, par exemple `+22177•••67`).

---

## 2. Règles décidées le 11/11/2026

- **Part vendeur disponible** dès que le paiement est confirmé par le
  fournisseur **et** que la livraison est confirmée (ou le retrait en boutique
  confirmé), sans réclamation ouverte.
- **Versement automatique**, fréquence **quotidienne** par défaut, ou
  **hebdomadaire** (jour choisi) via `payment_settings` :

  ```sql
  update public.payment_settings set payout_frequency = 'weekly', payout_weekday = 1, updated_at = now() where id;  -- 1 = lundi
  update public.payment_settings set payout_frequency = 'daily', updated_at = now() where id;
  ```

- **Frais de transfert payés par Ezial** (`fees_paid_by = 'ezial'`) : le
  vendeur reçoit exactement sa part nette.
- **Nouveau numéro de réception validé par un administrateur** avant tout
  versement (`submit_payout_method` puis `admin_review_payout_method`).
- **Deux comptes possibles par boutique** (décision du 11/11/2026, migration
  `docs/sql/paiements-deux-comptes.sql`) : un compte Wave et/ou un compte
  Orange Money. Une vente payée par Wave est versée sur le compte Wave du
  vendeur, une vente payée par Orange Money sur son compte Orange Money
  (chaque compte de décaissement finance les ventes encaissées chez le même
  fournisseur). Avec un seul compte, tout y est versé. Pendant la
  vérification d'un nouveau numéro, seuls les versements vers ce
  fournisseur sont suspendus (`payout_provider_for_sale`).
- **Retrait en boutique** : déclaré par le vendeur, confirmé par un
  administrateur (`admin_confirm_pickup`) tant que le code du client n'est pas
  vérifié côté serveur (`pickup_auto_eligible` reste à `false`).

---

## 3. Fonds Wave et fonds Orange Money séparés

- Un versement Wave est financé **uniquement** par le compte Wave d'Ezial ; un
  versement Orange Money **uniquement** par le compte Orange Money.
- Aucun transfert entre opérateurs n'est simulé ni supposé.
- Avant chaque versement, le solde du compte du même fournisseur est vérifié
  (si l'API le fournit). **Fonds insuffisants → versement « bloqué »**,
  administrateur alerté, nouvel essai une heure plus tard. Rien n'est envoyé.
- Si l'API d'un seul fournisseur est prête, les versements vers l'autre sont
  bloqués (avec alerte), jamais redirigés.

---

## 4. Secrets à configurer (Edge Functions > Secrets)

Les noms exacts des secrets de chaque fournisseur seront fixés avec
l'adaptateur, à partir de la documentation officielle. Liste à compléter :

| Secret | Valeur |
|---|---|
| `PAYMENTS_ENVIRONMENT` | `sandbox` (défaut) ou `production` |
| `PAYMENTS_RETURN_URL` | adresse de retour après paiement ; `{orderNumber}` est remplacé par le numéro de commande. Défaut : `https://www.ezial.net/compte/commande/{orderNumber}?paiement=retour` |
| `PAYMENTS_CANCEL_URL` | adresse de retour après abandon. Défaut : `https://www.ezial.net/compte/commande/{orderNumber}?paiement=annule` |
| `PAYOUTS_DISPATCH_SECRET` | secret partagé de payouts-dispatch (même valeur que le secret Vault `payouts_dispatch_secret`) |

Pour **chacun** des quatre adaptateurs — préfixes `WAVE_COLLECTION_*`,
`WAVE_DISBURSEMENT_*`, `ORANGE_MONEY_COLLECTION_*`,
`ORANGE_MONEY_DISBURSEMENT_*` :

| Élément | Valeur |
|---|---|
| Adresse de base de l'API | `<à fournir>` |
| Identifiants (clé, identifiant marchand, etc.) | `<à fournir>` |
| Méthode d'authentification | `<à fournir>` |
| Secret de signature des webhooks | `<à fournir>` |
| URL de retour / d'annulation à déclarer chez le fournisseur (encaissement) | `<à fournir>` |
| Environnement de test (sandbox) disponible et ses identifiants | `<à fournir>` |

Aucun de ces secrets ne doit apparaître dans le code du site ni dans le dépôt.

Secret Vault (lu par la tâche planifiée), une fois, dans **SQL Editor** :

```sql
select vault.create_secret('<même valeur que PAYOUTS_DISPATCH_SECRET>', 'payouts_dispatch_secret');
```

---

## 5. Adresses de webhook à déclarer chez les fournisseurs

- Wave : `https://lkqezdrdbogtborgjvlw.supabase.co/functions/v1/payment-webhook?provider=wave`
- Orange Money : `https://lkqezdrdbogtborgjvlw.supabase.co/functions/v1/payment-webhook?provider=orange_money`

Tant que l'adaptateur n'est pas prêt, ces adresses répondent 503 et
n'enregistrent rien. Les notifications de **versement** (s'il y en a) ne sont
pas encore traitées : elles suivront le même schéma
(`&capability=disbursement`), voir le TODO dans `payment-webhook/index.ts`.

Déploiement :

```
supabase functions deploy payment-initiate
supabase functions deploy payment-webhook --no-verify-jwt
supabase functions deploy payouts-dispatch --no-verify-jwt
```

`payment-initiate` garde la vérification JWT (le client doit être connecté) ;
`payment-webhook` est protégée par la signature du fournisseur ;
`payouts-dispatch` par `x-webhook-secret`.

---

## 6. Activer (uniquement quand les adaptateurs sont intégrés et testés)

Encaissements, **en même temps** que la confirmation WhatsApp après paiement :

```sql
update public.payment_settings set collections_enabled = true, updated_at = now() where id;
update public.whatsapp_settings set confirmation_requires_paid = true, updated_at = now() where id;
```

Versements :

```sql
update public.payment_settings set payouts_enabled = true, updated_at = now() where id;
```

Arrêt d'urgence (aucune nouvelle tentative de paiement, aucun versement ;
note : le rapprochement des versements incertains s'arrête aussi tant que
`payouts_enabled` est à `false`, mais rien n'est jamais renvoyé) :

```sql
update public.payment_settings set collections_enabled = false, payouts_enabled = false, updated_at = now() where id;
```

---

## 7. Planifier payouts-dispatch (uniquement quand tout est prêt)

Dans **SQL Editor**, toutes les 15 minutes :

```sql
select cron.schedule('payouts-dispatch', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://lkqezdrdbogtborgjvlw.supabase.co/functions/v1/payouts-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'payouts_dispatch_secret')
    ),
    body := '{}'::jsonb
  );
$$);
```

Pour arrêter : `select cron.unschedule('payouts-dispatch');`

Même planifiée, la fonction n'envoie rien tant que `payouts_enabled` est à
`false` ou qu'aucune API de décaissement n'est prête : elle enregistre
seulement l'état des API (table `payment_provider_status`).

---

## 8. Liste de mise en service

1. Obtenir les contrats et la **documentation officielle** de Wave et
   d'Orange Money (encaissement et décaissement), avec un accès sandbox.
2. Implémenter les adaptateurs (section 9) et leurs tests (requêtes simulées,
   aucun appel réseau dans les tests).
3. Configurer les secrets en `PAYMENTS_ENVIRONMENT=sandbox`, déployer, déclarer
   les adresses de webhook de test.
4. **Tests sandbox** : paiement réussi, paiement abandonné, paiement expiré,
   notification en double, notification mal signée (doit être refusée),
   montant différent (doit créer une anomalie, pas une confirmation).
5. Exécuter l'étape 2 de la livraison (section 10) une fois l'application
   livreur passée à `driver_complete_delivery`.
6. Passer en production, puis faire **un petit paiement réel** avec une
   commande de test de la personne ; vérifier `payment_transactions`,
   `payment_events`, `orders.payment_status`, la notification WhatsApp.
7. Activer `collections_enabled` et `confirmation_requires_paid` (section 6).
8. Versements : approvisionner les comptes Wave et Orange Money d'Ezial,
   valider le numéro de réception d'une boutique de test, faire un **petit
   versement réel**, vérifier le rapprochement (« unknown » puis
   « succeeded »), puis activer `payouts_enabled` et planifier
   `payouts-dispatch`.

---

## 9. Ce qui reste à implémenter, par adaptateur

Dans `core.ts`, chaque classe porte le repère
`// À IMPLÉMENTER à réception de la documentation officielle`.

- **WaveCollection / OrangeMoneyCollection** :
  - `status()` : prêt seulement si tous les secrets sont présents ;
  - `createCheckout()` : création de la page de paiement, en transmettant la
    clé d'idempotence de la transaction ; renvoyer la référence du
    fournisseur, l'adresse de la page et l'expiration si connue ;
  - `verifyWebhook()` : vérification de la signature selon la méthode
    officielle, sur le corps brut, avant toute lecture ; traduction de
    l'événement (identifiant, référence, statut) ;
  - `getPaymentStatus()` : interrogation du statut réel et du montant payé,
    traduits vers `confirmed / failed / cancelled / expired / pending / unknown`.
- **WaveDisbursement / OrangeMoneyDisbursement** :
  - `status()`, `getBalance()` (solde du compte de décaissement, ou `null` si
    l'API ne le donne pas) ;
  - `sendPayout()` : envoi avec la clé d'idempotence du versement ; classer
    chaque réponse en `accepted / rejected / uncertain / retryable_before_send`
    — en cas de doute, **toujours `uncertain`** ;
  - `getPayoutStatus()` : statut réel par référence et, si l'API le permet,
    par clé d'idempotence (indispensable quand la réponse d'envoi a été perdue).
- Règles de format des numéros (`normalize_wallet_phone`, provisoires) à
  aligner sur celles des fournisseurs.

---

## 10. Prérequis de sécurité connus

- **Livraison confirmée par le serveur** : la part vendeur ne devient
  disponible qu'après une livraison confirmée. L'application livreur doit
  utiliser `driver_complete_delivery` (code client et photo vérifiés en base).
  Ensuite seulement, exécuter l'**étape 2** (`docs/sql/paiements-etape2-livraison.sql`), qui
  interdit de passer une mission à « livrée » par une mise à jour directe sans
  cette vérification (les administrateurs gardent la main pour les incidents).
  Tant que l'étape 2 n'est pas exécutée, une mise à jour directe du statut
  reste possible et rendrait une part versable.
- **Retrait en boutique** : le code du client n'est pas encore vérifié côté
  serveur ; chaque retrait doit donc être confirmé par un administrateur
  (`admin_confirm_pickup`) avant que la part soit versable.
- Les fonctions `payments_*` et `payouts_*` ne sont exécutables qu'avec la clé
  `service_role`, utilisée uniquement dans les Edge Functions.

---

## 11. Limites connues à traiter avant activation

- **Rapprochement des encaissements** : si la vérification du statut échoue
  au moment du webhook (API du fournisseur momentanément indisponible), la
  notification est déjà enregistrée et une nouvelle livraison de la même
  notification est ignorée comme doublon. Une tâche qui revérifie les
  transactions « en attente » auprès de l'API (`getPaymentStatus`) est à
  ajouter avant l'activation, pour qu'aucun paiement réel ne reste non
  confirmé. Attention : `payments_maintenance` passe « expirée » une tentative
  restée en attente plus de 2 h ; `payments_confirm` peut toujours la
  confirmer ensuite.
- Un versement « unknown » introuvable chez le fournisseur demande une
  **vérification manuelle** : il n'est jamais renvoyé automatiquement.
- Quand un seul fournisseur est prêt, les versements vers l'autre sont
  « bloqués » et l'alerte administrateur se répète à chaque nouvel essai
  (toutes les heures).

**Rappel : rien de tout cela n'est opérationnel tant que les API officielles
de Wave et d'Orange Money ne sont pas intégrées et testées.**
