# Proposition — double authentification de l'espace administrateur

État : **proposition**. Rien n'est développé ni déployé. Gratuit (TOTP de Supabase Auth, sans SMS).

## Connexion administrateur actuelle (analysée)

- `src/lib/supabaseAdminAuth.ts` : e-mail et mot de passe via Supabase Auth, puis lecture de la table `admins`. Au rechargement, même contrôle sur la session existante.
- Côté serveur, « administrateur » = présence dans `admins`. 53 politiques RLS et 25 fonctions vérifient cette table ; 2 fonctions Edge aussi (`create-driver`, `send-push-campaign`).
- Le compte administrateur est dédié : il ne possède ni boutique, ni profil client, ni commande (vérifié). La double authentification ne gênera donc aucun autre usage de ce compte.
- Aucun facteur n'est enregistré aujourd'hui.

## Fonctionnement proposé

1. **Activation** (page admin, carte « Double authentification ») : un QR code à scanner avec une application d'authentification (Google Authenticator, Microsoft Authenticator, 1Password…), puis un premier code à 6 chiffres pour confirmer.
2. **Connexion** : e-mail et mot de passe, puis écran « Vérification en deux étapes » demandant le code à 6 chiffres. Tant que le code n'est pas validé, aucun écran admin ne s'affiche.
3. **Contrôle par le serveur** (le point important) : une fonction exécutée avant chaque requête à l'API refuse toute requête d'un administrateur ayant un facteur vérifié tant que sa session n'a pas été validée par le code (niveau `aal2` du jeton). Un seul point de contrôle couvre ainsi les 53 politiques et les 25 fonctions, sans les modifier. Les deux fonctions Edge admin vérifient le même niveau.
4. **Clients, vendeurs, livreurs** : aucun changement. Le contrôle ne s'applique qu'aux comptes présents dans `admins` avec un facteur vérifié. Leurs écrans de connexion ne sont pas modifiés.

## Perte de l'application d'authentification

Supabase ne fournit pas de codes de secours pour le TOTP. Deux protections, gratuites :

- **Deux facteurs dès l'activation** : enregistrer le même compte sur deux appareils (ou un téléphone et un gestionnaire de mots de passe). La perte d'un appareil ne bloque rien.
- **Récupération de dernier recours** : depuis l'éditeur SQL de Supabase (lui-même protégé par le compte Supabase et sa propre double authentification), supprimer le facteur perdu : `delete from auth.mfa_factors where user_id = '<identifiant de l'administrateur>';`. L'administrateur se reconnecte alors avec son mot de passe et réactive la double authentification. Personne d'autre que le titulaire du compte Supabase ne peut le faire.

## Étapes de validation proposées

| Étape | Action | Réversible | Vérification |
|---|---|---|---|
| 1 | Je développe l'interface (activation, écran de code) sur la branche | Oui | Tests dans un navigateur de test |
| 2 | Vous validez, fusion : l'interface est en ligne, rien n'est encore imposé | Oui | Connexion admin inchangée sans facteur |
| 3 | Vous activez la double authentification sur deux appareils | Oui (désactivable) | Déconnexion, reconnexion avec code |
| 4 | Vous exécutez un court script SQL qui active le contrôle par le serveur | Oui (une ligne pour le retirer) | Je vérifie qu'une session sans code est refusée et que clients, vendeurs et livreurs fonctionnent |
| 5 | Redéploiement des deux fonctions Edge admin | Oui | Envoi d'une campagne de test |

Risque principal : le contrôle de l'étape 4 s'exécute avant chaque requête de tous les utilisateurs. Il est volontairement minimal (aucun effet sans session, une lecture indexée sinon) et retirable immédiatement ; il sera testé localement puis en réel à un moment sans commandes.

Limite : à vérifier dans le tableau de bord Supabase que le TOTP est bien activé pour le projet (Authentication → Multi-Factor).
