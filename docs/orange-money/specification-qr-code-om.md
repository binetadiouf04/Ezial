# Orange Money — API « QR CODE – OM » : ce que dit la documentation officielle

Source : pages `developer.orange-sonatel.com/dev/docs/orange-money` (« Orange Money API », v1.1.0) et
`/dev/docs/solutions` (« OM Pay API », 1.0.0), transmises en PDF par la personne le 20 nov. 2026.
Aucun secret dans ce fichier.

## Quelle offre ?
- **QR CODE – OM** (offre approuvée pour l'application « Ezial Marketplace », avec OAuth) = page `orange-money`,
  section **Merchant Payment → Generate QR code** : `POST /api/eWallet/v4/qrcode`.
- **OM Pay** = autre offre (`/dev/docs/solutions`) : `POST /v1/onlinePayment…`, renvoie une `paymentUrl`
  (page de paiement hébergée), sans OAuth. **Ne pas la mélanger** avec QR CODE – OM.
- La page `orange-money` documente aussi d'autres opérations (cash-in, profils, PIN…) : non approuvées,
  non utilisées (un appel renverrait 403, code 11).

## Environnements et authentification
- Sandbox `https://api.sandbox.orange-sonatel.com` · Production `https://api.orange-sonatel.com` (HTTPS uniquement).
- OAuth 2.0 *client credentials* : `POST /oauth/v1/token`, corps `application/x-www-form-urlencoded`
  (`client_id`, `client_secret`, `grant_type=client_credentials`). Réponse : `access_token`, `token_type`,
  `expires_in` (exemple 3600), `scope`. Mettre le jeton en cache et le renouveler avant `expires_in`.
- Limite en sandbox : **60 requêtes par minute** (429, code 9).
- Erreurs au format RFC 7807 (`code`, `detail`, `violations`). Code **4004** : QR expiré. Code **51** (HTTP 500) :
  « requête en attente, **ne pas réessayer** » → interroger le statut.

## Création du QR (`POST /api/eWallet/v4/qrcode`)
- En-têtes : `Authorization: Bearer …` ; `X-Callback-Url` (HTTPS, optionnel : sinon callback enregistré
  via `POST /api/notification/v1/merchantcallback`) ; `X-Api-Key` (optionnel, si le contrat en fournit une).
- Corps : `code` (code marchand, 6 chiffres, requis), `name` (nom du marchand, requis), `amount {value, unit:"XOF"}`,
  `validity` (secondes, **max 86 400** → 30 min = 1 800 s est accepté), `reference` (**référence partenaire,
  utilisable pour retrouver la transaction**), `callbackSuccessUrl`, `callbackCancelUrl`, `metadata` (≤ 10 clés),
  `restrictions {isSingleUse, payerMsisdn}`.
- Réponse : `qrCode` (PNG en base64), `deepLink`, `deepLinks {MAXIT, OM}` (liens https), `shortLink`, `qrId`,
  `validity`, `validFor {startDateTime, endDateTime}`. **Pas d'identifiant de transaction à ce stade** : il n'existe
  qu'après le paiement.

## Notification (callback) et vérification
- Callback `POST` HTTPS (certificat validé) : `amount`, `partner {idType:"CODE", id}`, `customer {idType:"MSISDN", id}`,
  `reference`, `type:"MERCHANT_PAYMENT"`, `channel`, `transactionId` (ex. `MP220928.1029.C58502`),
  `paymentMethod:"QRCODE"`, `status:"SUCCESS"`. En-tête `Authorization: Basic {apiKey}` (clé enregistrée avec le callback)
  et `X-Sonatel-Signature` (**algorithme non précisé dans les PDF**).
- **Source de vérité** : `GET /api/eWallet/v1/transactions/{transactionId}/status` → `{"status": …}`, et
  `GET /api/eWallet/v1/transactions` (recherche par `reference`, `type=MERCHANT_PAYMENT`, `status`, dates ; `size` ≤ 500).
  Statuts : ACCEPTED, CANCELLED, FAILED, INITIATED, PENDING, PRE_INITIATED, REJECTED, SUCCESS.
  « Un statut final est disponible **dans les 24 h au plus tard** » pour les transactions PENDING.
- Sandbox : `GET /api/assignments/v1/partner/sim-cards` fournit des numéros de test (MERCHANT, CUSTOMER, RETAILER) et leur PIN.

## Conséquences pour Ezial
- La `reference` envoyée = l'identifiant de la tentative Ezial (`payment_transactions.id`) ; aucune page de paiement
  hébergée : l'écran de paiement affiche le QR (ordinateur) et les liens `MAXIT` / `OM` (iPhone, Android).
- Aucune transaction n'existe chez Orange tant que le QR n'a pas été scanné : « introuvable » n'a de sens qu'**après**
  la fin de validité du QR (+ marge) ; une transaction PENDING peut mettre jusqu'à 24 h à se conclure : **jamais
  d'annulation tant qu'un statut incertain subsiste**.
- Une vérification par lot (une recherche sur les dernières minutes) respecte la limite de 60 requêtes/minute.
- Aucune API de reversement vendeur n'est utilisée.

## Informations encore à obtenir d'Orange
1. Algorithme et clé de `X-Sonatel-Signature` ; politique de nouvelle tentative des callbacks.
2. Un callback passé par `X-Callback-Url` (par requête) reçoit-il aussi `Authorization: Basic` ?
3. Sandbox : comment simuler le paiement d'un QR par un client (application, API ?) et un échec / une expiration.
4. Sens exact de `restrictions.isSingleUse` ; contraintes sur `name` (accents, longueur) ; `X-Api-Key` fournie ?
5. Callbacks envoyés pour les échecs ou seulement pour `SUCCESS` ?
6. Liste blanche d'adresses IP éventuelle (les fonctions Supabase n'ont pas d'IP fixe).
7. Procédure de remboursement manuel (back-office) et frais.
