# Notifications WhatsApp — guide d'intégration

Ce document décrit le système de notifications WhatsApp automatiques d'Ezial et
les étapes à suivre pour le mettre en service.

> **État actuel : aucun message n'est envoyé.** Aucun fournisseur WhatsApp n'est
> choisi. Tant que le secret `WHATSAPP_PROVIDER` n'est pas renseigné avec un
> fournisseur dont l'adaptateur existe, le service d'envoi ne réserve aucune
> notification : elles restent « en attente » puis passent « expirées ».

---

## 1. Architecture

```
 Événements (base de données)                 File d'attente
 ───────────────────────────                  ──────────────
 commande acceptée (orders)        ──┐
 mission « en livraison »             ├──►  public.whatsapp_notifications
   (delivery_missions)               │      (une ligne par message, clé anti-doublon,
                                     │       statut, tentatives, expiration)
 tâche whatsapp-maintenance ─────────┘               │
   (pg_cron, toutes les 15 min) :                    │
   - rappel vendeur 24 h                             │
   - reprise des envois bloqués                      │
   - expiration des messages périmés                 │
                                                     ▼
                              tâche whatsapp-dispatch (pg_cron, toutes les minutes,
                              À PLANIFIER quand le fournisseur sera prêt)
                                                     │  net.http_post + x-webhook-secret
                                                     ▼
                              Edge Function whatsapp-dispatch
                              1. fournisseur prêt ?  ── non ──► enregistre « non prêt », ne réserve rien
                              2. whatsapp_claim_batch (20 max)
                              3. whatsapp_message_context : re-vérifie la commande
                              4. compose le message (texte + variables du modèle)
                              5. envoie via l'adaptateur du fournisseur
                              6. whatsapp_complete (envoyé / réessai / échec / ignoré)
                              7. whatsapp_record_dispatch (état visible dans l'admin)
                                                     │
                                                     ▼
                              Adaptateur fournisseur (interface WhatsAppProvider)
                              ── aucun implémenté aujourd'hui ──
                                                     │
                                                     ▼
                              Fournisseur officiel WhatsApp Business  ──►  téléphone
```

Fichiers :

- Migration SQL : tables `whatsapp_settings`, `whatsapp_consents`,
  `whatsapp_notifications`, déclencheurs, tâche `whatsapp-maintenance`,
  fonctions `whatsapp_claim_batch`, `whatsapp_message_context`,
  `whatsapp_complete`, `whatsapp_record_dispatch` (réservées à `service_role`).
- `supabase/functions/whatsapp-dispatch/core.ts` : logique d'envoi, textes des
  messages, fournisseurs (`DisabledProvider`, `TestProvider`). Aucun appel réseau.
