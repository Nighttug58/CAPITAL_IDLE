# CAPITAL_IDLE

Clicker économique et simulateur de Trading **fictif**, gratuit, jouable dans le navigateur et adapté aux smartphones. Développé avec **Vue 3, TypeScript et Vite**.

**Jouer :** https://nighttug58.github.io/CAPITAL_IDLE/

## Accueil — le clicker

- Départ à **0 $**, **1 $ par clic**.
- **Niveaux joueur sans plafond à 100** : les seuils d'origine 1–50 restent inchangés, puis la courbe continue. L'**XP possède un compteur indépendant** des revenus monétaires, sans perte de niveau à la dépense.
- **49 améliorations historiques du clic** à débloquer dans l'ordre (niveaux 2–50), augmentant chacune la rémunération de **+1 $ par clic**. Elles conservent leur plafond ; ce n'est pas le niveau maximum du joueur.
- **Un seul solde** finance les améliorations du clicker, les transactions Trading et les entreprises. Il peut devenir négatif après le prélèvement automatique ou manuel de taxes, mais **aucun achat à crédit** n'est permis.
- Les niveaux bénéficient des clics, des dividendes encaissés, des revenus fixes des entreprises et des **profits nets réalisés** en Trading. Ni le capital récupéré lors d'une vente, ni les gains latents, ni les taxes payées ne donnent de l'expérience. Les dépenses et les impôts ne font pas redescendre le niveau.

## Trading — 45 instruments

| Type | Nombre | Frais à l'achat | Frais à la vente | Dividendes |
| --- | ---: | ---: | ---: | --- |
| Actions d'entreprises fictives/parodiques | 20 | 0,5 % | 0,5 % | Oui |
| Cryptomonnaies | 15 | 1 % | 1 % | Non |
| Memecoins | 10 | 1,5 % | 1,5 % | Non |

Les cours initiaux sont des **repères de gameplay figés au 13 novembre 2026**, pas des cotations actuelles. Tous les cours, variations, liquidités, News et dividendes sont simulés **sur l'appareil du joueur**, et n'ont aucun lien avec les marchés réels.

- Les **45 actifs évoluent toutes les 5 secondes**, chacun avec son momentum, ses régimes, des chocs aléatoires et des bornes de prix.
- Toutes les positions Trading sont **au comptant**, sans levier ni achat à découvert. La fiscalité peut entraîner un **solde global négatif** : cela n'autorise aucun achat de titres. L'offre de chaque actif est plafonnée. Les cryptos autorisent des fractions.
- Ouvrir un actif donne accès à son cours, au graphique, aux bornes, aux quantités détenues et disponibles, ainsi qu'au formulaire **Acheter / Vendre**.
- Les raccourcis **25 % / 50 % / MAX** prennent en compte le budget, les frais, la précision des quantités et les titres possédés. Les ventes affichent les montants nets.
- Le **Portfolio** présente le solde, les positions, les coûts moyens, les résultats latents nets des frais théoriques de revente et les profits nets déjà réalisés. Le **patrimoine net incluant la fiscalité et les entreprises** est détaillé dans Stats.
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

## Entreprises — 20 commerces uniques

La navigation principale dispose d'un onglet **Entreprises**. Les 20 entreprises deviennent accessibles progressivement du niveau joueur 3 au niveau 50, puis s'achètent **une seule fois** ; aucune franchise ni revente. Un achat débute au niveau 1. Chaque établissement dispose de **19 améliorations payantes**, jusqu'au **niveau 20**, avec bonus de revenu permanents aux niveaux **5, 10, 15 et 20**.

