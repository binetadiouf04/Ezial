# Accès Ezial Plus offerts (3 ou 6 mois)

Ezial peut offrir à une boutique 3 ou 6 mois d'Ezial Plus (appelé « Premium » en interne) : partenaires, collaborations, vendeurs stratégiques, promotions. Cet accès est **réservé aux administrateurs** et **indépendant de l'essai standard de 30 jours** (ni remplacé, ni remis à zéro).

## Ce que reçoit la boutique
- Forfait Ezial Plus actif : 30 produits publiés, commission de 8 %, badge et avantages de visibilité habituels.
- « Gratuit » = aucun abonnement à payer. Les commissions sur les ventes s'appliquent toujours.
- Aucun moyen de paiement demandé, aucun prélèvement automatique.

## Procédure d'attribution (administrateur)
1. Admin → Boutiques → ouvrir la fiche de la boutique.
2. Section « Offrir un accès Ezial Plus » : choisir « 3 mois gratuits » ou « 6 mois gratuits », saisir un motif (facultatif), « Offrir ».
3. Confirmer dans la fenêtre : la date de fin est calculée par le serveur au moment de la confirmation.
4. Prolonger (+3 ou +6 mois) ou « Mettre fin à l'accès » depuis la même carte ; chaque action demande une confirmation.
5. Historique de la boutique : chaque accès (actif, terminé, interrompu) et ses événements (création, prolongation, fin, expiration, administrateur, motif).
6. Liste des boutiques : filtre « Accès offerts (n) », ligne « Accès Ezial Plus offert jusqu'au … · n jours restants ».

## Règles de priorité
Abonnement payant valide > accès offert > essai standard de 30 jours > Free.
- Un accès offert est **refusé** si la boutique a un abonnement payant valide (jamais d'écrasement).
- Un seul accès offert actif par boutique (prolonger plutôt que recréer).
- Pendant un accès offert, l'essai standard est refusé avec un message clair ; s'il était en cours, ses dates restent intactes.
- Si la boutique s'abonne pendant l'accès offert, le paiement s'empile après la fin de l'accès ; l'accès offert ne peut alors plus être prolongé ni interrompu, et il expire sans effet sur l'abonnement.
- Fin anticipée : retour à l'essai standard s'il courait encore, sinon Free.

## Expiration automatique
Le traitement horaire existant (`process-subscription-expirations`, pg_cron) :
- marque l'accès « expiré » ; la boutique garde Ezial Plus si un abonnement payant valide existe, sinon passe à Free (commission de 10 % sur les **nouvelles** ventes, limite de 10 produits) ;
- met hors ligne les produits au-delà de 10 selon la règle déterministe existante (les plus vendus, puis les plus récemment modifiés) ; **aucun produit n'est supprimé** et le vendeur peut choisir ceux à garder en ligne ;
- ne modifie jamais la commission des commandes déjà confirmées ;
- prévient le vendeur 7 jours avant la fin et à l'expiration ; aucun prélèvement.

## Base de données
Fichier : `docs/sql/acces-premium-offerts.sql` (une transaction, rejouable). Retour arrière : `docs/sql/acces-premium-offerts-retour-arriere.sql` (conserve la table et l'historique).
- Table `premium_grants` (boutique, durée, début, fin, fin d'origine, statut, motif, administrateur, historique de prolongations/arrêt) ; lecture réservée aux administrateurs et au propriétaire de la boutique ; aucune écriture directe.
- Fonctions `admin_grant_premium`, `admin_extend_premium_grant`, `admin_end_premium_grant` (vérifient le rôle administrateur dans `admins`, dates calculées côté serveur, audit dans `finance_audit_log`).
- `activate_seller_trial` protégée contre l'écrasement d'un accès offert ou d'un abonnement payant valide ; `process_subscription_expirations` étendue.

## À exécuter avant de publier l'interface
1. Exécuter `docs/sql/acces-premium-offerts.sql` dans l'éditeur SQL de Supabase (6 lignes « ok » attendues).
2. Publier ensuite l'interface. Tant que la migration n'est pas exécutée, l'interface affiche « Module pas encore installé » côté admin et reste inchangée côté vendeur.