- `supabase/functions/whatsapp-dispatch/index.ts` : point d'entrée de l'Edge
  Function (vérification du secret, accès base, lancement d'un passage).
- `supabase/functions/whatsapp-dispatch/core.test.ts` : tests
  (`node --test supabase/functions/whatsapp-dispatch/core.test.ts`).

Les messages ne sont **pas** stockés : ils sont recomposés au moment de l'envoi à
partir de la commande. Toute erreur dans les déclencheurs est absorbée : une
commande, un paiement ou un changement de statut ne peut jamais échouer à cause
de WhatsApp.

---

## 2. Les 4 notifications

| Type | Destinataire | Déclenchement | Clé anti-doublon | Validité |
|---|---|---|---|---|
| `buyer_order_confirmed` | Acheteur | Commande acceptée : à sa création par `create_order` (fin de transaction), ou lors d'un changement de `status` / `payment_status`. Jamais si la commande est annulée. Si `confirmation_requires_paid` = true : seulement quand `payment_status = 'paid'`. | `buyer_order_confirmed:<id commande>` | 24 h |
| `seller_new_order` | Chaque boutique de la commande | Même événement ; une notification par sous-commande (`order_shops`) non annulée, pour la boutique concernée uniquement. | `seller_new_order:<id sous-commande>` | 24 h |
| `buyer_out_for_delivery` | Acheteur | Une mission de livraison passe réellement au statut `out_for_delivery` (une seule fois par commande). Jamais si la commande est annulée. | `buyer_out_for_delivery:<id commande>` | 3 h |
| `seller_order_reminder` | Boutique | Tâche `whatsapp-maintenance` : 24 h après la notification « nouvelle commande » (et moins de 72 h après), si la sous-commande est toujours au statut `confirmed` (non prise en charge) et la commande non annulée. | `seller_order_reminder:<id sous-commande>` | 12 h |

La clé anti-doublon est unique en base : un même événement ne peut jamais
produire deux messages, même si le déclencheur s'exécute plusieurs fois.

**Re-vérification juste avant l'envoi** (`whatsapp_message_context`) : le
message est ignoré (« skipped ») si la commande a été annulée, si le paiement
n'est plus confirmé (quand il est exigé), si la livraison n'est plus « en
cours », si la sous-commande est annulée ou si le vendeur l'a déjà prise en
charge (rappel).

### Textes exacts

**Confirmation de commande (acheteur)** — « Bonjour, » seul si le prénom est inconnu :

```
Bonjour {prénom},

Merci pour votre commande sur Ezial !

Votre commande n°{numéro} a bien été confirmée.

Récapitulatif :
- {quantité} × {article}
- {quantité} × {article}

Total : {total} FCFA

Livraison : {quartier ou adresse, ou « Retrait en boutique »}

Merci de votre confiance.
Ezial — ezial.net
```

**Commande en route (acheteur)** :

```
Bonjour {prénom},

Votre commande Ezial n°{numéro} est en route !

Votre livreur est en chemin vers votre adresse de livraison.

Merci de rester disponible pour la réception.

Ezial — ezial.net
```

**Nouvelle commande (vendeur)** :

```
Bonjour,

Vous avez une nouvelle commande sur Ezial.

Commande n°{numéro}

Consulter la commande :
https://ezial.net/pro/seller/commandes/{id sous-commande}
```

**Rappel (vendeur)** :

```
Bonjour,

Votre commande Ezial n°{numéro} est toujours en attente de prise en charge.

Consulter la commande :
https://ezial.net/pro/seller/commandes/{id sous-commande}
```

Mise en forme : total avec une espace ordinaire comme séparateur de milliers
(`25 000`), quantités décimales avec une virgule et sans zéros inutiles
(`1,5`, `2`).

### Variables des modèles (templates)

Les fournisseurs officiels imposent des **modèles approuvés** pour écrire en
premier à un client. Chaque modèle doit être créé chez le fournisseur avec le
texte ci-dessus et les variables dans cet ordre :

| Type | Variables, dans l'ordre |
|---|---|
| `buyer_order_confirmed` | 1 prénom, 2 numéro de commande, 3 articles, 4 total (sans « FCFA »), 5 livraison |
| `buyer_out_for_delivery` | 1 prénom, 2 numéro de commande |
| `seller_new_order` | 1 numéro de commande, 2 lien |
| `seller_order_reminder` | 1 numéro de commande, 2 lien |

Points d'attention :

- WhatsApp n'accepte généralement pas de retour à la ligne dans une variable :
  la variable « articles » est donc sur une seule ligne, articles séparés par
  « ; » (ex. `2 × Tissu wax ; 1,5 × Bazin`). Le texte complet (`text`) garde,
  lui, un article par ligne.
- Le prénom peut être vide. Si le fournisseur refuse une variable vide, il
  faudra prévoir une variante du modèle sans prénom : à décider avec le
  fournisseur au moment de la création des modèles.

---

## 3. Réessais et expiration

- **5 tentatives maximum** par message. Après un échec temporaire, la
  tentative suivante a lieu après **1 min**, puis **5 min**, puis **15 min**,
  puis **60 min**. Au-delà, ou en cas d'erreur définitive (numéro invalide,
  modèle refusé…), le message passe « échec ».
- Un message non envoyé avant la fin de sa **fenêtre de validité** (24 h, 3 h,
  24 h, 12 h selon le type) passe « expiré » : un message « en route » envoyé
  le lendemain n'aurait plus de sens.
- Un message réservé mais resté bloqué (fonction interrompue) est remis en
  attente par `whatsapp-maintenance` au bout de 5 min.
- Une exception inattendue pendant un envoi compte comme un échec temporaire ;
  un message impossible à composer (donnée manquante) compte comme un échec
  définitif.

---

## 4. Consentement

