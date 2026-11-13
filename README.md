# CAPITAL_IDLE

Clicker économique et simulateur de Trading **fictif**, gratuit, jouable dans le navigateur et adapté aux smartphones. Développé avec **Vue 3, TypeScript et Vite**.

**Jouer :** https://nighttug58.github.io/CAPITAL_IDLE/

## Accueil — le clicker

- Départ à **0 $**, **1 $ par clic**.
- **50 niveaux** calculés sur le total d'argent *réellement gagné dans le jeu*, sans perte de niveau à la dépense.
- **49 améliorations** à débloquer dans l'ordre, augmentant chacune la rémunération de **+1 $ par clic**.
- Le même solde est utilisé pour les améliorations et les achats sur le Trading.
- Les niveaux bénéficient des clics, des dividendes effectivement encaissés et des **profits nets réalisés** en Trading ; ni le capital récupéré lors d'une vente, ni les gains latents ne donnent de l'expérience.

## Trading — 45 instruments

| Type | Nombre | Frais à l'achat | Frais à la vente | Dividendes |
| --- | ---: | ---: | ---: | --- |
| Actions d'entreprises fictives/parodiques | 20 | 0,5 % | 0,5 % | Oui |
| Cryptomonnaies | 15 | 1 % | 1 % | Non |
| Memecoins | 10 | 1,5 % | 1,5 % | Non |

Les cours initiaux sont des **repères de gameplay figés au 13 novembre 2026**, pas des cotations actuelles. Tous les cours, variations, liquidités, News et dividendes sont simulés **sur l'appareil du joueur**, et n'ont aucun lien avec les marchés réels.

- Les **45 actifs évoluent toutes les 5 secondes**, chacun avec son momentum, ses régimes, des chocs aléatoires et des bornes de prix.
- Toutes les positions sont **au comptant**, sans levier, sans dette ni solde négatif. L'offre de chaque actif est plafonnée. Les cryptos autorisent des fractions.
- Ouvrir un actif donne accès à son cours, au graphique, aux bornes, aux quantités détenues et disponibles, ainsi qu'au formulaire **Acheter / Vendre**.
- Les raccourcis **25 % / 50 % / MAX** prennent en compte le budget, les frais, la précision des quantités et les titres possédés. Les ventes affichent les montants nets.
- Le **Portfolio** présente patrimoine, positions, coûts moyens, résultats latents nets de frais théoriques de revente et profits nets déjà réalisés.
- Les graphiques conservent **jusqu'à une heure** d'évolution (au maximum 720 échantillons par instrument, à raison de 5 secondes).

### Dividendes : 24 heures = une année de jeu

Chaque action a un **rendement annuel individuel variable entre 1 % et 30 %**. Il fluctue de manière douce toutes les 5 secondes et réagit progressivement aux News. Aucun saut artificiel du taux lors de l'apparition ou de l'expiration d'une annonce.

La formule par seconde est :

```text
quantité détenue × prix de référence fixe × rendement annuel courant / 86 400
```

Les versements sont calculés **chaque seconde réelle** et crédités au solde et au total gagné. Les fractions de centime sont conservées pour les versements suivants. Le prix de référence fixe évite qu'un pic instantané du cours multiplie mécaniquement le dividende. Il n'y a aucun dividende pour les cryptos ou memecoins.

### News fictives

- Un événement apparaît **toutes les 2 à 8 minutes** (tirage indépendant).
- Son influence dure **2 à 30 minutes**, avec des effets graduels sur les cours et éventuellement les rendements. Plusieurs annonces peuvent se chevaucher ; l'impact cumulé est limité.
- Catalogue de **300 actualités fictives distinctes**, incluant innovations, finance, scandales, macroéconomie, adoption/régulation des cryptos, hacks, tendances de memecoins et rumeurs.
- L'onglet News affiche les **10 dernières annonces** ; les événements encore actifs restent pris en compte dans la simulation même quand ils quittent cette liste.
- Les fiches News indiquent le contexte, un scénario possible, le statut et les actifs ciblés. Les rumeurs peuvent être confirmées ou démenties, mais elles ne garantissent pas un mouvement de cours.

