# Ezial — règles de travail

Marketplace React + TypeScript + Vite + Tailwind, backend Supabase (projet `lkqezdrdbogtborgjvlw`), déployée sur Cloudflare Pages (`npm run build`, sortie `dist`). Toutes les réponses et tous les textes visibles par les utilisateurs sont en français.

## Bug de code ou problème de configuration : toujours trancher avant de corriger

Quand quelque chose échoue (build, déploiement, fonctionnalité), ne jamais supposer que c'est un bug de code. Suivre cet ordre :

1. **Lire le message d'erreur exact** (log de build, console), pas seulement le statut global.
2. **Vérifier le code dans le repo** : ce qui est réellement sur GitHub, fichiers de config commités (`.env*`, Wrangler, `_redirects`), noms de variables cohérents partout.
3. **Reproduire localement** avec exactement les mêmes conditions que la plateforme (mêmes variables présentes/absentes). Si la reproduction donne le même résultat, le comportement du code est établi.
4. **Vérifier les prérequis de la plateforme** (Cloudflare, Supabase, GitHub) : variables par environnement (Production ≠ Preview), domaines, réglages de build. S'appuyer sur la documentation officielle, pas sur la mémoire.
5. **Croiser avec des données réelles** quand c'est possible (logs Supabase, logs de build) plutôt que des hypothèses.
6. Conclure explicitement : « bug de code » ou « problème de configuration », avec la preuve. Ne corriger le code que si c'est le code.

## La personne travaille souvent sur tablette (iPad)

Quand une option, un menu ou un bouton attendu n'apparaît pas sur une capture d'écran, toujours évoquer que l'affichage tablette peut le masquer (exemple réel : le sélecteur Production/Preview de Cloudflare n'apparaît qu'en mode paysage). Proposer : passer en paysage, « Demander le site pour ordinateur » dans Safari, dézoomer, ou utiliser un ordinateur.

## Autonomie

Avancer sans attendre de validation sur tout ce qui est réversible et à portée (lecture, code, build, tests, commits et push sur la branche de travail). S'arrêter uniquement pour ce qui exige vraiment la personne : actions dans un dashboard externe auquel on n'a pas accès, décisions qui changent une règle établie, actions irréversibles.

## Règles permanentes

- Travailler sur la branche de développement ; ne jamais pousser ni fusionner dans `main` sans accord explicite.
- `www.ezial.net` : ne pas modifier le DNS ni la configuration du domaine.
- Ne jamais contourner la RLS depuis le frontend ; la clé `service_role` ne doit jamais atteindre le frontend.
- Migrations SQL : les donner en texte brut dans la conversation pour que la personne les exécute ; ne jamais déployer une interface qui dépend d'une migration pas encore en production.
- Ne jamais inventer de contenu (avis, notes, stock, produits de démo) ; ne jamais supprimer de données sans avoir vérifié qu'il s'agit de données de test.
- Distinguer ce qui a été testé sur la branche/preview de ce qui est réellement en ligne ; ne jamais annoncer qu'un problème est résolu sans l'avoir vérifié.
