# Sécurité Ezial — actions manuelles et contrôles périodiques

Tout ce qui suit est gratuit et utilise ce qu'Ezial possède déjà : Supabase, GitHub, Cloudflare Pages. Aucun agent permanent, aucun serveur.

## 1. À faire une fois (par la propriétaire)

### Supabase
1. **Exécuter les corrections** : publier d'abord la mise à jour du site, puis coller `docs/sql/securite-corrections.sql` dans l'éditeur SQL. Résultat attendu : 8 lignes « ok ». En cas de problème : `docs/sql/securite-corrections-retour-arriere.sql`.
2. **Authentication → Sign In / Providers → Email** : vérifier que « Confirm email » est activé et que la longueur minimale du mot de passe est d'au moins 8 caractères (10 recommandé).
3. **Authentication → Rate Limits** : garder les limites par défaut (ne pas les augmenter).
4. **Authentication → Attack Protection** : la protection CAPTCHA (Cloudflare Turnstile, gratuit) reste optionnelle ; à activer seulement en cas d'inscriptions automatisées. La « Leaked password protection » demande l'offre Pro : non activée.
5. **Advisors → Security Advisor** : outil gratuit de Supabase ; le consulter après chaque migration.
6. **Régénération du site** : les tâches planifiées `seo-rebuild-hourly` et `seo-rebuild-nightly` échouent depuis leur création parce que l'adresse du « Deploy Hook » Cloudflare n'a jamais été renseignée (valeur restée à « COLLER_ICI… »). C'est un réglage, pas un défaut du code : renseigner l'adresse, ou demander la désactivation de ces deux tâches.
7. **Compte administrateur** : mot de passe long, unique, jamais réutilisé ailleurs. Activer la double authentification sur les comptes Supabase, GitHub et Cloudflare eux-mêmes (gratuit, dans les réglages de chaque compte) : ce sont les clés de toute la plateforme.

### GitHub (Settings du dépôt → Advanced Security, ou « Code security »)
1. **Dependabot alerts** et **Dependabot security updates** : gratuits pour tous les dépôts. Activer les deux.
2. **Secret scanning** et **Push protection** : gratuits si le dépôt est public ; sur un dépôt privé d'un compte gratuit, ils ne sont pas disponibles.
3. **Branches → règle sur `main`** : exiger une pull request avant fusion (gratuit sur dépôt public ; sur dépôt privé, demande GitHub Pro). La règle de travail actuelle (jamais de push direct sur `main`) reste appliquée dans tous les cas.

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
