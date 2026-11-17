# CAPITAL_IDLE — Refonte Prestige Transcendant, news avancées et Collections V3

**Dépôt :** Nighttug58/CAPITAL_IDLE  
**Branche cible :** `main`  
**Audit du code :** 17 novembre 2026, référence `431915f3355cd9cf14d79f7ee569499d35912d25`  
**État :** passe 0.5 validée ; **passes 1 et 2 validées (2/8)** au 17 novembre 2026. Les passes 3 à 8 restent à faire. Le reste de la documentation conserve le cahier des charges des passes suivantes.

> **Contrat de conduite :** commencer par la **passe préparatoire 0.5** ; ensuite chaque « Next » exécute exactement la prochaine passe non terminée, puis vérifie les tests, le build, la sauvegarde, et commit seulement après validation. Ne jamais commencer la passe suivante implicitement. Les anciennes roadmaps restent historiques ; cette roadmap prévaut seulement pour son périmètre. En cas d'incohérence entre le projet vivant et ce document, inspecter et corriger explicitement la roadmap avant de modifier l'économie.

## A. Audit du code existant — constats vérifiés

### A1. Architecture, tests et publication

- Arbre `main` parcouru (201 entrées, non tronqué), **aucun `AGENTS.md`** présent.
- Stack : Vue 3 + TypeScript + Vite. Domaine et tests métier Node dans `src/*.ts`, tests d'interface Vitest/jsdom dans `src/components/*.test.ts`.
- L'autorité économique active est **V8 exact/BigInt** : `src/exact-state-v8.ts`, `src/exact-runtime-v8.ts`, `src/exact-market-v8.ts`, `src/exact-prestige-v8.ts`, `src/exact-persistence-v8.ts`. Les unités monétaires sont des **centimes en chaînes décimales canoniques**, les PP également, la Fame en micro-Fame ; les quantités Trading ont leurs propres unités exactes. `src/capital.ts` et `src/exact-view-v8.ts` sont une **projection V7 pour affichage/compatibilité**, jamais une autorité de paiement.
- Scripts existants dans `package.json` : `npm run test`, `npm run test:ui`, `npm run build`, `npm run verify:release` (= tests + build), `npm run build:root` (= vérification + génération racine). `.github/workflows/pages.yml` publie le site depuis `main`/racine après validation.
- Le `README.md` décrit encore des verrous Prestige 5–15, alors que le catalogue actuel a déjà été ramené aux cycles 1–3. **Documentation obsolète à corriger en passe 8**, sans la changer dans le présent commit.

### A2. Achats MAX / interface Trading

- Clic : `src/App.vue` → `v8UpgradeClick` (`src/exact-runtime-v8.ts`), un niveau par opération ; grille pré-calculée `UPGRADES` et limite `MAX_CLICK_LEVEL=1000` dans `src/game.ts`. Le niveau joueur limite les paliers accessibles.
- **Animation des billets à corriger avant les achats MAX** : `src/App.vue` anime actuellement le sprite `src/assets/lira-frames.webp` (8 colonnes × 6 lignes = **48 frames**) avec `spinStreak`, `lastPaidTap`, `spinTarget`, `spinDuration`, `advanceBundle` et `requestAnimationFrame`. Chaque clic rémunéré relance/accélère la rotation, et `replaceWholeSaveExact` réinitialise aussi le sprite. Cet accouplement clic–animation crée des à-coups à haute cadence : la **passe 0.5** introduira une animation continue à vitesse fixe, autonome du clic et des écritures de sauvegarde ; la rémunération et les textes flottants resteront fonctionnels.
- Entreprises : 20 entreprises ; `src/components/EnterpriseScreen.vue` → `src/App.vue` → `v8BuyEnterprise` ; achat initial puis progression sans plafond métier fixe. Coût historique sur les premiers niveaux, formule **quadratique après 20** dans `src/economy/catalog.ts` ; revenus polynomiaux et milestones continus. Les niveaux sont des `Number` entiers sûrs, le coût/solde en `BigInt`. Aujourd'hui un seul niveau est acheté par clic.
- Trading : `src/components/TradingScreen.vue` présente `AssetDialog.vue` et `MarketChart.vue`. Dans `AssetDialog.vue`, le graphique est déjà bien dimensionné ; l'élément HTML `<details>` « Détails du marché et actualités » masque encore prix min/max, quantité possédée et news associées. Style mixte `src/style.css` + style local de la modale.

### A3. Prestige ordinaire, news, PP et Fame

- Boutique Prestige ordinaire V2 : **11 branches actives**, catalogue et prix dans `src/ascension/v2.ts`, achat exact dans `v8BuyPrestigeUpgrade` et présentation dans `PrestigeScreen.vue`. Déblocages déjà : 1 branche au Prestige 1, 2 supplémentaires au Prestige 2, les 8 restantes au Prestige 3 ; prix historiques et `legacyRanks` conservés. Ne **pas** rétablir les verrous 5–15.
- PP de base : à partir du niveau **150** et de **10 milliards $** de patrimoine éligible après impôts (collections exclues), `floor(10 × (patrimoine/10 milliards)^0,35)` ; implémentation entière dans `src/ascension/v2.ts` ; aucun nerf, plafond artificiel ou recalcul rétroactif demandé.
- Solde PP en V8 : `ascension.progress.availablePoints` / `lifetimePoints` sont des chaînes décimales. Invariant actuel dans `src/exact-save-validation.ts` : `lifetimePoints - availablePoints == prestigeSpent(upgradeLevels, legacyRanks)`, avec conservation des achats historiques. **Ajouter une dépense PP exige d'étendre ce registre de façon vérifiable**, non d'incrémenter des champs arbitrairement.
- News : `src/trading/news.ts` génère événements directionnels, horaires, pression marché et dividendes. Cadence de base 5–10 min, durée de base 5–30 min, ticks prix 5 s et secours directionnel à la seconde via `src/exact-market-v8.ts`. `news-impact` compte 4 niveaux et module actuellement l'effet de 25 % par rang ; `getNewsPressure` borne le multiplicateur de force à ×3, avec enveloppe montée/descente à 20 % de la durée ; le moteur de prix a ses propres limites min/max et corrections.
- Les effets news sont calculés à deux endroits (`marketNewsEffects` V7 et `v8MarketNewsEffects` V8). Les pouvoirs manuels `Générer une news` et `Terminer une news` sont encore bloqués à **Prestige 7** et **Prestige 10** dans `src/news-powers.ts` et `src/components/TradingScreen.vue`. Ils coûtent respectivement **5 %** et **10 %** du patrimoine de référence en cash, sans annuler le cycle normal.
- Fame : six branches de 20 niveaux Fame Shop ; `Prestige absolu` se déclenche à 120/120 et vaut actuellement `min(1,01^floor(Fame disponible/100), 100)`. Le plafond ×100 est **dupliqué** dans `src/prestige/absolute.ts` et `src/exact-runtime-v8.ts` ; modifier seulement l'affichage laisserait l'économie à ×100.

