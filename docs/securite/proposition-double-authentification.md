# Double authentification de l'espace administrateur

État au 13 novembre 2026 : **développée et testée sur la branche (PR n°21), non activée en production**. Aucun appareil n'est enregistré, aucun script exécuté. Gratuit : codes TOTP de Supabase Auth, sans SMS.

## Ce qui a été développé

| Élément | Fichiers |
|---|---|
| Écran « Vérification en deux étapes » après le mot de passe | `src/pro/components/AdminMfaChallenge.tsx`, `src/pro/components/LoginForm.tsx`, `src/pro/ProContext.tsx`, `src/lib/supabaseAdminAuth.ts` |
| Page admin **Sécurité** : activer, ajouter un appareil de secours, retirer un appareil | `src/pro/pages/admin/AdminSecurity.tsx`, `src/pro/components/AdminMfaCard.tsx`, `src/lib/supabaseMfa.ts` |
| Contrôle par le serveur | `docs/sql/securite-mfa-admin.sql` (retour arrière fourni) |
| Fonctions serveur réservées à l'administrateur | `create-driver`, `send-push-campaign` |

Clients, vendeurs et livreurs : **aucun changement**. Leurs écrans de connexion ne sont pas modifiés et le contrôle ne s'applique qu'aux comptes de la table `admins` ayant un appareil vérifié.

## Parcours d'inscription de l'appareil (à valider avant activation)

1. Se connecter à l'espace administrateur comme aujourd'hui (e-mail et mot de passe).
2. Menu **Sécurité** → carte « Double authentification » → **Activer la double authentification**.
3. Un QR code s'affiche, avec la clé en texte pour une saisie manuelle. Le scanner avec une application d'authentification (Google Authenticator, Microsoft Authenticator, 1Password, Mots de passe d'Apple…).
4. Saisir le code à 6 chiffres affiché par l'application → message « Appareil enregistré. Le code vous sera demandé à chaque connexion à l'administration. »
5. **Ajouter tout de suite un appareil de secours** (même carte, « Ajouter un appareil de secours ») : un second téléphone, ou un gestionnaire de mots de passe. Deux appareils au maximum. Pour retirer un appareil : bouton **Retirer**, avec confirmation ; retirer le dernier désactive la double authentification.
6. Se déconnecter, se reconnecter : après le mot de passe, l'écran « Vérification en deux étapes » demande le code. Tant qu'il n'est pas validé, aucun écran admin ne s'affiche.
7. Seulement ensuite, exécuter `docs/sql/securite-mfa-admin.sql` (3 lignes « ok ») : le serveur refuse alors toute requête d'une session administrateur non validée par le code.

Tant que l'étape 7 n'est pas faite, la protection existe à l'écran mais pas encore côté serveur. Tant que l'étape 2 n'est pas faite, rien ne change.

## Protection réelle côté serveur

- Une fonction exécutée par l'API **avant chaque requête** refuse (erreur 403 « mfa_required ») toute requête d'un administrateur ayant un appareil vérifié tant que sa session n'a pas le niveau `aal2`, c'est-à-dire validée par le code.
- La règle d'accès de la table `admins` exige le même niveau : même en contournant le contrôle préalable, une session sans code n'est pas reconnue comme administrateur par les 53 règles d'accès et les 25 fonctions qui consultent cette table.
- Les deux fonctions serveur admin vérifient le même niveau.

Testé localement sur la structure réelle de production : avec le mot de passe seul, lecture des commandes, fonction admin appelée directement et confirmation de paiement sont refusées ; par contournement, 0 ligne visible et 0 modification ; avec le code, tout fonctionne ; second administrateur sans appareil, client, vendeur, visiteur et fonctions serveur inchangés. 19 contrôles du parcours dans un navigateur de test.

## Récupération d'accès

Supabase ne fournit pas de codes de secours pour le TOTP. Trois niveaux, tous gratuits :

1. **Appareil de secours** (étape 5) : la perte d'un téléphone ne bloque rien. Se connecter avec l'autre appareil, retirer l'appareil perdu dans **Sécurité**, en enregistrer un nouveau.
2. **Les deux appareils perdus** : dans l'éditeur SQL de Supabase (protégé par votre compte Supabase et sa propre double authentification), supprimer les appareils du compte administrateur :
   `delete from auth.mfa_factors where user_id = (select user_id from public.admins limit 1);`
   La connexion redevient « mot de passe seul », puis vous réactivez la double authentification. Seul le titulaire du compte Supabase peut le faire.
3. **Dernier recours** : `docs/sql/securite-mfa-admin-retour-arriere.sql` retire le contrôle serveur.

Conséquence à connaître : la sécurité de l'espace administrateur repose alors aussi sur celle du compte Supabase. Y activer la double authentification (Supabase → Account → Security).

## Limites

- Un mot de passe administrateur volé **avant** l'activation permettrait à un tiers d'enregistrer son propre appareil. Activer la double authentification rapidement après la fusion, depuis un appareil sûr.
- Le contrôle serveur s'exécute avant chaque requête de tous les utilisateurs. Il est minimal (aucun effet sans session, une lecture indexée sinon) et retirable immédiatement ; à activer à un moment sans commandes en cours.
- À vérifier dans Supabase : Authentication → Multi-Factor → TOTP activé (c'est le réglage par défaut).
- Preuves locales uniquement à ce stade : le comportement réel sera vérifié à chaque étape.