- Rendement **fixe et brut par seconde**, indépendant des News, des cours et des dividendes. Sans salariés, charges d'exploitation ou frais récurrents.
- Revenus cumulés en fractions de centime pour ne pas perdre les petits gains ; encaissés dans le même solde, ils contribuent aussi à l'XP et aux statistiques.
- **Hors ligne illimité en durée** : calcul agrégé, même après des mois ou des années, sous réserve de rester dans les bornes numériques des montants. Les entreprises ne progressent pas toutes seules durant une absence.
- **Prix de reprise ou d'implantation inspirés d'ordres de grandeur réels** : **75 000 $ pour le Kiosque** à **300 milliards $ pour le Groupe technologique**. Ce sont des évaluations fictives d'établissements de taille croissante, pas des cotations ou prix garantis. Les coûts d'amélioration augmentent avec le nouveau prix ; les entreprises déjà possédées ne sont pas refacturées.
- **Rentabilité volontairement accélérée (gameplay)** : retour brut d'environ 8 h pour le Kiosque et 64 h pour le groupe technologique. Les **revenus fixes ont été recalculés proportionnellement aux nouveaux prix** ; ils ne reflètent pas des marges d'entreprises IRL. Détails, hypothèses et sources dans [l'équilibrage Entreprises](ENTREPRISES_ECONOMIE.md).

## Fiscalité — échéance de 72 heures

Le taux fiscal actif est **15 % à titre provisoire** (à confirmer lors de l'équilibrage). La taxe ne diminue **pas** immédiatement les gains ; elle s'accumule séparément dans `taxesDueCents`.

- Sources imposables : **revenus bruts des entreprises**, correspondant à leurs bénéfices en l'absence de charges, et **plus-values positives réalisées** lors des ventes d'actions, de cryptos ou de memecoins, après prix de revient et frais. Le capital restitué, les pertes et les plus-values latentes ne sont pas imposés. **Clics et dividendes non taxés** dans cette version.
- **Prélèvement automatique toutes les 72 heures réelles**. Le solde peut devenir négatif ; les revenus futurs le compensent sans intérêts ni pénalités.
- Depuis **Stats**, un bouton **Payer les taxes maintenant** règle toute la dette accumulée, avec confirmation, puis repart sur **une nouvelle période de 72 h**. Impossible de redémarrer gratuitement le timer lorsque rien n'est dû.
- Après une absence, les revenus des entreprises et les échéances fiscales échues sont calculés **en bloc**, sans sauter de périodes. Les sommes déjà prélevées ne sont jamais soustraites deux fois.

## Stats — progression et patrimoine

La page **Stats** est l'onglet le plus à droite de la navigation principale. Elle affiche la progression (niveau, XP, nombre de clics, temps actif), les gains et pertes réalisés par source, les entreprises possédées, le rendement fixe total, et le tableau fiscal (dette, ventilation, total payé, prochaine échéance).

**Fortune nette = cash (éventuellement négatif) + valeur de marché des titres + montant investi dans les entreprises + valeur comptable des collections − taxes encore dues.** La valeur des entreprises est **comptable** et ne signifie pas qu'elles sont revendables. Les taxes déjà payées sont incluses dans le cash et non déduites une deuxième fois. Les recettes historiques dont l'origine ne peut pas être reconstituée apparaissent dans **Historique non ventilé**, sans inventer des gains par source.

## Sauvegarde locale, import/export et rattrapage hors ligne

- Sauvegarde automatique **v6** en `localStorage` sur le navigateur/appareil. Les anciennes sauvegardes **v1 à v5** sont migrées vers v6 en conservant les données disponibles, sans appliquer rétroactivement les taxes. Aucune synchronisation cloud ni compte utilisateur.
- Tout en bas de **Stats** : **Exporter** télécharge un JSON complet et versionné (`CAPITAL_IDLE_save_YYYY-MM-DD.json`) ; **Importer** valide le fichier (v4/v5/v6, taille maximale **16 Mo**, cohérence du schéma, valeurs, horloges et portefeuille), présente un aperçu et demande une **confirmation avant remplacement** ; **Réinitialiser** nécessite la saisie exacte de `RESET`.
- Import et reset remplacent la sauvegarde v6 **après arrêt de l'ancien moteur**, puis reprennent le jeu sur les horloges sauvegardées. Un fichier invalide est rejeté sans effacer la partie. Les anciennes clés v1–v5 sont effacées lors du remplacement, et une v6 reste prioritaire pour empêcher la résurrection d'une ancienne partie.
- La restauration conserve les dates de simulation ; le revenu d'entreprises et les taxes sont repris sur toute la durée écoulée. Le **Trading/News/dividendes** conserve volontairement son rejeu **par tranches bornées** : une très longue absence peut demander plusieurs cycles pour rattraper ce sous-système, sans limiter les revenus fixes des entreprises.
- La sauvegarde et les historiques peuvent utiliser plusieurs mégaoctets. Si le stockage local est bloqué/saturé, la session peut rester jouable, mais la progression n'est pas garantie après fermeture. **Exporter régulièrement** une copie JSON sécurise la partie. Les JSON sont modifiables par l'utilisateur : la validation vérifie la structure, ce n'est pas un système anti-triche ni une preuve cryptographique.

## Interface

Navigation **Accueil / Trading / Entreprises / Collection / Stats** (Stats toujours à droite), et **page Fame Shop accessible depuis Accueil sans nouvel onglet**, puis dans Trading : **Portfolio / Actions / Crypto / News**. Interface sombre à accents dorés, affichage adapté à la hauteur visible du smartphone, défilement limité aux listes et fenêtres internes, boutons de fermeture et prise en charge d'Échap et du retour navigateur pour les modales. Le mode plein écran natif est proposé quand le navigateur le permet.

## Équilibrage Fame/Collection — vérification de la passe 8

| Élément | Valeur de référence |
|---|---:|
| Fame des niveaux 1–100, sans bonus | 5 050 |
| Fame de base des 50 collections | 20 200 |
| Budget Fame théorique au niveau 100 | 25 250 |
| Coût des six améliorations, 120 paliers | 24 650 |
| Fame restant dans ce scénario sans Notoriété | **600** |
| Coût total en Gold des 50 collections | **3 012 250 000 $** |
| XP nécessaires pour atteindre le niveau 100 | **4 384 391 XP** |

**Limite d'équilibrage connue :** la proportion de **80 % de Fame issue des collections** est vraie pour le **scénario de référence au niveau 100, sans bonus** ; elle n'est **pas garantie dans le parcours économique réel**. Si tous les Gold nécessaires aux 50 collections sont gagnés comme revenu éligible à l'XP, le joueur atteint déjà environ le **niveau 168** (au minimum), lequel distribue **14 196 Fame** de base : les 20 200 Fame de base des collections représentent alors **environ 58,7 %** de ce total. Les bonus Notoriété, l'ordre des achats et la progression ultérieure modifient encore ce ratio. La passe finale conserve délibérément les coûts et récompenses déjà validés ; rapprocher la proportion réelle de 75–80 % demanderait un **nouvel arbitrage de conception** (prix Gold, XP ou Fame après le niveau 100).

**Parcours simulés, niveau 168, 50 objets dans l'ordre du catalogue :** acheter les 20 niveaux de Notoriété **après** les collections rapporte environ **22 725,14 Fame de collection** (soit **61,55 %** de la Fame gagnée), contre **42 925,14 Fame de collection** (**75,15 %**) si les 20 niveaux sont achetés **avant** les collections. Après achat des 120 paliers, cela laisse respectivement environ **12 271,14 Fame** (Prestige ≈ ×3,37) et **32 471,14 Fame** (Prestige ≈ ×25,13). La forte différence entre stratégies est une propriété volontaire du bonus Notoriété, et un **risque d'emballement économique de fin de jeu** à surveiller lors des futures évolutions.

L'achat de Notoriété **avant** les collections augmente les Fame attribuées aux **futurs** objets, alors qu'un achat tardif ne les bonifie jamais rétroactivement. Un achat de collection échange de la liquidité contre un bien comptabilisé à son coût d'acquisition, sans revenu fictif ni revente. Prestige absolu ne s'active qu'à **120/120 paliers**, avec un facteur exponentiel sur **les seuls bonus du Shop** et des protections de calcul pour éviter des gains monétaires non représentables.

**Vérifications automatisées de clôture :** `src/prestige/final-balance.test.ts` simule les 50 achats en argent réel du jeu, deux ordres de Notoriété, le Shop complet, la fiscalité, les achats interdits en solde négatif, une année d'absence et l'export/import v6. Les sauvegardes **v1–v5 migrent en localStorage**, et les **fichiers JSON v4/v5/v6** peuvent être importés avec validation et confirmation. La réinitialisation remet les boosts, Fame et collections à zéro. Les tests d'interface exécutés sous JSDOM vérifient les interactions et la structure responsive ; ils ne remplacent pas une inspection manuelle sur plusieurs appareils.

**Validation CI :** [Build main/root site](https://github.com/Nighttug58/CAPITAL_IDLE/actions/runs/43567528666) : **207 tests métier + 36 tests Vue = 243 réussis**, contrôle TypeScript et build Vite réussis. La publication GitHub Pages de la version de base finale a réussi ; le `index.html` de la racine pointe vers les assets compilés existants.

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

- `src/game.ts` : clicker, seuils de niveau extensibles et améliorations du clic.
- `src/prestige/catalog.ts`, `state.ts`, `bonuses.ts`, `shop.ts`, `collections-catalog.ts`, `collections.ts`, `absolute.ts`, `overview.ts` : catalogue Fame/Collection, compteurs de progression et **moteur commun des six bonus additifs**. Les revenus de clic, entreprises, dividendes, trading, XP et Fame utilisent ce calcul ; les fractions de centime sont conservées et les règles fiscales existantes restent applicables. Le **Fame Shop côté domaine** propose six arbres de 20 paliers, avec achat atomique en Fame, prix déterministe, contrôle du palier attendu contre les doubles achats, et validation des dépenses au rechargement. La **Collection** contient **50 pièces fictives uniques**, réparties entre Montres, Autos, Peintures, Antiquités et Joaillerie : fiches descriptives, achat définitif en Gold, récompense Fame unique (20 200 Fame de base sur tout le catalogue) et bonus permanent partagé. Les objets possédés entrent dans le patrimoine à leur coût historique d'acquisition, sans valeur de marché ni revente. L'interface actuelle comprend un bouton Fame violet à droite du solde sur **Accueil** ouvrant une **page Fame Shop dédiée** : six améliorations défilantes, solde Fame, paliers, prix et Prestige absolu. Le bouton « Accueil » de la page permet de revenir au clicker ; la navigation principale à cinq onglets reste accessible. L'onglet **Collection** reste avant Stats avec cinq catégories, dix pièces chacune, des fiches descriptives, l'état de propriété, la confirmation des achats de prestige et une sauvegarde immédiate. L’interface mobile et les commandes au clavier ont des tests dédiés. La **passe 7** livre également le **Prestige absolu**, gratuit et automatiquement actif après **120/120 paliers** : chaque tranche entière de **100 Fame disponibles** multiplie les **seuls bonus Fame Shop** par `1.01 ^ floor(FameDisponible / 100)`, avant l'addition des bonus de collection (jamais multipliés). Les effets sont recalculés sur la Fame présente, sans attribution rétroactive et sans champ de sauvegarde supplémentaire. **Stats** présente le solde Fame, les gains par niveaux/collections, la Fame dépensée, les 50 objets, le détail des six bonus et le multiplicateur Prestige ; les sauvegardes et imports v6 ainsi que les migrations v5 le conservent par déduction. La **passe 8 clôt** l'intégration avec les tests d'équilibrage, les simulations de parcours et le déploiement final vérifié dans GitHub Actions.
- `src/capital.ts` / `src/persistence.ts` / `src/save-transfer.ts` : solde unique, sauvegardes, migrations, import/export et reset.
- `src/trading/catalog.ts` : 45 actifs, bornes et quantités.
- `src/trading/market.ts`, `news.ts`, `yield.ts` : simulateur de cours, annonces et rendements.
- `src/trading/dividends.ts`, `clock.ts`, `runtime.ts` : revenus et rattrapage hors ligne.
- `src/trading/trades.ts` : achat, vente, frais et Portfolio.
- `src/economy/catalog.ts`, `enterprises.ts`, `clock.ts`, `fiscal.ts` : entreprises, revenus fixes, rattrapage hors ligne et fiscalité.
- `src/economy/stats-ledger.ts`, `stats-overview.ts` : statistiques par source et bilan patrimonial.
- `src/components/` : interfaces et modales.
- `src/trading/news-library/` : récits des événements fictifs.

Voir également [la roadmap Trading](ROADMAP_TRADING.md), [la roadmap Entreprises/Stats/Fiscalité](ROADMAP_ENTREPRISES_STATS_FISCALITE.md), [l'équilibrage Entreprises](ENTREPRISES_ECONOMIE.md), [les règles du moteur News](TRADING_NEWS.md) et [l'interface Trading](TRADING_INTERFACE.md).

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