### A4. Collections / cycles / sauvegardes

- Collections V2 : **100 objets = 5 catégories de 20**, `CURRENT_COLLECTION_SLOTS` et `CURRENT_COLLECTION_ITEMS` ; catalogue `src/prestige/{catalog,collections-catalog}.ts`. Chaque objet donne une Fame à l'achat et un bonus permanent vers une des six branches. Les objets restent possédés après Prestige, ne sont pas revendables, et leur **valeur comptable est exclue de l'assiette des PP**.
- Les achats anciens ont des IDs historiques conservés (et des IDs V2 préfixés). `currentCollectionId` normalise les IDs pour éviter les doubles possessions. Il faudra raisonner sur **100 IDs canoniques**, pas traiter les anciens IDs V1 comme des nouveaux objets à racheter.
- Prestige V8 : `src/exact-prestige-v8.ts` règle les taxes avant le calcul des PP, crée un état de cycle neuf via `createV8CapitalState`, conserve les possessions permanentes et les achats, remet la Fame disponible/XP du cycle à zéro, conserve le calendrier fiscal des 72 h et l'historique des cycles (100 dernières entrées). Actuellement le cash repart de zéro.
- Sauvegardes : clé active `capital-idle-save-v8`. `loadV8CapitalState`, `prepareV8SaveImport`, `exportV8Save`, `saveV8CapitalState` valident les registres et les représentations exactes. Compatibilité import V4–V8 et migration de clés historiques V1–V7. Backups historiques V7 et pré-rééquilibrage Fame V8 ; source invalide = **rejet explicite, aucun reset automatique**.
- **Point de blocage pour le capital de départ :** `validateExactV8State` impose aujourd'hui `cash <= lifetimeEarned + cycleGiftCents`. Une dotation post-Prestige impose une source comptable dédiée et une validation adaptée, pas un crédit fictif en clic/revenu.
- **Point de blocage pour les PP bonifiés :** le validateur recalcule exactement les PP de chaque ligne d'historique de formule V2 ; les nouveaux bonus « Héritage » et « Musée » exigeront un **nouveau type de reçu historique versionné** pour ne pas rejeter les anciennes sauvegardes ni recalculer leurs gains selon les bonus actuels.
- **Point de blocage de la notion « à l'infini » :** le compteur de Prestiges est actuellement un `Number` entier sûr. Prévoir un compteur exact versionné si nécessaire à un plafond Fame réellement non borné ; ne jamais passer des montants comptables BigInt à Number pour simuler une infinité.

## B. Décisions produit invariantes

1. **Conserver la course aux fortunes immenses et aux millions/milliards de PP.** Ne pas changer la formule de PP V2 de base, abaisser les gains, plafonner les PP, supprimer les 7 millions déjà accumulés, ni dévaluer les achats existants.
2. **Achats permanents** : boutiques Prestige ordinaire, Transcendant, Fame et collections survivent aux resets ; seule l'économie de cycle (et le capital de départ réattribué) redémarre. Les objets n'accordent leur Fame **qu'une fois** lors de leur acquisition, pas lors des Prestiges.
3. **Aucune refacturation rétroactive.** Prix anciens et achats historiques grandfathered ; nouveaux prix versionnés ; les 11 branches ordinaires et leurs verrous 1–3 restent identiques.
4. **BigInt et transaction unique** sur tout montant économique : PP et cash sans conversions dangereuses ; prix, débits, octrois et récompenses déterministes, arrondis explicites ; pas d'exponentielle non bornée sur une valeur monétaire.
5. **Pas de multiplicateur aveugle et explosif** entre Fame, collections, Prestige Transcendant, musée, news et bonus ultime. Pour des bonus de même assiette, additionner les **points de pourcentage** puis appliquer une seule fois au flux de base, sauf règle explicite documentée. Les boosts peuvent être puissants, mais vérifiables et finis.
6. **Taxation :** conserver 15 % de dette fiscale sur les sources imposables actuelles et paiement automatique par période de 72 h réelles, ainsi que le paiement de dette lors d'un Prestige. Une simple dotation de départ n'est pas un revenu taxable.
7. **Trading :** garder les cours min/max, repli/rebond aux bornes, trading sans limites de liquidité, frais existants, staking et gains nets réellement réalisés. Les nouveaux boosts de profits ne doivent pas améliorer le produit brut d'une vente à perte ou du capital restitué.
8. **Réactivité et UX :** ne pas modifier la taille utile de `MarketChart` ; respecter mobile et clavier. L'achat MAX ne doit pas exécuter un million d'actions, de timers, d'événements Vue ou de sauvegardes. Les actions doivent rester désactivées quand l'état est verrouillé/invalide.

## C. Tarifs et effets cible (base de conception vérifiable)

### C1. Catalogue PP Transcendant

- **10 branches à 1 000 niveaux :** **7 branches principales** Transcendant (ci-dessous) et **3 branches news** avancées. Les news arrivent en passe 3 et partagent dès leur première implémentation le même schéma, moteur de prix et registre de dépenses que les branches de la passe 4.
- Prix du **niveau k** (`1 <= k <= 1000`), pour chaque branche :  
  **`C(k) = 1 000 + 250(k−1) + 10(k−1)² PP`**.  
  Prix du niveau 1 = 1 000 PP, niveau 10 = 4 060 PP, niveau 100 = 123 760 PP, niveau 500 = 2 615 760 PP, niveau 1000 = 10 230 760 PP. Somme exacte par branche = **3 454 210 000 PP**, 7 principales = **24 179 470 000 PP**, 10 branches = **34 542 100 000 PP**. Achat MAX du Shop optionnel seulement si sûr et testable ; sinon achat +1 initial.