- Aucun message n'est mis en file sans **consentement explicite** du compte
  destinataire (`whatsapp_consents.opted_in`) : sinon la ligne est enregistrée
  « ignorée » avec la raison `no_consent`.
- Le consentement se donne et se retire depuis le site (profil acheteur,
  boutique vendeur), uniquement pour son propre compte.
- Le retrait du consentement annule immédiatement tous les messages en
  attente pour ce compte (`consent_withdrawn`).

## 5. Minimisation des données

- Le numéro complet n'est conservé que tant que le message est en attente ;
  il est effacé dès que le message est envoyé, ignoré, en échec ou expiré.
  L'historique ne garde qu'une version masquée (`+22177•••67`).
- Les journaux de l'Edge Function ne contiennent jamais de numéro complet ni
  le texte des messages ; les numéros éventuellement présents dans les erreurs
  du fournisseur sont masqués avant enregistrement.
- Les messages aux vendeurs ne contiennent **aucune donnée de l'acheteur** :
  uniquement le numéro de commande et le lien vers leur propre sous-commande.
- Numéros acceptés : format international. Sénégal : mobiles `7X` uniquement
  (un fixe `33` ne reçoit pas WhatsApp).

---

## 6. Choix du fournisseur — avertissement

- Utiliser **uniquement un fournisseur officiel** de l'API WhatsApp Business
  (Meta directement, ou un partenaire officiel de Meta). **Jamais d'API
  WhatsApp non officielle** (automatisation de WhatsApp Web, applications
  modifiées…) : risque de bannissement du numéro et non-conformité.
- Les **4 modèles doivent être approuvés** par le fournisseur / Meta avant la
  mise en service.
- Le numéro expéditeur doit être enregistré et vérifié chez le fournisseur.

---

## 7. Secrets à configurer

Dans Supabase : **Edge Functions > Secrets**. Ne jamais mettre ces valeurs dans
le code ni dans le site. Valeurs à fournir par la personne ou par le
fournisseur choisi.

| Secret | Rôle | Valeur |
|---|---|---|
| `WHATSAPP_PROVIDER` | Nom du fournisseur. Absent ou `aucun` : rien n'est envoyé. `test` : simulation sans envoi. | `<à fournir>` |
| `WHATSAPP_API_URL` | Adresse de l'API du fournisseur | `<à fournir>` |
| `WHATSAPP_API_TOKEN` | Jeton d'accès à l'API | `<à fournir>` |
| `WHATSAPP_SENDER_ID` | Numéro / identifiant expéditeur | `<à fournir>` |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | Identifiant du compte WhatsApp Business (si requis par le fournisseur) | `<à fournir>` |
| `WHATSAPP_TEMPLATE_BUYER_ORDER_CONFIRMED` | Modèle « commande confirmée » | `<à fournir>` |
| `WHATSAPP_TEMPLATE_BUYER_OUT_FOR_DELIVERY` | Modèle « commande en route » | `<à fournir>` |
| `WHATSAPP_TEMPLATE_SELLER_NEW_ORDER` | Modèle « nouvelle commande » | `<à fournir>` |
| `WHATSAPP_TEMPLATE_SELLER_ORDER_REMINDER` | Modèle « rappel vendeur » | `<à fournir>` |
| `WHATSAPP_WEBHOOK_SECRET` | Vérification de signature des accusés de livraison (si webhooks de statut) | `<à fournir>` |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Jeton de vérification d'abonnement aux webhooks (si webhooks de statut) | `<à fournir>` |
| `WHATSAPP_DISPATCH_SECRET` | Secret partagé entre la tâche planifiée et l'Edge Function. Sans lui, la fonction refuse tout (503). | `<à générer : longue valeur aléatoire>` |
| `WHATSAPP_TEST_MODE` | Facultatif, avec `WHATSAPP_PROVIDER=test` : `succes`, `echec_temporaire` ou `echec_definitif` | — |

`SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont fournis automatiquement aux
Edge Functions. La clé `service_role` ne doit jamais atteindre le site.

Les webhooks de statut (accusés de livraison / lecture) **ne sont pas
implémentés** : ils devront l'être dans une Edge Function séparée qui vérifie
la signature avant tout traitement (voir le commentaire TODO dans `index.ts`).

### Secret dans le Vault

La tâche planifiée lit le secret dans le Vault. Même valeur que
`WHATSAPP_DISPATCH_SECRET`, à exécuter une fois dans **SQL Editor** :

```sql
select vault.create_secret('<même valeur que WHATSAPP_DISPATCH_SECRET>', 'whatsapp_dispatch_secret');
```

---

## 8. Planifier le service d'envoi (uniquement quand tout est prêt)

1. Déployer la fonction (sans vérification JWT : elle est protégée par
   `x-webhook-secret`, comme `send-push`) :
   `supabase functions deploy whatsapp-dispatch --no-verify-jwt`
2. Configurer les secrets (section 7) et le secret Vault.
3. Planifier l'appel toutes les minutes, dans **SQL Editor** :

```sql
select cron.schedule('whatsapp-dispatch', '* * * * *', $$
  select net.http_post(
    url := 'https://lkqezdrdbogtborgjvlw.supabase.co/functions/v1/whatsapp-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'whatsapp_dispatch_secret')
    ),
    body := '{}'::jsonb
  );
$$);
```

Pour arrêter le service : `select cron.unschedule('whatsapp-dispatch');`

Même planifiée, la fonction n'envoie rien tant que `WHATSAPP_PROVIDER` ne
désigne pas un adaptateur existant : elle enregistre seulement l'état « non
prêt » (visible dans l'administration, page WhatsApp).

---

## 9. Paiement en ligne : `confirmation_requires_paid`

Aujourd'hui, une commande est acceptée dès sa création par `create_order`
(paiement à la livraison) : la confirmation part donc à la création.

Quand Wave / Orange Money seront **validés par webhook côté serveur**, passer le
réglage à `true` pour que la confirmation attende `payment_status = 'paid'` :

```sql
update public.whatsapp_settings set confirmation_requires_paid = true, updated_at = now() where id;
```

Ne pas l'activer avant : les commandes payées à la livraison ne recevraient
plus de confirmation.

---

## 10. Ajouter l'adaptateur d'un fournisseur

1. Une fois le fournisseur officiel choisi, lire **sa documentation
   officielle** (format d'envoi d'un modèle, codes d'erreur).
2. Implémenter l'interface `WhatsAppProvider` (dans `core.ts` ou un nouveau
   fichier du même dossier) :
   - `name` : nom court, identique à la valeur de `WHATSAPP_PROVIDER` ;
   - `isReady()` : `ready: false` avec une raison claire si un secret ou un
     identifiant de modèle manque (rien ne sera alors réservé) ;
   - `send(msg)` : envoyer le modèle `msg.templateId` avec les variables
     `msg.params` au numéro `msg.to` ; renvoyer `{ ok: true, providerMessageId }`
     ou `{ ok: false, retryable, error }` — `retryable: true` pour les erreurs
     temporaires (réseau, limite de débit, erreur 5xx), `false` pour les
     erreurs définitives (numéro invalide ou sans WhatsApp, modèle refusé).
     Ne jamais placer le numéro complet dans `error`.
3. Lire ses secrets (`WHATSAPP_API_URL`, `WHATSAPP_API_TOKEN`,
   `WHATSAPP_SENDER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`) dans
   `createProviderFromEnv` et y ajouter son nom.
4. Ajouter des tests dans `core.test.ts` avec un `fetch` simulé (aucun appel
   réseau réel dans les tests).

---

## 11. Tester avant la mise en service

1. Déployer la fonction avec `WHATSAPP_PROVIDER=test` : aucun message ne part,
   les envois sont simulés et marqués « envoyés » avec un identifiant
   `test-1`, `test-2`…
2. **Attention** : en mode test, les vraies notifications en attente sont
   consommées (marquées « envoyées » avec le fournisseur `test`) sans que
   personne ne reçoive rien. Tester avec des commandes de test et des comptes
   de test ayant donné leur consentement, puis revenir à `aucun`.
3. Vérifier dans l'administration (page WhatsApp) : dernier passage,
   fournisseur, statuts des notifications.
4. Simuler les erreurs avec `WHATSAPP_TEST_MODE=echec_temporaire` (le message
   revient « en attente » avec un délai) puis `echec_definitif` (« échec »).
5. Seulement ensuite : renseigner le vrai fournisseur, ses secrets et ses
   modèles approuvés, puis faire un premier envoi réel vers un numéro de test
   appartenant à la personne.
