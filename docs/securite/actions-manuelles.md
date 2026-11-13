# Sécurité Ezial — actions manuelles et contrôles périodiques

Tout ce qui suit est gratuit et utilise ce qu'Ezial possède déjà : Supabase, GitHub, Cloudflare Pages. Aucun agent permanent, aucun serveur.

## 1. À faire une fois (par la propriétaire)

### Supabase
1. **Exécuter les scripts dans l'ordre** décrit dans `docs/securite/deploiement-pr-21.md` : d'abord `docs/sql/commande-profil-client.sql` (2 lignes « ok » ; sans lui, un client inscrit ne peut pas commander), puis, après la publication du site, `docs/sql/securite-corrections.sql` (9 lignes « ok »). Retours arrière fournis.
2. **Authentication → Sign In / Providers → Email** : vérifier que « Confirm email » est activé et que la longueur minimale du mot de passe est d'au moins 8 caractères (10 recommandé).
3. **Authentication → Rate Limits** : garder les limites par défaut (ne pas les augmenter).
4. **Authentication → Attack Protection** : la protection CAPTCHA (Cloudflare Turnstile, gratuit) reste optionnelle ; à activer seulement en cas d'inscriptions automatisées. La « Leaked password protection » demande l'offre Pro : non activée.
5. **Advisors → Security Advisor** : outil gratuit de Supabase ; le consulter après chaque migration.
6. **Régénération du site** : voir la section 5 (Deploy Hook Cloudflare).
7. **Compte administrateur** : mot de passe long, unique, jamais réutilisé ailleurs. Activer la double authentification sur les comptes Supabase, GitHub et Cloudflare eux-mêmes (gratuit, dans les réglages de chaque compte) : ce sont les clés de toute la plateforme.

### GitHub — passer le dépôt en privé (décidé le 13 novembre 2026, à faire par la propriétaire)