- Coût cumulé de `n` rangs : `S(n) = 1 000n + 250n(n−1)/2 + 10n(n−1)(2n−1)/6`. Calculer en BigInt ; l'interface montre prix suivant, niveaux, total dépensé/solde restant et effet réel.
- Prix et identité de chaque branche **immutables et versionnés**. En cas de changement futur, stocker les rangs historiques ou un ledger de remboursement explicitement testable ; jamais de dépense non justifiée.

| Branche principale | Effet maximal à 1 000 niveaux | Détail |
| --- | --- | --- |
| Empire financier | +300 % revenus entreprises | +0,3 point %/rang |
| Maître du trading | +200 % profits nets positifs réalisés | +0,2 point %/rang, pas de boost sur vente à perte/principal |
| Rentier | +200 % dividendes et rendement staking | +0,2 point %/rang, unités de staking respectées |
| Savoir absolu | +200 % XP éligible | +0,2 point %/rang |
| Influence mondiale | +200 % Fame nouvellement gagnée | +0,2 point %/rang |
| Héritage Prestige | +100 % PP aux prochains cycles | +0,1 point %/rang, versionner chaque reçu |
| Capital de départ | Dotation jusqu'à 10^15 $ | Barème exact C2, attribué à chaque reset |

- Les branches peuvent être achetées dès leur mise à disposition, avec le **solde PP déjà possédé** et indépendamment du nombre de cycles supérieur à 3 ; pas de nouveau verrou artificiel Prestige 15.
- Les gains PP du musée (+25 %) et de l'Héritage (+0,1 %/rang) s'additionnent : `PP_crédités = floor(PP_base × (10 000 + 10×rangHéritage + 2 500×muséeComplet)/10 000)`. Un seul arrondi à l'entier en fin d'opération. Aucun PP n'est crédité par un achat.

### C2. Capital de départ

