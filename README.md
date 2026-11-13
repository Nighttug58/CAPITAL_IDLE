# CAPITAL_IDLE

Clicker d'argent minimaliste, mobile-first : Vue 3, TypeScript et Vite.

## Règles v0.1

- Départ : **0 $**, **1 $ par clic**.
- Le **niveau** dépend du **total d'argent gagné depuis la création de la partie**. Dépenser de l'argent ne fait jamais perdre de niveau.
- À chaque nouveau niveau, une amélioration payante du gain par clic devient accessible.
- Les améliorations s'achètent dans l'ordre, sans achat automatique.
- Sauvegarde automatique sur l'appareil via `localStorage` (pas de compte ni de synchronisation entre appareils).
- Le mode plein écran utilise l'API native du navigateur si disponible.
- Pas de revenus automatiques/offline pour cette première version.

| Niveau | Total gagné nécessaire | Prix amélioration | Nouveau gain par clic |
|---:|---:|---:|---:|
| 1 | 0 $ | — | 1 $ |
| 2 | 100 $ | 50 $ | 2 $ |
| 3 | 500 $ | 250 $ | 5 $ |
| 4 | 2 000 $ | 1 000 $ | 10 $ |
| 5 | 10 000 $ | 5 000 $ | 25 $ |
| 6 | 50 000 $ | 25 000 $ | 50 $ |

Ces montants sont des réglages provisoires dans `src/game.ts`.

## Développement

Prérequis : Node.js 22+ et npm.

```bash
npm install
npm run dev
npm test
npm run build
```

## Déploiement GitHub Pages

1. Sur GitHub, ouvrir **Settings → Pages** et sélectionner **GitHub Actions** comme source.
2. La publication de `main` lancera le workflow `.github/workflows/pages.yml`.
3. Après le premier déploiement réussi, ouvrir `https://nighttug58.github.io/CAPITAL_IDLE/`.

Le `base` Vite dans `vite.config.ts` est défini pour le sous-chemin `/CAPITAL_IDLE/`.

## Évolutions

Le design volontairement brut (fond sombre, boutons rectangulaires) et l'équilibrage seront revus plus tard. Aucune mécanique future n'est présupposée.


## Dépannage : écran vide sur GitHub Pages

**Important :** une page indiquée « published » peut quand même être vide si Pages utilise la source **Deploy from a branch → main → /(root)** : l'entrée `index.html` référence alors du TypeScript/Vue non compilé. La racine du dépôt n'est pas le site statique final.

- Ouvrir [Settings → Pages](https://github.com/Nighttug58/CAPITAL_IDLE/settings/pages).
- Sous **Build and deployment → Source**, sélectionner **GitHub Actions** (ne pas publier `main` directement).
- Dans [Actions](https://github.com/Nighttug58/CAPITAL_IDLE/actions/workflows/pages.yml), ouvrir **Publish GitHub Pages**, puis **Run workflow** sur `main` si nécessaire.
- Vérifier un statut **vert** pour les étapes d'installation, de test, de build et de déploiement. Puis recharger le site sans cache.

Un avertissement de secours s'affiche dans la page HTML si l'application Vue ne démarre pas. Une application chargée correctement remplace automatiquement cet avertissement.
