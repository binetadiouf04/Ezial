# EZIAL — Marketplace premium mode & beauté (Dakar)

[![Open in Bolt](https://bolt.new/static/open-in-bolt.svg)](https://bolt.new/~/sb1-fndxd9ts)

EZIAL est une marketplace en ligne dédiée à la mode, la beauté, les cheveux et
les parfums, pensée pour le marché dakarois. Elle connecte des vendeurs
sélectionnés avec des clientes à travers une expérience d'achat fluide, avec
livraison consolidée et retrait en boutique.

## Aperçu

- **Marketplace grand public** — navigation par catégories, fiches produit avec
  galerie d'images, recherche, boutiques, panier multi-vendeurs, checkout en
  plusieurs étapes, suivi de commande en temps réel.
- **Espace PRO** — trois tableaux de bord séparés pour les vendeurs, les
  administrateurs et les livreurs, accessibles via `/pro`.
- **Paiement** — Wave, Orange Money & PayPal (simulation, aucun paiement réel).
- **Livraison Ezial** — une seule livraison regroupée pour les articles de
  plusieurs boutiques, sous 4–48 h à Dakar. Retrait en boutique également
  disponible.

## Fonctionnalités

### Côté cliente

- Page d'accueil avec catégories circulaires, produits tendances, promotions,
  boutiques en vedette et nouveautés.
- Pages catégorie avec filtres (prix, couleur, note) et tri.
- Fiche produit avec galerie d'images, sélection de variantes (taille, couleur,
  densité…), prix dynamiques selon les variantes, avis clients et produits
  similaires.
- Recherche instantanée avec suggestions de produits et de boutiques.
- Pages boutique avec onglets Accueil / Produits / Avis.
- Panier persistant multi-vendeurs, articles sauvegardés pour plus tard.
- Checkout en 4 étapes : coordonnées → mode de réception → paiement →
  confirmation.
- Suivi de commande avec timeline de livraison et code de retrait en boutique.
- Favoris, profil et historique de commandes.

### Côté vendeur (`/pro` → Vendeur)

- Tableau de bord avec chiffre d'affaires, commandes récentes et alertes stock.
- Gestion des commandes avec avancement du statut (préparation → prête →
  collectée/livrée).
- Gestion des produits : ajout, modification, activation/désactivation, gestion
  du stock, limite de 25 produits actifs.
- Finances : ventes, commission Ezial (8 %), net vendeur, transactions.
- Paramètres de boutique : logo, bannière, description, adresse, horaires,
  options de livraison/retrait.

### Côté administrateur (`/pro` → Admin)

- Tableau de bord global (volume, boutiques, commandes, revenus).
- Validation des produits soumis par les vendeurs (approuver / refuser avec
  motif).
- Gestion des boutiques (activation / suspension).
- Gestion des commandes et suivi détaillé.
- Gestion des livreurs et missions de livraison avec preuves photo.
- Finances : commissions, paiements vendeurs et livreurs, transactions.

### Côté livreur (`/pro` → Livreur)

- Missions de livraison assignées avec timeline.
- Détail mission : collecte, livraison, photo de preuve.
- Revenus hebdomadaires et statistiques.

## Stack technique

- **React 18** + **TypeScript**
- **Vite** — bundler et dev server
- **Tailwind CSS** — styling utilitaire avec système de design personnalisé
  (palette bordeaux / crème, typographie display + sans)
- **Lucide React** — icônes
- **Supabase** — backend (base de données, auth, edge functions)

## Démarrage

```bash
# Installer les dépendances
npm install

# Lancer le serveur de développement
npm run dev

# Construire pour la production
npm run build

# Vérifier le typage
npm run typecheck

# Linter
npm run lint
```

## Structure du projet

```
src/
├── components/        # Composants UI réutilisables (ProductCard, Header, CartDrawer…)
├── data/              # Données catalogue : produits, boutiques, catégories, filtres
├── pages/             # Pages marketplace grand public
│   ├── HomePage.tsx
│   ├── ProductPage.tsx
│   ├── CartPage.tsx
│   ├── CheckoutPage.tsx
│   └── …
├── pro/               # Espace PRO (vendeurs, admins, livreurs)
│   ├── components/
│   ├── layouts/
│   ├── pages/
│   │   ├── admin/
│   │   ├── seller/
│   │   └── driver/
│   ├── ProContext.tsx
│   └── data.ts
├── store/             # Contexte global (panier, commandes, favoris, navigation)
└── App.tsx            # Routeur principal
```

## Notes

- Les images produits proviennent de [Pexels](https://www.pexels.com) (libres de
  droits). Un composant `SmartImage` affiche un fallback automatique si une
  image ne se charge pas.
- Les paiements sont simulés — aucun transaction réelle n'est traitée.
- L'authentification Supabase et la persistance des données peuvent être
  activées via les variables d'environnement (voir `.env`).

---

Réalisé avec [Bolt](https://bolt.new).