**Ce qui continue de fonctionner (documentation officielle de Cloudflare et de GitHub)**
- Cloudflare Pages accepte les dépôts privés comme les dépôts publics. Le lien passe par l'application GitHub « Cloudflare Workers and Pages », dont l'accès est accordé dépôt par dépôt et ne dépend pas de la visibilité.
- Les builds de Cloudflare Pages tournent chez Cloudflare : ils ne consomment aucun crédit GitHub Actions.
- Le site déjà en ligne reste en ligne, même si le lien avec GitHub était coupé (seuls les nouveaux déploiements s'arrêteraient).
- Le seul workflow du dépôt (ancien déploiement GitHub Pages, manuel) ne se lance jamais seul : aucun crédit consommé.

**Ce qui change**
- Les étoiles et abonnés du dépôt sont effacés ; sans importance ici.
- Une copie (« fork ») publique déjà faite par un tiers resterait publique : vérifier le compteur « Forks » en haut de la page du dépôt avant de changer.
- Fonctions gratuites seulement sur dépôt public, donc perdues : « Secret scanning », « Push protection », règle de protection de la branche `main`. La règle de travail (jamais de push direct sur `main`, aucun secret dans le dépôt) reste appliquée.
- Dependabot (alertes et mises à jour de sécurité) reste gratuit : à activer dans Settings → Advanced Security.

**Étapes**
1. GitHub → dépôt **Ezial** → **Settings** → **General** → tout en bas, **Danger Zone** → **Change repository visibility** → **Change to private** → confirmer (GitHub demande de retaper le nom du dépôt).
2. Vérifier l'accès de Cloudflare : photo de profil → **Settings** → **Applications** → **Installed GitHub Apps** → **Cloudflare Workers and Pages** → **Configure** → sous **Repository access**, le dépôt Ezial doit figurer dans la liste (ou « All repositories » être coché).
3. Me dire « c'est fait » : je pousse une modification sans effet sur la branche de travail et je vérifie que Cloudflare lance bien un déploiement d'aperçu. La production n'est pas touchée.
4. Si le déploiement ne part pas : Cloudflare → Workers & Pages → ezial → Settings → Builds → vérifier le dépôt lié ; au besoin, repasser par l'étape 2. Retour arrière possible à tout moment : même menu, **Change to public**.

**Double authentification du compte GitHub** : indispensable (Settings → Password and authentication).

### Sur iPad
Si un menu ou un bouton décrit ici n'apparaît pas, passer en mode paysage ou utiliser « Demander le site pour ordinateur » dans Safari.

## 2. Sauvegardes (préparées, non activées)

- **Ce que Supabase fournit gratuitement** : rien d'automatique. Les sauvegardes quotidiennes commencent à l'offre Pro. Les photos ne sont jamais incluses dans une sauvegarde de base, quelle que soit l'offre.
- **Solution préparée, gratuite** : sauvegarde quotidienne chiffrée par GitHub Actions dans un dépôt privé séparé, conservation 30 jours, restauration d'essai à chaque exécution, copie mensuelle des photos. Fichiers, tests réalisés, mise en place pas à pas, gestion de la phrase secrète et procédure de restauration : `docs/securite/sauvegardes/README.md`.
- **Rien n'est activé** : aucun dépôt, aucun secret, aucune tâche planifiée n'existe tant que vous n'avez pas donné votre accord final.
- **Limite honnête** : d'ici là, une suppression accidentelle ou une compromission de la base n'est pas récupérable.

## 3. Contrôles périodiques avec Claude Code (ponctuels, pas de surveillance permanente)

Une fois par mois, et après toute évolution importante :

1. Security Advisor de Supabase : aucune nouvelle alerte.
2. Journal `security_events` : tentatives de modification de champs protégés, codes de livraison incorrects, changement de boutique officielle.
3. Table `admins` : une seule ligne attendue.
4. Tâches planifiées en échec (`cron.job_run_details`).
5. Nouvelles tables : RLS activée et politiques présentes.
6. `npm audit` et alertes Dependabot.
7. Sauvegardes (une fois activées) : dernière exécution verte dans le dépôt privé, volume des photos sous la limite gratuite.
8. Comptes livreurs sans NIP (`profiles.pin_setup_required`) : tant qu'un compte est dans cet état, il peut être pris par quiconque connaît son nom d'utilisateur.

## 4. Récupération d'accès

- Un administrateur se retire ou s'ajoute uniquement par l'éditeur SQL de Supabase (table `admins`) : aucune page du site ne le permet, volontairement.
- Double authentification administrateur perdue : `docs/securite/proposition-double-authentification.md`, section « Récupération d'accès ».
- Compte livreur en attente de NIP : Admin → Livreurs → fiche du livreur → **Suspendre**. Tant qu'il est suspendu, personne ne peut créer son NIP ni se connecter ; missions et données sont conservées. **Réactiver le livreur** annule la suspension, au moment de créer le NIP avec lui.

## 5. Deploy Hook Cloudflare (régénération automatique des pages)

**Pourquoi ces tâches existent.** Les pages produit, boutique et catégorie lues par Google et par les aperçus de partage sont générées au moment du build. Quand un vendeur ajoute ou modifie un produit, la base le note. Toutes les heures aujourd'hui, une tâche regarde s'il y a eu un changement : si oui, elle demande à Cloudflare de reconstruire le site (12 fois par jour au maximum) ; sinon elle ne fait rien. Chaque nuit, une seconde tâche force une reconstruction. Les deux échouent aujourd'hui parce que l'adresse du Deploy Hook n'a jamais été enregistrée.

**Fréquence retenue : toutes les 6 heures (décision du 13 novembre 2026, pas encore appliquée).** Un nouveau produit est visible immédiatement sur le site ; seule sa page pour Google attend la reconstruction. `docs/sql/seo-frequence-6h.sql` déplace la vérification conditionnelle à 09:07, 15:07 et 21:07 UTC et conserve la reconstruction forcée de 03:17 UTC : une occasion toutes les 6 heures, sans doublon, 4 builds par jour au plus (500 par mois offerts par Cloudflare Pages). Retour arrière : `docs/sql/seo-frequence-6h-retour-arriere.sql`. À exécuter seulement avec votre accord, de préférence après l'étape 3 ci-dessous.

**L'adresse du Deploy Hook est un secret** : quiconque la connaît peut déclencher des builds. Ne la collez jamais dans une conversation, un e-mail ou le dépôt.

1. Cloudflare → **Workers & Pages** → projet **ezial** → **Settings** → **Builds** (ou « Builds & deployments ») → **Deploy hooks** → **Add deploy hook**. Nom : `supabase-seo`. Branche : `main`. Enregistrer, puis copier l'adresse affichée.
2. Supabase → projet Ezial → **Integrations** → **Vault** (ou Project Settings → Vault) → onglet **Secrets** → ligne `cloudflare_deploy_hook` → modifier → coller l'adresse à la place de la valeur actuelle → enregistrer.
3. Test immédiat, dans l'éditeur SQL : `select ezial_private.request_seo_rebuild(true);` La réponse doit contenir `"triggered": true`, et un nouveau déploiement doit apparaître dans Cloudflare en quelques secondes.
4. Me dire « c'est fait » : je vérifie en lecture seule que les deux tâches planifiées réussissent, sans jamais lire l'adresse.

Sur iPad, si « Deploy hooks » ou l'onglet « Secrets » n'apparaît pas : mode paysage, ou « Demander le site pour ordinateur » dans Safari.
