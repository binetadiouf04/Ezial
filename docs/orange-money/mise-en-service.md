# Orange Money (QR CODE – OM) — mise en service

État au 20 nov. 2026 : base de données prête (migrations 1 à 4 exécutées, interrupteur éteint),
fonctions Edge écrites et testées avec un faux serveur Orange, **non déployées**. Interface de paiement : à venir.

## Fonctions Edge
| Fonction | Rôle | Appelée par |
|---|---|---|
| `payment-initiate` | Crée la tentative et le QR (validité = fin du délai de la commande, 30 min max) ; renvoie le QR et les liens Max It / Orange Money | le site (client connecté) |
| `payment-webhook?provider=orange_money` | Reçoit le callback Orange, vérifie `Authorization: Basic {clé}`, **redemande le statut à Orange**, puis `payments_record_verification` | Orange |
| `payments-reconcile` | Chaque minute : une recherche groupée chez Orange pour les tentatives non closes, puis `payments_record_verification` ; `?action=register-callback` enregistre le callback chez Orange (une fois) | pg_cron |

Code : `supabase/functions/_shared/payments/orange-money.ts` (adaptateur) et `core.ts` (orchestration).
Tests : `core.test.ts` (31) et `orange-money.test.ts` (18), lancés par `npm run test:security`.

## Secrets (Supabase → Edge Functions → Secrets) — jamais dans le chat, le site ou GitHub
| Nom | Valeur |
|---|---|
| `PAYMENTS_ENVIRONMENT` | `sandbox` puis `production` |
| `ORANGE_MONEY_CLIENT_ID` / `ORANGE_MONEY_CLIENT_SECRET` | identifiants de l'application « Ezial Marketplace » (sandbox puis production) |
| `ORANGE_MONEY_MERCHANT_CODE` | code marchand Orange Money (6 chiffres) |
| `ORANGE_MONEY_MERCHANT_NAME` | nom court sans accent, par exemple `Ezial` |
| `ORANGE_MONEY_CALLBACK_API_KEY` | longue valeur aléatoire (32 caractères ou plus), choisie par vous ; Orange la renverra à chaque callback |
| `ORANGE_MONEY_API_KEY` | seulement si Orange vous en a fourni une (en-tête `X-Api-Key`) |
| `ORANGE_MONEY_CALLBACK_URL` | facultatif (callback par requête) ; par défaut le callback enregistré est utilisé |
| `PAYMENTS_RECONCILE_SECRET` | longue valeur aléatoire ; la même dans le Vault sous le nom `payments_reconcile_secret` |

## Étapes (chacune sur accord explicite)
1. Secrets **sandbox** saisis ; déploiement des trois fonctions (`payment-webhook` et `payments-reconcile` sans vérification JWT : protégées par la clé de callback et par le secret partagé).
2. Enregistrement du callback chez Orange (une fois) : appel de `payments-reconcile?action=register-callback`.
3. Tâche planifiée (SQL donné le moment venu) : `payments-reconcile` chaque minute, avec l'en-tête `x-webhook-secret` lu dans le Vault.
4. Interface de paiement publiée, interrupteur toujours éteint ; tests en sandbox (numéros de test Orange) sur iPhone et Android.
5. Production : secrets de production, un petit paiement réel, puis `update public.payment_settings set orange_money_enabled = true;`.
   Arrêt d'urgence : `update public.payment_settings set orange_money_enabled = false;`

## Garanties testées
- Statut et montant toujours relus chez Orange (recherche par référence) ; le contenu d'un callback n'est jamais cru.
- Callback sans la bonne clé : refusé (401), rien n'est enregistré ; même callback répété : traité une fois.
- Orange injoignable : aucune écriture, aucune conclusion ; recherche incomplète : « inconnu », jamais « introuvable ».
- QR jamais valable au-delà du délai de paiement de la commande ; plus de QR à moins d'une minute de la fin.
- Jeton OAuth mis en cache, renouvelé avant expiration ; après un 401, une seule nouvelle tentative.
- Aucun numéro de client conservé ni journalisé ; aucun secret dans les messages d'erreur.
- Wave et les versements vendeurs restent non configurés.

## Questions encore ouvertes chez Orange
Algorithme de `X-Sonatel-Signature` ; en-tête `Authorization` sur un callback par requête ; simulation d'un paiement de QR
en sandbox ; liste blanche d'adresses IP ; procédure de remboursement.

## Test réservé (20 nov. 2026)
- Fonctions `payment-initiate` (JWT vérifié), `payment-webhook` et `payments-reconcile` (sans JWT, protégées par
  la clé de callback / le secret partagé) **déployées** ; sans secrets elles répondent 503 / 401 (vérifié).
- Migration 5 (`orange-money-5-testeurs.sql`) : seul le compte inscrit dans `payment_testers` voit le paiement
  Orange Money ; interrupteur général toujours éteint.
- Secrets générés dans le Vault par la personne (`payments_reconcile_secret`, `orange_money_callback_api_key`),
  recopiés par elle dans les secrets des fonctions (jamais dans la conversation ni dans le dépôt).
- Code marchand de test : `payments-reconcile?action=sandbox-test-numbers` (mode test uniquement).
- Limite connue : en mode test, l'application Max It réelle ne peut pas payer un QR de test ; la simulation d'un
  paiement dépend de ce qu'Orange fournit (question posée). Le vrai paiement de bout en bout se fera en production,
  sur le seul compte testeur, avec un petit montant, après accord.
