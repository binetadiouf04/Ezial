# Campagnes promotionnelles — phase 1 : contrat commun (base ↔ admin ↔ marketplace)

**Mise à jour du 25 nov. 2026, PRIORITAIRE sur tout le reste de ce fichier (y compris la mise à jour du 21 nov.) :**
- **Plus aucune compensation manuelle.** Le vendeur est payé **automatiquement**, comme sans promotion : sa vente
  (`seller_transactions` 'sale', `order_shops.net_amount`) = ses articles au prix habituel (après ses propres promos
  produits) − sa commission habituelle (inchangée). La réduction de la campagne est **entièrement payée par Ezial**.
- **Seule exception : la part vendeur facultative acceptée** (`promotion_seller_shares`, agreed = true) : V = min(A, valeur)
  (fixe, par commande) ou round(A × % / 100), **déduite automatiquement** de la vente (et de `order_shops.net_amount`),
  **plafonnée** au net de la vente (articles − commission) : le solde vendeur ne devient jamais négatif. Jamais sur la
  livraison offerte.
- **Supprimés** (n'existent pas en base) : table `promotion_compensations`, fonctions `admin_promotion_compensations`,
  `admin_mark_compensations_paid`, `seller_promotion_compensations` (et les champs `payout_orange_money`, `payout_wave`,
  `seller_share`, `gross_allocation`, `paid_*`).
- **Renommé** : `order_shops.promo_compensation` → `order_shops.promo_allocation` (A : part de la réduction produits
  rattachée à la boutique, information seulement ; coût Ezial de la boutique = `promo_allocation − promo_seller_share`).
  `order_shops.promo_seller_share` = V (part déduite). Le vendeur voit V dans le détail de sa commande
  (« Participation à la campagne »).
- **Statistiques** (`admin_promotions_list().stats`) : `ezial_cost` = réductions produits + livraison offerte − parts
  vendeurs ; `ezial_net` = commissions − `ezial_cost` ; `seller_funded` = total des parts vendeurs.
- **Pas de double authentification propre aux campagnes** : les fonctions admin des campagnes vérifient seulement la
  ligne dans `admins`, comme les autres fonctions admin existantes.
- Annulation / impayé : utilisation et budget rendus une seule fois ; la vente du vendeur suit le circuit habituel
  d'annulation. Annulation d'une seule boutique : l'utilisation du code n'est pas rendue.
- `create_order` conserve la livraison urgente : total = (sous-total − promos produits − promo_discount) + delivery_fee
  − delivery_discount + gift_wrap_fee + urgent_fee.

**Mise à jour du 21 nov. 2026 (soir), remplacée sur les compensations par celle du 25 nov. ci-dessus :**
- **Quartiers retirés** des campagnes (pas de delivery_neighborhoods / promotion_neighborhoods) : toute la région
  de Dakar est livrée ; `public_active_promotions.neighborhoods` et `admin_promotions_list.neighborhoods` = tableaux vides.
- **Part vendeur facultative** : `promotion_seller_shares(promotion_id, shop_id, share_type 'fixed'|'percent',
  share_value, agreed, agreed_note)` ; part vendeur V = min(A, valeur) (fixe, par commande) ou round(A × % / 100) ;
  le solde automatique du vendeur baisse de A (réduction de sa boutique), Ezial lui reverse A − V (compensation) ;
  commission inchangée ; jamais sur la livraison offerte. `admin_promotion_save` reçoit `seller_shares`,
  `admin_promotions_list` les renvoie, stats + `seller_funded`.
- **Paiement des compensations** : `admin_promotion_compensations` renvoie aussi `payout_orange_money`,
  `payout_wave` (numéros approuvés de la boutique), `seller_share`, `gross_allocation` ; l'admin copie numéro et
  montant, paie depuis son application, puis marque « payé » (aucun lien profond inventé).

Décisions de la propriétaire (21 nov. 2026) :
- un seul système « Campagnes promotionnelles » ; phase 1 = réduction fixe, pourcentage, livraison offerte ;
- **Ezial finance toujours** la promotion ; le vendeur garde sa vente au prix normal et sa commission
  habituelle (10 % Free, 8 % Plus, 0 % Ezial Boutique), **jamais modifiée par une promotion** ;
- la part de la réduction rattachée à une boutique est retirée de son solde automatique et inscrite
  « à reverser par Ezial » (compensation), payée **manuellement** par l'administratrice ;
- **une seule promotion par commande** (le code saisi, sinon la meilleure campagne automatique) ;
- **le code est compté dès la commande** (verrou : jamais de dépassement en cas de commandes simultanées) ;
  utilisation, budget et compensations **rendus** si la commande est annulée ou impayée ;
- **livraison offerte au prorata** des articles éligibles livrés (panier mélangé), plafonnée ;
  un code « produits » ne touche jamais la livraison ;
- zones = **liste de quartiers** (région de Dakar), gérée dans l'admin ; vérifiée côté serveur ;
- dates en heure de Dakar (UTC+0 toute l'année : stockage timestamptz).

## Tables (public)
- `delivery_neighborhoods(id uuid, name text unique, department text null, is_active bool, sort_order int)`
  — lecture publique ; écriture admin. Amorcée avec la liste actuelle du checkout.
- `promotions(id, name, code text unique null (MAJUSCULES, A-Z 0-9 _ -, 3 à 30), kind 'fixed'|'percent'|'free_delivery',
  value numeric, max_discount int null, min_amount int, delivery_cap int null, starts_at, ends_at,
  status 'draft'|'active'|'paused'|'ended', audience 'all'|'new_customers', max_uses_total int null,
  max_uses_per_customer int (défaut 1), budget_max int null, uses_count int, budget_used int, created_by, created_at, updated_at)`
  — sans code = automatique.
- `promotion_targets(promotion_id, target_type 'product'|'shop'|'category'|'subcategory', target_ref text)`
  — subcategory : « categorie/sous-categorie » ; aucune cible = tout le catalogue.
- `promotion_neighborhoods(promotion_id, neighborhood_id)` — aucun = tous les quartiers.
- `promotion_redemptions(id, promotion_id, order_id unique, customer_id, status 'counted'|'cancelled',
  eligible_amount, product_discount, delivery_discount, ezial_cost, created_at, cancelled_at)`.
- `promotion_compensations(id, redemption_id, order_id, order_shop_id, shop_id, amount,
  status 'due'|'paid'|'cancelled', paid_at, paid_method 'wave'|'orange_money'|'especes'|'virement'|'autre',
  paid_reference, paid_by, note, created_at)`.
- `orders` + `promotion_id uuid null`, `promo_discount int default 0` (réduction produits de la campagne),
  `delivery_discount int default 0` ; `delivery_fee` reste le montant **initial** ; `discount_amount` garde son sens
  actuel (promos produits + réduction de la campagne) ;
  `total_amount = (products_subtotal − promos produits − promo_discount) + delivery_fee − delivery_discount + gift_wrap_fee`.
- `order_shops` + `promo_compensation int default 0` (part de la boutique, retirée de son solde automatique).

## Fonctions (RPC)
Client (authenticated) :
- `promotions_preview(payload jsonb) → jsonb` — payload : `{ items:[{productId, variantId, quantity, selectedOptions}],
  shopFulfillments:{<shopId>:{type:'delivery'|'pickup'}}, neighborhood, promoCode, deliveryFeeEstimate }`.
  Réponse : `{ valid: bool, message: text|null, applied: null | { promotionId, code, name, kind,
  productDiscount, deliveryDiscount, deliveryFee, eligibleAmount, automatic: bool } }`.
  Sans code : meilleure campagne automatique (ou `applied: null`, `valid: true`). Aperçu seulement :
  `create_order` recalcule tout.
- `public_active_promotions() → table(promotion_id, name, kind, min_amount, delivery_cap, ends_at, targets jsonb, neighborhoods text[])`
  (anon + authenticated) — campagnes **automatiques** actives seulement (jamais un code), pour « Livraison offerte ».
- `create_order(payload)` inchangé côté appel (`promoCode`, `neighborhood` déjà envoyés) ; message d'erreur clair
  si le code saisi n'est pas valable ; la commande renvoyée contient `promotion_id`, `promo_discount`, `delivery_discount`.
- `validate_promo_code(p_code, p_subtotal)` conservée pour compatibilité (anciennes versions du site).

Admin (table admins + double authentification comme les autres fonctions admin) :
- `admin_promotions_list() → jsonb` : campagnes + cibles + quartiers + statistiques
  `{orders, product_discount, delivery_discount, ezial_cost, budget_remaining, sales (CA produits des commandes
  concernées), commissions, ezial_net (commissions − ezial_cost)}` (commandes non annulées).
- `admin_promotion_save(p jsonb) → uuid` (création si `id` absent), `admin_promotion_set_status(p_id, p_status)`.
- `admin_promotion_compensations(p_status text default null) → jsonb` ;
  `admin_mark_compensations_paid(p_ids uuid[], p_method text, p_reference text, p_note text)`.
- `admin_neighborhood_save(p jsonb) → uuid` (nom, département, actif, ordre).
Vendeur :
- `seller_promotion_compensations(p_shop_id uuid) → jsonb` (sa boutique uniquement) :
  `[{id, order_number, amount, status, paid_at, paid_method, created_at}]`.

## Messages (français, côté serveur)
« Code promo invalide. » · « Ce code n'est pas encore valable. » · « Ce code a expiré. » ·
« Ce code est suspendu. » · « Ce code est réservé aux nouveaux clients. » ·
« Vous avez déjà utilisé ce code. » · « Ce code n'est plus disponible. » ·
« Ce code n'est pas valable dans votre quartier. » · « Aucun article de votre panier n'est concerné par ce code. » ·
« Il manque X FCFA d'articles concernés pour profiter de ce code (minimum Y FCFA). » ·
« Ce code concerne la livraison : choisissez la livraison à domicile pour en profiter. »
