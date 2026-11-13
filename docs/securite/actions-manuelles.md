# Sécurité Ezial — actions manuelles et contrôles périodiques

Tout ce qui suit est gratuit et utilise ce qu'Ezial possède déjà : Supabase, GitHub, Cloudflare Pages. Aucun agent permanent, aucun serveur.

## 1. À faire une fois (par la propriétaire)

### Supabase
1. **Exécuter les corrections** : publier d'abord la mise à jour du site, puis coller `docs/sql/securite-corrections.sql` dans l'éditeur SQL. Résultat attendu : 9 lignes « ok ». Ordre complet : `docs/securite/deploiement-pr-21.md`. En cas de problème : `docs/sql/securite-corrections-retour-arriere.sql`.
2. **Authentication → Sign In / Providers → Email** : vérifier que « Confirm email » est activé et que la longueur minimale du mot de passe est d'au moins 8 caractères (10 recommandé).
3. **Authentication → Rate Limits** : garder les limites par défaut (ne pas les augmenter).
4. **Authentication → Attack Protection** : la protection CAPTCHA (Cloudflare Turnstile, gratuit) reste optionnelle ; à activer seulement en cas d'inscriptions automatisées. La « Leaked password protection » demande l'offre Pro : non activée.
5. **Advisors → Security Advisor** : outil gratuit de Supabase ; le consulter après chaque migration.
6. **Régénération du site** : voir la section 5 (Deploy Hook Cloudflare).
7. **Compte administrateur** : mot de passe long, unique, jamais réutilisé ailleurs. Activer la double authentification sur les comptes Supabase, GitHub et Cloudflare eux-mêmes (gratuit, dans les réglages de chaque compte) : ce sont les clés de toute la plateforme.

### GitHub (le dépôt est public)
1. **Visibilité** : passer le dépôt en privé (Settings → General → Danger Zone → Change visibility). Gratuit ; Cloudflare Pages continue de fonctionner. Aujourd'hui le code, les migrations et le rapport d'audit sont lisibles par tous.
2. **Dependabot alerts** et **Dependabot security updates** (Settings → Advanced Security) : gratuits dans tous les cas. Activer les deux.
3. **Secret scanning** et **Push protection** : gratuits tant que le dépôt est public ; indisponibles sur un dépôt privé d'un compte gratuit. La règle « aucun secret dans le dépôt » reste appliquée à chaque audit.
4. **Règle sur `main`** (pull request obligatoire) : gratuite sur dépôt public ; sur dépôt privé elle demande GitHub Pro. La règle de travail (jamais de push direct sur `main`) reste appliquée dans tous les cas.
5. **Double authentification du compte GitHub** : indispensable.

### Sur iPad
Si un menu ou un bouton décrit ici n'apparaît pas, passer en mode paysage ou utiliser « Demander le site pour ordinateur » dans Safari.

## 2. Sauvegardes (offre gratuite : aucune sauvegarde automatique)

- **Ce que Supabase fournit gratuitement** : rien d'automatique. Les sauvegardes quotidiennes (7 jours) commencent à l'offre Pro. Les fichiers du Storage (photos) ne sont jamais inclus dans les sauvegardes, quelle que soit l'offre.
- **Alternative gratuite** : un export manuel depuis un ordinateur, une fois par semaine au lancement puis après chaque journée de ventes importante :
  `supabase db dump --db-url "<adresse de connexion>" -f ezial-AAAA-MM-JJ.sql` puis `supabase db dump --db-url "<adresse>" --data-only -f ezial-donnees-AAAA-MM-JJ.sql`. Conserver les fichiers hors de l'ordinateur (disque externe ou espace cloud personnel). Ne jamais les mettre dans le dépôt GitHub : ils contiennent des données personnelles.
- **Restauration** : créer un projet Supabase vide, y rejouer le fichier de structure puis le fichier de données avec `psql`, vérifier les comptes et les commandes, puis remplacer les variables `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` dans Cloudflare Pages et redéployer. À tester une fois à blanc avant le lancement.
- **Limite honnête** : sans export récent, une suppression accidentelle ou une compromission de la base n'est pas récupérable.

## 3. Contrôles périodiques avec Claude Code (ponctuels, pas de surveillance permanente)

Une fois par mois, et après toute évolution importante :

1. Security Advisor de Supabase : aucune nouvelle alerte.
2. Journal `security_events` : tentatives de modification de champs protégés, codes de livraison incorrects, changement de boutique officielle.
3. Table `admins` : une seule ligne attendue.
4. Tâches planifiées en échec (`cron.job_run_details`).
5. Nouvelles tables : RLS activée et politiques présentes.
6. `npm audit` et alertes Dependabot.
7. Comptes livreurs sans NIP (`profiles.pin_setup_required`) : tant qu'un compte est dans cet état, il peut être pris par quiconque connaît son nom d'utilisateur.

## 4. Récupération d'accès

Un administrateur se retire ou s'ajoute uniquement par l'éditeur SQL de Supabase (table `admins`) : aucune page du site ne le permet, volontairement.

## 5. Deploy Hook Cloudflare (régénération automatique des pages)

**Pourquoi ces tâches existent.** Les pages produit, boutique et catégorie lues par Google et par les aperçus de partage sont générées au moment du build. Quand un vendeur ajoute ou modifie un produit, la base le note. Toutes les heures, une tâche regarde s'il y a eu un changement : si oui, elle demande à Cloudflare de reconstruire le site (12 fois par jour au maximum) ; sinon elle ne fait rien. Chaque nuit, une seconde tâche force une reconstruction. Les deux échouent aujourd'hui parce que l'adresse du Deploy Hook n'a jamais été enregistrée.

**La fréquence horaire est-elle nécessaire ?** Non au lancement : un nouveau produit est visible immédiatement sur le site ; seule sa page pour Google attend la reconstruction. Une vérification toutes les 3 à 6 heures suffirait et resterait loin de la limite gratuite de Cloudflare (500 builds par mois). La fréquence n'est pas modifiée sans votre accord.

**L'adresse du Deploy Hook est un secret** : quiconque la connaît peut déclencher des builds. Ne la collez jamais dans une conversation, un e-mail ou le dépôt.

1. Cloudflare → **Workers & Pages** → projet **ezial** → **Settings** → **Builds** (ou « Builds & deployments ») → **Deploy hooks** → **Add deploy hook**. Nom : `supabase-seo`. Branche : `main`. Enregistrer, puis copier l'adresse affichée.
2. Supabase → projet Ezial → **Integrations** → **Vault** (ou Project Settings → Vault) → onglet **Secrets** → ligne `cloudflare_deploy_hook` → modifier → coller l'adresse à la place de la valeur actuelle → enregistrer.
3. Test immédiat, dans l'éditeur SQL : `select ezial_private.request_seo_rebuild(true);` La réponse doit contenir `"triggered": true`, et un nouveau déploiement doit apparaître dans Cloudflare en quelques secondes.
4. Me dire « c'est fait » : je vérifie en lecture seule que les deux tâches planifiées réussissent, sans jamais lire l'adresse.

Sur iPad, si « Deploy hooks » ou l'onglet « Secrets » n'apparaît pas : mode paysage, ou « Demander le site pour ordinateur » dans Safari.