Barème cible **par niveau acheté** (montants en dollars, notation jeu : `10^15 $` = 1 Q dans l'affichage compact) :

| Niveau | Dotation |
| ---: | ---: |
| 0 | 0 $ |
| 1 | 10 000 $ |
| 10 | 1 000 000 $ |
| 50 | 100 000 000 $ |
| 100 | 1 000 000 000 $ |
| 250 | 100 000 000 000 $ |
| 500 | 10 000 000 000 000 $ |
| 1000 | 1 000 000 000 000 000 $ |

Entre paliers, interpolation **linéaire monotone en centimes BigInt avec arrondi vers le bas**, fonction pure, version 1 et tests de tous les points de jonction. Niveau 0 = aucune dotation.

- Attribuer exactement **une fois** la dotation après chaque Prestige réussi, dans la **même transaction atomique** que le reset ; jamais à l'ouverture/reload/import d'une partie déjà en cours.
- Stocker `ascension.run.startingCapitalGrantedCents` (ou champ de provenance équivalent) comme chaîne canonique. Le cash de départ **n'augmente ni** `lifetimeEarned` **ni** les statistiques de revenu, XP, Fame, achievements de gains réalisés ou impôts. Étendre l'invariant `cash <= lifetimeEarned + cycleGiftCents + startingCapitalGrantedCents`.
- **Éviter une boucle de PP sans production nouvelle :** déduire le **principal de dotation du patrimoine éligible au Prestige suivant**, indépendamment de la forme cash/portefeuille/entreprise ; les plus-values et revenus produits à partir de ce capital restent éligibles. Garder les conditions niveau 150 / patrimoine éligible 10 milliards après déduction et impôts ; les pouvoirs News manuels conservent leur propre assiette de prix.
- Une sauvegarde ancienne sans champ de dotation équivaut à `0` ; ne pas attribuer une dotation historique rétroactive lors de la migration.

### C3. News avancées (en PP)

- **Puissance médiatique** (1 000 niveaux) : +0,2 point % de force par rang, cumulé avec le `news-impact` ordinaire (+25 points % par niveau, maximum 4) ; la Frénésie ordinaire reste ×1,5 quand active. La force maximale avec tous les niveaux, hors autres règles, devient **×6** ; remplacer l'ancien plafond interne ×3 par une borne dérivée et testée. Conserver les prix min/max et leur rebond réel.
- **Intensité médiatique** (1 000 niveaux) : accélérer la montée/descente de l'enveloppe de la news, fraction de rampe `max(5 %, 20 % − 0,015 point % × rang)` ; à 1 000 niveaux, rampe de 5 % de la durée. Aucun allongement caché et aucune inversion de direction ; les effets atteignent leur pic plus vite.
- **Durée médiatique** (1 000 niveaux) : +0,1 point % de durée par rang, cumulée avec `news-duration` (+25 points % par rang ordinaire, max 4), soit **jusqu'à ×3** la durée naturelle ; préserver l'intervalle planifié, les phases de rumeur et l'historique.
- News positives **et** négatives bénéficient symétriquement des boosts. La preview et les modales indiquent les **multiplicateurs effectifs** (force, rampe et durée). Les nouvelles durées sont appliquées à la création d'événements ; modifier un rang n'altère pas rétroactivement `endsAt` des news déjà créées. La force/enveloppe peuvent s'appliquer immédiatement aux pressions actives, de façon déterministe.
- Les pouvoirs manuels `Générer` et `Terminer` deviennent accessibles au **Prestige 3** (UI **et** commande métier) ; leurs coûts **5 % / 10 %** en dollars, confirmations, historique et règles de remplacement d'une news directionnelle restent inchangés.

### C4. Collections V3 : puissant, rétroactif, non duplicatif

- Conserver les **100 objets et les prix/acquisitions historiques**. Ajouter à chaque objet, en plus de son bonus individuel original, un bonus de rareté sur sa statistique désignée. Répartition déterministe par **rang actuel 1–20 dans chaque catégorie** : 1–3 commun (+1 %), 4–7 peu commun (+3 %), 8–11 rare (+7 %), 12–15 épique (+15 %), 16–18 légendaire (+30 %), 19–20 mythique (+50 %). Rareté dérivée de l'ID canonique, jamais enregistrée pour chaque objet. Compatibilité IDs historiques obligatoire.
- Récompense permanente à **20/20 pièces** de catégorie, attribuée en **effet calculé** (sans crédit de monnaie, sans activation manuelle et sans cumul répété après recharge) :  
  **Montres : +50 % dividendes** ; **Autos : +50 % clics** ; **Tableaux : +50 % XP** ; **Antiquités : +50 % Fame** ; **Joaillerie : +50 % profits nets positifs de trading**.
- **Musée impérial** débloqué automatiquement quand les **100 IDs canoniques distincts** sont possédés : **+100 % revenus globaux éligibles** (clics, entreprises, dividendes, staking, profits nets positifs réalisés ; sans transformer le principal des ventes en revenu) et **+25 % PP de Prestige futur**. Conserver la séparation des catégories de revenus, fiscalité et XP ; aucun double crédit par source.
- Ne jamais recalculer la Fame ancienne ni re-dépenser les achats d'objets, et **ne pas ajouter la valeur comptable de ces objets à l'assiette PP**. Les effets sont appliqués automatiquement aux objets déjà achetés lors de la mise à jour.
- Contrôle anti-composition : addition des bonus de même assiette au **flux de base une seule fois** ; le Musée n'amplifie pas directement les multiplicateurs Fame absolu ou Prestige Transcendant. L'interface distingue bonus objet initial, bonus rareté, récompense de catégorie et Musée.

### C5. Bonus ultime et plafond Fame

- **Prestige Transcendant ultime** : déblocage automatique gratuit **quand les 7 branches principales sont à 1 000/1 000** (les 3 branches news ne sont pas requises). Les PP **disponibles non dépensés** deviennent une réserve de puissance à rendements décroissants. Formule cible, en calcul rationnel exact :  
  `facteurRéserve = 1 + (0,5 × PP_disponibles / (PP_disponibles + 1 000 000 000))`, avec `1 <= facteurRéserve < 1,5` pour un solde fini.  
  N'amplifie que les **5 branches de gains** (entreprises, trading positif, rentier, XP, Fame), **pas** l'Héritage PP, le capital de départ ni les boosts news, pour éviter une boucle auto-entretenue. Il s'agit d'un effet dérivé, pas d'un solde parallèle.
- **Ascension du Fame** : le plafond actuel ×100 du Prestige absolu devient **`×(100 + nombre de Prestiges terminés)`**. Aucun achat ni limite de niveau gameplay ajouté ; Prestige 2 → ×102, Prestige 100 → ×200, Prestige 1 000 → ×1 100. Le facteur réel reste `min(1,01^floor(Fame_disponible/100), plafond)` et exige toujours les 120 niveaux Fame Shop. Après reset Fame=0, le facteur effectif repart à ×1 jusqu'à nouvelle Fame gagnée.
- Calculer le plafond **dans une source de vérité unique** lue par V8, la projection et les vues. Ne pas évaluer `1,01^N` en Number pour des nombres d'étapes géants ; comparaison de seuils/arithmétique fixe BigInt et format d'affichage compact. Pour l'absence de plafond de cycles à très long terme, prévoir la représentation canonique exacte du compteur et des IDs d'historique au lieu de compter indéfiniment avec `Number.MAX_SAFE_INTEGER`.

## D. Contrat de migration V8 et registres (obligatoire dès la passe 3)

1. **Toujours rester en `version: 8` tant que des champs optionnels versionnés permettent une évolution sans ambiguïté.** Si impossible pour le compteur infini, documenter et tester explicitement le changement de schéma avant l'activation de la passe 7.
2. Introduire une section optionnelle pour anciennes saves, par exemple `ascension.progress.transcendentV1` : `{ version: 1, levels: { <10 IDs canoniques>: number } }`. Les 10 clés stables sont fixées à la passe 3 ; sept branches non encore publiées sont initialisées à zéro. Les sauvegardes historiques **sans** cette section valent zéro achat et restent valides ; conversion persistée après vérification. Rejeter inconnus, négatifs, non-entiers et niveaux >1 000.
3. **Ne pas modifier** la structure `upgradeLevels` V2 ordinaire ni `legacyRanks` : préserver le calcul `prestigeSpent` du catalogue ordinaire. Étendre l'invariant V8 à :  
   `lifetimePP − availablePP = spentClassicV2(versioned historic ranks) + spentTranscendentV1(exact deterministic levels)`.  
   Calculer les dépenses Transcendant avec `S(n)` BigInt. Une importation forgée avec solde modifié, rang gratuit ou prix falsifié doit être refusée.
4. La commande d'achat (version de catalogue, ID, rang attendu, coût exact, solde exact) est **pure et atomique** ; un double clic avec ancien rang doit échouer sans second débit, puis une seule écriture validée. Ne pas enregistrer un compteur « PP dépensés » libre et divergent du catalogue.
5. Migration **idempotente** : `migrate(migrate(save)) === migrate(save)` (contenu), sans crédit, débit, duplicata de bonus ni perte d'achats. L'ancienne sauvegarde brute/backup est conservée avant remplacement ; pas de réécriture partielle en cas d'erreur de stockage/quota.
6. Les historiques PP avec `formulaVersion: 2` doivent rester **strictement vérifiés** contre leur ancienne formule et leurs `earnedPoints` originaux. À partir de la passe 4, nouveaux reçus `formulaVersion: 3` avec `basePoints`, `heritageLevelAtCycle`, `museumCompleteAtCycle`, `bonusBps`, `earnedPoints` ; validation à partir des **valeurs au moment de l'opération**, jamais des bonus présents lors de l'import futur.
7. Les objets historiques conservent leurs IDs et montants de Fame initiaux ; les règles V3 de rareté/catégorie/Musée sont **dérivées** des IDs possédés, pas revendues ni créditées à l'import. Ne pas modifier les preuves d'achat stockées.
8. Pour le capital de départ, section de dotation propre au **cycle courant** ; le validateur teste les bornes de cash en incluant le capital injecté, tout en exigeant que les stats de gains et l'XP ne l'enregistrent pas. Après nouveau Prestige, réinitialiser le témoin et re-créditer **une seule** nouvelle dotation.
9. Les caches/projections V7 avec saturation à `Number.MAX_SAFE_INTEGER` ne peuvent jamais alimenter une opération PP/Fame/cash ; pour le nouveau Shop, les panels doivent lire les montants V8 exacts et les formater via `src/large-numbers.ts`.
10. Scénarios requis : sauvegarde V8 actuelle (sans section), V8 migrée une fois/deux fois, V7 importée, anciens achats Fame/Prestige/Collections, PP >10^30, dollars >10^100, fatigue du stockage, export/import JSON, tentative de fraude du ledger, historique >100 Prestiges (fenêtre historique), sauvegarde malformée sans reset silencieux.

## E. Programme d'exécution — passe préparatoire 0.5 puis exactement huit passes principales

### Passe 0.5 — Animation du billet fixe, fluide et continue (correctif préalable)

**Objectif.** Le sprite du billet doit tourner **en continu à une vitesse visuelle fixe**, dès l'affichage du jeu, sans dépendre du nombre de clics ni s'accélérer aux rafales. Cette passe est un correctif autonome, **à exécuter et valider avant la passe 1**, sans toucher aux autres systèmes.

**Audit ciblé :** `src/App.vue` (fonctions `paintBundle`, `animateBundle`, `advanceBundle`, champs `spinStreak`/`spinTarget`/`spinDuration`, `click`, `replaceWholeSaveExact`, `onMounted`/`onUnmounted`), `src/style.css` (règles `.banknotes`, `.bundle-shadow`, `prefers-reduced-motion`), `src/assets/lira-frames.webp` (48 images, planche 8×6), tests UI `src/components/pass4-home-ui.test.ts` et éventuels tests dédiés à ajouter.

**Travaux à effectuer :**
- Remplacer le pilotage par clic par **une seule horloge d'animation indépendante** : cible **12 frames/s** (une frame visuelle toutes les **83⅓ ms**), séquence 0 → 47 → 0 en boucle, fréquence **constante** même avec 0, 1 ou 100 clics/s. Conserver l'image et sa mise à l'échelle 8×6, sans altérer les textures ni la taille du billet.
- Utiliser une horloge monotone de type `performance.now()` avec index discret calculé depuis le **temps écoulé** (`floor(elapsedMs * 12/1000) % 48`), via une boucle `requestAnimationFrame` unique (ou CSS `steps` si réellement plus robuste et équivalent). **Ne pas incrémenter la frame à chaque rAF** : la cadence doit rester identique sur écrans 60/90/120 Hz, sur mobiles puissants et après ralentissement du rendu.
- Lancer le mouvement lorsque le billet est visible ; suspendre proprement lorsque l'onglet est caché ou que la page Accueil n'est pas affichée, reprendre à vitesse normale sans rattrapage accéléré. Arrêter la boucle à la destruction du composant ; prévenir toute boucle rAF/timer doublée après navigation, relance ou rechargement.
- Détacher totalement les frames, la vitesse et la phase de l'événement `click`, des rafales, de l'Auto Click et de la sauvegarde V8. **Supprimer les réinitialisations du sprite dans `replaceWholeSaveExact`**. L'animation **n'écrit jamais en localStorage** et ne dépend pas du tick économique.
- Préserver intégralement la logique des revenus par clic, de l'Auto Click, des taxes/XP/Fame/PP, de la confirmation de clic et du texte flottant. Les éventuels effets visuels d'appui/ombre peuvent rester très courts, **mais n'ont aucun effet sur la lecture des 48 frames**.
- Accessibilité/performance : respecter `prefers-reduced-motion: reduce` (frame fixe ou alternative minimale), ne pas forcer le CPU en arrière-plan et éviter toute allocation/écriture Vue inutile lorsque l'index de frame n'a pas changé. Garder la compatibilité tactile et clavier.

**Tests de sortie / critères d'acceptation :**
1. Le billet s'anime même sans clic, à environ **12 frames/s**, avec boucle régulière des 48 frames ; il ne s'arrête pas après un clic.
2. Cliquer lentement, rapidement, maintenir une cadence élevée et activer Auto Click **ne modifie jamais** la cadence ni l'ordre des frames ; ne déclenche pas une deuxième boucle.
3. Les gains exacts cash/XP/Fame et les textes flottants restent fonctionnels ; aucune écriture de sauvegarde due à l'animation seule.
4. Navigation Accueil → Trading → Accueil, onglet caché/réaffiché, reset/import/reload et fermeture du composant : pas de blocage, saut disproportionné, double boucle ni fuite de listeners/timers.
5. `prefers-reduced-motion`, smartphone Samsung/navigateurs Android et écran 60/90/120 Hz : comportement cohérent et dégradation gracieuse. Vérifier dans un navigateur réel si disponible, sinon le préciser.
6. **`npm run verify:release`** (tests Node + UI + build) vert ; commit **passe 0.5 uniquement**. Ne pas commencer la passe 1.

### Passe 1 — Achats MAX clic et entreprises

**Objectif.** Acheter instantanément le maximum d'améliorations de clic et de niveaux de chaque entreprise, dans la limite des ressources et du niveau du joueur.

**Fichiers à inspecter/adapter :** `src/App.vue`, `src/game.ts`, `src/exact-runtime-v8.ts`, `src/economy/catalog.ts`, `src/components/EnterpriseScreen.vue`, styles correspondants ; tests métier et UI associés.

**Travaux :**
- Ajouter boutons côte à côte `+1` et `MAX` pour le clic et chaque entreprise, sans remplacer l'achat normal. MAX doit afficher un état désactivé explicite si rien d'achetable ; texte de confirmation avec nombre de niveaux et coût cumulé.
- Clic : déterminer le plus haut rang finançable ET déverrouillé via préfixes de coûts exacts sur les 999 achats existants et recherche dichotomique (ou scan borné de 999, jamais boucle d'opérations). Respecter `requiredLevel`, ne pas débloquer un niveau trop tôt.
- Entreprises : une entreprise non possédée peut être achetée au niveau 1 si déverrouillée, puis MAX applique tous les niveaux finançables. Calcul exact du coût cumulé : sommer séparément la tranche historique <20 et la tranche quadratique, avec arithmétique de sommes de carrés / traitement strict des arrondis par niveau ; recherche dichotomique sur le niveau final sans boucle dépendante de millions de niveaux.
- Appliquer **un seul débit BigInt et une seule mutation d'état** ; `investedCents` = historique + coût total et niveau final exact ; revenus/milestones du niveau obtenu dérivés des fonctions existantes. Réconcilier le rattrapage économique à un instant déterministe avant transaction.
- Ne jamais permettre un MAX à crédit, sur fonds fiscaux négatifs, sur un ancien prix mis en cache ou pendant une sauvegarde bloquée. Séparer pure preview et commande avec état/rang attendu pour les doubles clics.

**Tests de sortie :** comparaison MAX avec achats +1 séquentiels sur petits cas ; exactitude des arrondis 19→20→21, plafond clic, niveau bloquant, cash exactement égal/insuffisant, niveaux entreprises 1/20/21/1000/1 000 000, BigInt >10^100, monotonie prix, aucun gel UI, double clic, rechargement et sauvegarde refusée sans débit. Tests responsive sur 360/390/768 px. `npm run verify:release` vert ; commit **passe 1 uniquement**.

**Suivi — passe 1 validée (17/11/2026) :** préfixe de coûts des 999 achats de clic, recherche dichotomique par niveau joueur et cash exact, achats d'entreprises sans boucle par niveau avec sommes polynomiales et correction d'arrondi périodique (200 rangs), contrôle des rangs attendus, achat MAX atomique en V8, interface +1/MAX et preview du coût. Validation indépendante sur branche de test : **383 tests métier, 90 tests UI, TypeScript + Vite réussis** avec `npm run verify:release` ([preuve GitHub Actions](https://github.com/Nighttug58/CAPITAL_IDLE/actions/runs/44155019569)). Les scripts temporaires de validation ne sont pas publiés sur `main`.

### Passe 2 — Modales Trading compactes, graphique intact, détails permanents

**Objectif.** Réduire la hauteur inutile des modales actions/cryptos/memecoins sans rapetisser le graphique ni perdre les ordres.

**Fichiers :** `src/components/AssetDialog.vue`, `src/components/MarketChart.vue` (contrôle de non-régression, **ne pas réduire** sa surface utile), `src/style.css`, `src/components/{trading-ui,pass2-trading-ui}.test.ts`.

**Travaux :**
- Compacter uniquement en-tête, blocs prix/variation, labels, champs, ratios, frais et espacements verticaux ; revoir scroll internes sur smartphone étroit et orientation paysage.
- Remplacer `<details><summary>Détails du marché et actualités</summary>…</details>` par une section HTML **toujours visible** (prix plancher/plafond, détenu, actualités cliquables). Supprimer le bouton/summary, aucun toggle caché. Garder les news associées actualisées en temps réel.
- Préserver prix, saisie décimale, choix 25/50/MAX, estimation frais/taxes, confirmations achat/vente et focus/fermeture Escape. Aucune modification des règles de trading.

**Tests de sortie :** comparaisons dimensions graphiques avant/après (ou assertions CSS/DOM déterministes), aucun débordement X/Y bloquant, champs accessibles après scroll, stabilité achat/vente et news, clavier, mobile. `npm run verify:release` ; commit passe 2 uniquement.

**Suivi — passe 2 validée (17/11/2026) :** modales actions, cryptomonnaies et memecoins compactées par CSS ciblé ; restauration du défilement **interne** sans affecter les News ; ancien bouton `<details>` supprimé au profit d'une section permanente min/max/détention/news liées ; dimensions et fichier `MarketChart.vue` inchangés. Tests de rendu, interactions achat/vente, navigation vers News, clavier/Escape, styles mobiles et paysage. Validation sur branche isolée : **383 tests métier, 95 tests UI, TypeScript/Vite réussis**, avec `npm run verify:release` ([preuve GitHub Actions](https://github.com/Nighttug58/CAPITAL_IDLE/actions/runs/44162811916)). Le workflow temporaire n'est pas fusionné sur `main`.

### Passe 3 — PP news avancées et pouvoirs manuels accessibles au Prestige 3

**Objectif.** Installer le socle **commun des dix branches Transcendant** et rendre utilisables les **trois branches news** (Puissance, Intensité, Durée).

**Fichiers :** nouveaux modules de catalogue/ledger/commande `src/ascension/transcendent-*.ts`, `src/exact-state-v8.ts`, `src/exact-save-validation.ts`, `src/exact-persistence-v8.ts`, `src/trading/news.ts`, `src/exact-market-v8.ts`, `src/ascension/market-effects.ts`, `src/news-powers.ts`, `src/components/{PrestigeScreen,TradingScreen,NewsDialog}.vue` et tests.

**Travaux :**
- Poser schéma `transcendentV1` avec **10 IDs réservés**, les sept branches futures à zéro ; intégrer le nouveau ledger exact d'achat PP dans validation et import/export **sans** changer la boutique ordinaire.
- Implémenter les 3 branches news et leurs prix C(k), descriptions, progression 0/1 000, effets et achat atomique. Si possible factoriser les deux sources V7/V8 de multiplicateurs news, mais laisser V8 seule autorité du marché.
- Faire remonter force/intensité/durée dans la pression réelle, pas seulement l'affichage ; remplacer les plafonds techniques incompatibles **par les nouveaux plafonds documentés**, sans casser les limites de prix et les rebonds ni introduire Infinity/NaN. Durées nouvelles uniquement pour événements futurs, preview exacte.
- Ramener les **deux pouvoirs News manuels** au Prestige 3 en deux endroits (commande dans `news-powers.ts` et UI), en conservant frais et protections ; même seed/calendrier/news directionnelle de secours.

**Tests de sortie :** achat max rang news et rangs 0/1/1000, ID inconnu, PP insuffisants, ledger, import old V8 et double clic ; intensité et puissance affectent réellement cours/dividendes positifs ET négatifs, limites de prix, force ≤6, durée ≤3, lecture avant/après ticks, replay offline/reload déterministe, disparition et secours immédiat de la dernière news active, verrous 2/3 des pouvoirs manuels. `npm run verify:release` ; commit passe 3 uniquement.

### Passe 4 — Prestige Transcendant Shop (sept branches à 1 000 niveaux)

**Objectif.** Ouvrir une **page boutique Transcendant dédiée** et les sept branches principales, réutilisant le socle et les trois branches news de la passe 3.

**Fichiers :** catalogue/commande/ledger Transcendant, `src/exact-runtime-v8.ts`, `src/exact-prestige-v8.ts`, `src/exact-staking-v8.ts`, `src/exact-market-v8.ts`, `src/components/PrestigeScreen.vue`, nouvelle `src/components/TranscendentShopScreen.vue`, `src/App.vue` et tests.

**Travaux :**
- Introduire sept offres de 0–1 000, prix exacts, achats +1 et lecture des PP exacts, avec navigation depuis Prestige ; annoncer l'effet du Capital de départ comme **« disponible après passe 5 » seulement si activé dans cette passe** pour éviter de vendre une capacité non fonctionnelle. Préférence : rendre la branche Capital achetable uniquement à la passe 5, mais déjà inscrite au catalogue/ledger versionné à 0.
- Brancher les cinq bonus économiques (+0,3/0,2 points % par rang) sur les flux V8 exacts et cumulables de manière additive ; taux de trading sur profits nets réalisés, staking sur récompenses en coins, pas sur principal. Ne pas compter deux fois les mêmes bénéfices dans les stats/XP/taxes.
- Brancher `Héritage Prestige` sur l'octroi des **nouveaux** PP (+0,1 point %/rang) après calcul de la formule V2 de base, avec historique `formulaVersion: 3` / justificatifs de rang et validation versionnée ; ne pas modifier les anciennes lignes V2.
- Réafficher la boutique Prestige ordinaire et les contrôles sans réintroduire de verrous >3, ni les automatisations supprimées. La boutique de 11 branches reste accessible indépendamment de Transcendant.
- Préparer effets/preview du capital et du Musée avec zéro tant que les passes suivantes ne sont pas développées, sans inventer de monnaie à l'achat.

**Tests de sortie :** dix branches strictes et leurs prix, 7 branches visibles (et 3 news dans leur section), coût cumulé 24 179 470 000 PP pour les sept, achats et rangs extrêmes, aucune altération des PP acquis antérieurement, staleness/double débit, tous types de revenus isolés, PP héritage sur plusieurs cycles, historiques V2/V3 vérifiés, compatibilité V8 et performance de la page mobile. `npm run verify:release` ; commit passe 4 uniquement.

### Passe 5 — Capital de départ par Prestige

**Objectif.** Activer la septième branche et démarrer chaque Prestige avec une dotation calculée selon son niveau.

**Fichiers :** `src/exact-prestige-v8.ts`, `src/exact-state-v8.ts`, `src/exact-save-validation.ts`, `src/exact-persistence-v8.ts`, module de barème exact, UI Prestige + Transcendant ; tests Prestige/XP/impôts/import.

**Travaux :**
- Implémenter tous les paliers C2, interpolation précise BigInt, prévisualisation de la dotation du prochain cycle et niveau 0 = zéro.
- À la confirmation : **rattrapage + règlement des taxes + calcul du patrimoine éligible net (hors dotation initiale et collections) + octroi PP + reset + dotation** en **une seule transition persistée**. La dotation ne vaut pas revenu, ne crédite ni XP/Fame/stats/taxes, et ne crée pas de cadeau d'achievement de gains.
- Étendre invariant du cash avec le champ de dotation, préserver l'ancrage fiscal 72 h, garantir que le principal de départ n'est pas éligible pour les prochains PP, même après investissement. Respecter les taxes et les éventuelles pertes.
- Dans les sauvegardes anciennes, champ absent = 0, aucune dotation rétroactive ; migration idempotente. La dotation devient acquise au **prochain** Prestige effectué après l'achat du rang.

**Tests de sortie :** tous les paliers, interpolation monotone, Prestige niveau 149 vs 150 et seuil 10 milliards, cash après taxes, absence de faux XP/Fame/revenu fiscal, histoire PP exacte, placement en bourse/entreprises sans double assiette, édition/import forge du témoin, reset effectué deux fois sans double crédit, transaction échouée intacte. `npm run verify:release` ; commit passe 5 uniquement.

### Passe 6 — Collections V3 : raretés, bonus de set et Musée impérial

**Objectif.** Faire des 100 objets un pilier majeur de progression tout en conservant les anciennes possessions.

**Fichiers :** `src/prestige/catalog.ts`, `src/prestige/collections-catalog.ts`, nouveau module bonus collections calculés, `src/prestige/bonuses.ts`, `src/exact-runtime-v8.ts`, `src/exact-prestige-v8.ts`, `src/components/CollectionScreen.vue`, `src/components/StatsScreen.vue` et tests.

**Travaux :**
- Ajouter la rareté déterministe de C4 sur chaque objet, avec bonus **additionnel** sur la statistique originale ; ne pas changer les prix, bonus historiques ni le montant de Fame déjà attribué.
- Accorder automatiquement les cinq bonus de catégories à 20/20 ; afficher 0–20, état complété et description exacte. Compatibilité objets acquis en versions anciennes / V2 et IDs sans doublons.
- Musée 100/100 : +100 % aux revenus globaux éligibles, +25 % PP futurs ; intégrer le PP au **reçu V3 avec état Musée au moment du cycle**, sans retoucher les anciennes récompenses.
- Optimiser le calcul des 100 possessions : cache/mémo des bonus dérivés par changement d'inventaire, pas de parcours complet inutile à chaque seconde de dividende ; actualiser sans recharger après acquisition de la dernière pièce.
- Mettre à jour détails objet, affichage Fame/bonus individuels, rareté, bonus de set et Musée ; garder annonces/achats accessibles sur mobile.

**Tests de sortie :** 5 × 20 canoniques, 100/100 avec legacy V1/V2, 19/20 et 99/100 sans bonus prématuré, achat dernier objet active effet une seule fois, bonus appliqués rétroactivement aux possessions, pas de Fame dupliquée, valeur comptable exclue PP, gains de tous les flux exactement additifs, +25 % PP et reçus V3 immuables même après modification de possession. `npm run verify:release` ; commit passe 6 uniquement.

### Passe 7 — Ascension du Fame et Transcendant ultime

**Objectif.** Porter le plafond Fame de ×100 à `×(100+Prestiges)` sans maximum de niveau gameplay et rendre les PP non dépensés utiles après le 7 × 1 000.

**Fichiers :** `src/prestige/absolute.ts`, `src/exact-runtime-v8.ts`, `src/prestige/bonuses.ts`, `src/exact-view-v8.ts`, `src/exact-state-v8.ts`, `src/exact-save-validation.ts`, `src/components/{FameShopScreen,StatsScreen,TranscendentShopScreen}.vue` et tests.

**Travaux :**
- Centraliser la formule Fame en une seule fonction pure compatible V8 exacte, supprimer les deux plafonds rigides ×100 ; associer le cap au nombre de cycles **effectivement terminés**, jamais au nombre de points ou à la Fame cumulée.
- Garantir l'absence d'exponentiation `1,01^énormeN` en Number. Réduire les divisions/arrondis à un ratio exact quand les bonus dépassent la précision Number, sans empêcher les montants BigInt immenses ; aucune production d'Infinity/NaN ni crash de sauvegarde. La projection ancienne reste une vue bornée.
- Pour la progression **sans plafond de cycle**, auditer tous les endroits qui supposent `prestigeCount: number` (historique, achievement, gating et UI). Si nécessaire, introduire un compteur canonique en chaîne, migrer/rétroprojeter l'ancien, et valider les index de l'historique glissant ; ne pas tronquer les cycles dans la donnée d'autorité.
- Implémenter `facteurRéserve` C5 : après 7 × 1 000, pas d'achat supplémentaire ; bonus recalculé immédiatement à chaque dépense/gain PP, borné <×1,5 et applicable uniquement aux 5 branches de revenus/XP/Fame. Pas de boucle Héritage PP ni effet sur le capital initial et les news.
- Fame Shop affiche plafond effectif, progression ×1,01 par 100 Fame disponibles, tranche suivante si applicable ; Stats et le calcul V8 donnent **la même valeur**. Bonus collections non amplifiés par le Fame absolu comme aujourd'hui.

**Tests de sortie :** cap ×100/×101/×102/×200/×1100, Fame disponible=0 après reset, Shop incomplet=×1, >10^15 Fame, cycles très élevés et sauvegarde exact/compat, PP réserve 0/1M/1B/10^100, activation uniquement à 7 ×1000, pas d'amplification sur PP/dotation/news, formatage sans NaN/Infinity, performance temps réel. `npm run verify:release` ; commit passe 7 uniquement.

### Passe 8 — Stabilisation, équilibrage et publication finale

**Objectif.** Valider le parcours complet, nettoyer seulement ce que la refonte rend obsolète et publier une version fiable.

**Travaux :**
- Audit transversal achats MAX → trading/news → PP → Prestige → dotation → collections → Fame → Prestige ultime ; vérifier notamment l'ordre des bonus, la taxe, le rattrapage offline, les soldes négatifs, les ordres, le staking, le cycle et les mutations sur sauvegarde.
- Mesurer les performances (achats MAX à hauts niveaux, 100 collections dans le tick, achats/affichages 10 ×1000, 10^100 montants, navigateur mobile). Ajuster si nécessaire **sans changer les règles produit** ou casser les sauvegardes ; documenter les compromis de performance.
- Construire une matrice d'import/export : nouvelles parties, anciennes sauvegardes V8 avec/sans `transcendentV1`, imports historiques, grosses fortunes et toutes les preuves des achats ; tester les corruptions, échecs d'écriture, valeurs limites, recharge dans l'ordre aléatoire.
- Tester réellement l'UI dans un navigateur si l'outillage le permet : 360/390/768 px, desktop, paysage, scroll, focus, modales, boutons MAX, animation autonome du billet (sans clic/rafale/Auto Click, 12 fps), formes de nombres, interactions pendant live news / dernier événement actif. Si navigateur indisponible, le signaler et ne pas prétendre l'avoir testé.
- Mettre à jour `README.md` (déblocages ordinaires ≤Prestige 3, pouvoirs news au 3, 10 branches PP avancées, collections 100/100, Fame cap, dotation, sauvegarde) et corriger textes obsolètes **dans cette passe seulement**.
- Exécuter `npm run verify:release` ; puis `npm run build:root` afin de compiler les artefacts de site et vérifier le déploiement GitHub Pages. Commit seulement si build/tests verts. Publier le bilan de fichiers, tests, risques résiduels et preuve de déploiement ; en cas d'échec, corriger avant toute déclaration de succès.

**Livrables de validation finale :** suite métier + UI + TypeScript/Vite **vertes**, export/import exact V8, aucun ancien palier Prestige >3, aucune perte de collections/PP/Fame, stabilité news, achats MAX performants, UI mobile utilisable, artefacts racine synchronisés et mise en production vérifiée.

## F. Suivi et discipline de « Next »

| Passe | Objet | État |
| ---: | --- | --- |
| **0.5** | Billet animé en continu, 12 fps constants, indépendant des clics | ✅ Terminé |
| 1 | MAX clic + MAX entreprises | ✅ Terminé |
| 2 | Modales Trading compactes + détails visibles | ✅ Terminé |
| 3 | News avancées PP + commandes manuelles au Prestige 3 | ☐ À faire |
| 4 | Transcendant Shop, 7 branches 1 000 niveaux | ☐ À faire |
| 5 | Capital de départ attribué au reset | ☐ À faire |
| 6 | Collections V3 + Musée impérial | ☐ À faire |
| 7 | Plafond Fame progressif + bonus ultime PP | ☐ À faire |
| 8 | Audit intégral, tests, build, publication | ☐ À faire |

**Démarrage actualisé (17/11/2026) :** les passes **0.5, 1 et 2** sont validées. Au prochain message « Next », inspecter `main` puis exécuter **uniquement la passe 3** (news avancées PP et pouvoirs manuels au Prestige 3), avec vérification et commit avant la passe 4. Les passes 3 à 8 ne sont pas commencées. Une passe incomplète reste signalée comme telle ; ne jamais maquiller l'absence de tests/production en succès.
