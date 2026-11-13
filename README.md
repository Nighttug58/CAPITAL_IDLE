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

| Niveau | Total gagné nécessaire | Prix amélioration | Revenu après achat |
|---:|---:|---:|---:|
| 1 | 0 $ | — | 1 $/clic |
| 2 | 35 $ | 20 $ | 2 $/clic |
| 3 | 74 $ | 25 $ | 3 $/clic |
| 5 | 163 $ | 30 $ | 5 $/clic |
| 10 | 475 $ | 45 $ | 10 $/clic |
| 15 | 980 $ | 75 $ | 15 $/clic |
| 20 | 1 792 $ | 115 $ | 20 $/clic |
| 25 | 3 098 $ | 190 $ | 25 $/clic |
| 30 | 5 203 $ | 305 $ | 30 $/clic |
| 40 | 14 052 $ | 785 $ | 40 $/clic |
| 50 | 37 002 $ | 2 040 $ | 50 $/clic |

La progression contient **50 niveaux et 49 améliorations payantes**. Chaque achat ajoute **exactement +1 $ par clic**. Le gain cumulé requis pour atteindre le niveau suivant est calculé avec un palier dont le montant augmente de **10 % à chaque niveau** (arrondi à l'unité). Le prix d'une amélioration correspond à environ **60 % du gain supplémentaire nécessaire entre deux niveaux**, arrondi aux 5 $ les plus proches. Les données sont centralisées dans `src/game.ts`.

**Migration des sauvegardes :** la v3 conserve les anciennes parties v1 et v2, y compris le solde, le total gagné et la puissance par clic. Les anciens bonus de +2 sont convertis en deux étapes de +1 déjà achetées. Les anciennes sauvegardes restent intactes sur l'appareil.

## Interface premium mobile

- Écran d'accueil en mode **une seule vue**, ajusté à la hauteur visible du téléphone, sans défilement horizontal ou vertical.
- Solde, total gagné, niveau et coût de la prochaine amélioration uniquement.
- Barre de progression par **niveau courant** : cadre doré, remplissage vertical or clair → or foncé. Le compteur repart à 0 % au niveau suivant et atteint 100 % au niveau maximum.
- Grande zone centrale tactile **entièrement cliquable** avec un billet 💵. À chaque clic, le gain réel apparaît au point touché, monte et disparaît en fondu (maximum 12 animations simultanées).
- Barre de navigation fixe en bas avec un seul onglet **Accueil**.
- Bouton plein écran conservé, touches de clavier accessibles et animation réduite pour les appareils demandant moins de mouvement.
- Style adaptatif testé sur plusieurs dimensions d'écrans mobiles, notamment 412 × 892 et 320 × 568 pixels.

La logique de progression (50 niveaux, +1 $ par clic après chaque amélioration) et les sauvegardes existantes restent inchangées.

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
