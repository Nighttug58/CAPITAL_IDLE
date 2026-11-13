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

| Niveau | Total gagné nécessaire | Revenu après achat |
|---:|---:|---:|
| 1 | 0 $ | 1 $/clic |
| 2 | 35 $ | 2 $/clic |
| 3 | 77 $ | 3 $/clic |
| 5 | 190 $ | 5 $/clic |
| 10 | 760 $ | 10 $/clic |
| 15 | 2 237 $ | 20 $/clic |
| 20 | 6 068 $ | 30 $/clic |
| 25 | 16 003 $ | 40 $/clic |
| 30 | 41 775 $ | 50 $/clic |

La progression contient **30 niveaux et 29 améliorations**. Chaque palier de total gagné nécessite 21 % de gains additionnels de plus que le précédent, tandis que le gain par clic augmente de +1 jusqu'au niveau 10, puis de +2. Le prix d'achat correspond à environ 60 % du gain nécessaire entre deux niveaux, arrondi aux 5 $ les plus proches.

**Compatibilité des sauvegardes :** au premier chargement de la version 2, une ancienne partie v1 est automatiquement migrée. Le solde et le total gagné sont conservés, et les améliorations déjà achetées sont converties sans diminuer le revenu par clic. La sauvegarde v1 originale reste intacte sur l'appareil.

Les paramètres d'équilibrage sont regroupés dans `src/game.ts`.

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
