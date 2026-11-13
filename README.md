# CAPITAL_IDLE

Idle clicker d'argent, mobile-first, en Vue 3 + TypeScript + Vite.

Le niveau dépend du total gagné depuis le début, jamais du solde. Les améliorations payantes augmentent le gain par clic. Sauvegarde locale, UI sombre à boutons rectangulaires, plein écran compatible.

## Démarrage

```bash
npm install
npm run dev
npm test
npm run build
```

## GitHub Pages

Dans Settings → Pages, choisir **GitHub Actions**. Le workflow de `main` publie le site sur `https://nighttug58.github.io/CAPITAL_IDLE/` après réussite des tests et du build.

Barème actuel : niveau 2 à 100 $ (50 $ pour 2 $/clic), niveau 3 à 500 $ (250 $ pour 5 $/clic), niveau 4 à 2 000 $ (1 000 $ pour 10 $/clic), niveau 5 à 10 000 $ (5 000 $ pour 25 $/clic), niveau 6 à 50 000 $ (25 000 $ pour 50 $/clic). Provisoire.

Pas encore de production passive/offline : cette version ne couvre que le clic et les achats.