## Sauvegarde locale et hors ligne

- Une sauvegarde **v4** est conservée en `localStorage` sur le navigateur/appareil. **Pas de compte ni de synchronisation cloud** ; vider les données du site ou changer d'appareil peut faire perdre la progression.
- Les anciennes parties **v1, v2 et v3** sont migrées vers la v4 avec conservation du solde, du total gagné et des améliorations déjà achetées. Les anciennes clés ne sont pas supprimées automatiquement.
- À la réouverture, l'horloge reconstitue les cours, les News et les dividendes sur la durée passée. Le calcul s'effectue **par tranches bornées** afin de ne pas bloquer le téléphone. Une très longue absence peut demander plusieurs cycles avant de rattraper complètement le temps réel.
- Une seule simulation détermine les cours et les dividendes ; aucune nouvelle n'est téléchargée et aucun service distant n'est requis pour jouer.
- La sauvegarde et l'historique peuvent occuper plusieurs mégaoctets lorsque les 45 séries sont pleines. Si le stockage du navigateur est bloqué ou saturé, l'application reste utilisable pendant la session, **mais la nouvelle progression risque de ne pas être enregistrée**.

## Interface

Navigation **Accueil / Trading**, puis dans Trading : **Portfolio / Actions / Crypto / News**. Interface sombre à accents dorés, affichage adapté à la hauteur visible du smartphone, défilement limité aux listes et fenêtres internes, boutons de fermeture et prise en charge d'Échap et du retour navigateur pour les modales. Le mode plein écran natif est proposé quand le navigateur le permet.

## Développement

Prérequis : **Node.js 22+ et npm**.

```bash
npm install
npm run dev
npm test
npm run test:ui
npm run build
```

`npm test` exécute les vérifications de calculs financiers, les simulations temporelles, les migrations et les **tests de composants Vue**. `npm run build` lance le contrôle TypeScript puis génère `dist/` via Vite.

- `src/game.ts` : clicker, niveaux et améliorations.
- `src/capital.ts` / `src/persistence.ts` : solde unique, sauvegardes et migrations.
- `src/trading/catalog.ts` : 45 actifs, bornes et quantités.
- `src/trading/market.ts`, `news.ts`, `yield.ts` : simulateur de cours, annonces et rendements.
- `src/trading/dividends.ts`, `clock.ts`, `runtime.ts` : revenus et rattrapage hors ligne.
- `src/trading/trades.ts` : achat, vente, frais et Portfolio.
- `src/components/` : interfaces et modales.
- `src/trading/news-library/` : récits des événements fictifs.

Voir également [la roadmap Trading](ROADMAP_TRADING.md), [les règles du moteur News](TRADING_NEWS.md) et [l'interface Trading](TRADING_INTERFACE.md).

## Déploiement GitHub Pages

La publication utilise **Settings → Pages → Deploy from a branch → main / (root)**. La racine contient **`index.html` compilé, `assets/` et `.nojekyll`** : GitHub Pages sert directement ces fichiers statiques.

Le vrai HTML de développement est désormais dans **`src/index.html`**. La configuration Vite utilise `root: 'src'` et `base: '/CAPITAL_IDLE/'`. Les sources Vue et TypeScript restent dans `src/` et sont exclues de l'entrée statique publiée.

Après chaque modification, le workflow **Build main/root site** :
1. exécute les tests ;
2. compile le jeu avec `npm run build:root` ;
3. commit les fichiers statiques sur `main` ;
4. demande explicitement à GitHub Pages de republier la branche (un commit de workflow avec `GITHUB_TOKEN` seul ne déclenche pas le build Pages).

Le même résultat s'obtient localement avec `npm run build:root`, puis en commitant `index.html`, `assets/` et `.nojekyll`. Pour le développement, utiliser `npm run dev`.

**Important :** ne pas remplacer l'`index.html` compilé à la racine par `src/index.html` (la version TypeScript ne peut pas fonctionner directement dans GitHub Pages).

Les marchés, les News, les entreprises parodiques et leurs performances n'ont **aucune valeur de conseil financier**.
