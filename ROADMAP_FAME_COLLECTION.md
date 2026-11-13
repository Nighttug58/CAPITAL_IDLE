# ROADMAP — CAPITAL_IDLE / Fame, Collection & Prestige absolu

**Statut : en cours — 5/8 passes livrées**  
**Branche cible : `main`**  
**Date de définition : 13 novembre 2026**  
**Périmètre :** nouvelle monnaie Fame, 6 boosts achetables, 50 objets de luxe, bonus partagés, Prestige absolu, progression au-delà du niveau 100 et sauvegarde.

> **Protocole « next » :** exécuter **la première passe non cochée**, terminer l'implémentation et les tests associés, puis commiter le code **et la coche de cette passe** sur `main`. Ne jamais cocher une passe sans vérifications. Si nécessaire, scinder une passe en sous-passes suivies dans ce document. Les autres roadmaps sont terminées ; ne pas refaire Trading, News, Entreprises ou Fiscalité sans motif lié au présent chantier. Les commandes de validation minimales sont `npm test` et `npm run build` (qui vérifie les types) ; `npm run test:ui` est déjà inclus dans `npm test`.

## 0. État réel du dépôt avant travaux

- Vue 3 + TypeScript + Vite ; branche `main`, publication GitHub Pages depuis `main / (root)`.
- `src/game.ts` contient **50 niveaux** et **49 améliorations de clic** ; `game.lifetimeEarned` détermine actuellement aussi le niveau. Le clic initial vaut 1 $.
- `src/capital.ts` regroupe le seul solde cash (`game.balance`), Trading, Entreprises, fiscalité et Stats. La sauvegarde locale est **v5** (`src/persistence.ts`, `src/save-transfer.ts`), avec migrations anciennes et import/export JSON validés.
- La navigation de `src/App.vue` est **Accueil / Trading / Entreprises / Stats** ; **Stats doit rester tout à droite**. Composants `TradingScreen.vue`, `EnterpriseScreen.vue`, `StatsScreen.vue`.
- Entreprises : revenus fixes, cumul hors ligne sans seconde boucle ; `src/economy/catalog.ts` a une restriction d'accès `playerLevel <= 50` à supprimer lors de l'extension de niveaux.
- Revenus : clic (`src/economy/stats-ledger.ts`), entreprises (`src/economy/enterprises.ts`), dividendes (moteur Trading), profits de vente (`src/trading/trades.ts`), XP et stats. Fiscalité : revenus d'entreprises et plus-values positives réalisées sont taxés à échéance de 72 h ; **clics et dividendes restent non taxés**.
- Les anciennes roadmaps `ROADMAP_TRADING.md` et `ROADMAP_ENTREPRISES_STATS_FISCALITE.md` sont terminées ; ne pas réouvrir leurs passes.
- Aucun `AGENTS.md` à la racine constaté.

## 1. Spécification fonctionnelle verrouillée

### A. Fame : monnaie et gains

- Deuxième monnaie **Fame**, distincte du cash/Gold ; **aucun achat en Fame à crédit**.
- UI Accueil/Clic : petit bouton horizontal **à droite du solde Gold**, libellé `Fame 320 ✦ Shop` (étoile à quatre branches), violet clair en haut et violet foncé en bas ; ouvre une **modale scrollable**. Responsive PC/mobile ; aucun contenu microscopique ou écrasé verticalement.
- **Deux seules sources** : (1) niveau atteint ; (2) achat unique de collection. Pas de Fame par clic, tick passif, trading, entreprise ou taxe.
- Au passage au niveau `n`, attribuer **`n` Fame de base**. De 1 à 100 : `1+2+...+100 = 5 050` Fame.
- Le niveau 1 donne bien **1 Fame**. Une migration doit attribuer **une seule fois** l'historique des niveaux atteints pour ne pas pénaliser les sauvegardes v5 ; nouvel état et anciens états ne doivent jamais créditer deux fois.
- Les récompenses de Fame nouvelles sont multipliées par le bonus Notoriété en vigueur **au moment de l'événement**, sans rattrapage rétroactif. Conserver les sous-unités/fractions de Fame avec une arithmétique stable ; affichage lisible sans créer/perdre de monnaie par arrondi.
- Le niveau 100 est **un objectif de calibrage, pas un maximum** ; continuer les niveaux au-delà pour nourrir Prestige absolu. Éviter tableaux exponentiels infinis et débordements de `Number`. Les **49 améliorations de clic existantes restent telles quelles** et peuvent demeurer plafonnées au niveau 50.

### B. Six boosts Fame — paliers et prix exacts

Tous les boosts ont **20 paliers**, chacun procurant **+5 points de pourcentage** au bonus correspondant ; maximum **+100 % avant Prestige absolu**.

| ID / boost | Effet permanent | Formule prix du palier `p` (1..20) | Total |
| --- | --- | --- | ---: |
| `click` — Puissance de clic | Revenus réellement crédités par clic | `52 + 15*(p-1)` Fame | 3 890 |
| `enterprise` — Empire industriel | Revenus bruts des entreprises, y compris hors ligne | idem | 3 890 |
| `dividend` — Dividendes | Versements de dividendes réellement reçus | idem | 3 890 |
| `xp` — Expérience | XP attribuée (sans fabriquer de cash) | idem | 3 890 |
| `trading` — Trading | Uniquement les **profits positifs nets réalisés** à la vente, jamais le capital restitué ni les pertes | idem | 3 890 |
| `fame` — Notoriété | Nouveaux gains de Fame (niveaux et collections uniquement) | `70 + 20*(p-1)` Fame | 5 200 |

**Coût total garanti des 120 achats = `5 × 3 890 + 5 200 = 24 650 Fame`.** Prix progressifs **linéaires par palier**, pas exponentiels. Aucun palier ne dépasse 20. Une opération d'achat est atomique : confirmer fonds/limites, débiter Fame une seule fois, incrémenter le niveau une seule fois, persister.

Les contributions des boosts **s'additionnent** aux contributions collection de la même statistique, sans composition entre boosts ordinaires. Exemple : Fame clic +60 % et collections clic +3 % ⇒ clic +63 % (avant Prestige).

### C. Collection : 5 catégories, 50 pièces uniques

- Navigation principale : **Accueil / Trading / Entreprises / Collection / Stats** (Stats toujours à droite).
- Cinq **onglets** uniquement : **Montres, Autos, Peintures, Antiquités, Joaillerie**.
- **10 objets par catégorie**, catalogue immuable : ID stable, nom, courte description, catégorie, prix en Gold/cash, illustration ou traitement visuel, Fame attribuée, type de bonus parmi les **six existants**, bonus en points de base, état possédé.
- Sélection ⇒ **modale descriptive** lisible avec résumé, prix, Fame attribuée, effet et bouton Acheter. **Un achat par objet**, définitif ; **aucune revente**, aucun double crédit après réouverture/import.
- Le prix en Gold augmente avec le rang/rareté. **Les 50 prix fictifs ont été fixés en passe 1** dans `src/prestige/catalog.ts`, entre **1 500 $ et 450 M$**, en s'appuyant sur les jalons du catalogue Entreprises (Kiosque 75 k$, Centre commercial 500 M$ / retour brut 30 h). Ils restent ajustables ultérieurement sur justification mesurée, sans toucher à la Fame attribuée. Prévoir des objets accessibles tôt et des objets prestigieux de fin de progression.
- Bonus d'objet **petits et permanents**, de **+0,1 %** à **+5,0 %**, répartis sur les mêmes six statistiques que la boutique, et jamais un bonus nouveau.

| Rang dans chaque catégorie | Fame de base | Bonus permanent |
| ---: | ---: | ---: |
| 1 | 10 | +0,1 % |
| 2 | 25 | +0,2 % |
| 3 | 50 | +0,3 % |
| 4 | 100 | +0,5 % |
| 5 | 180 | +0,8 % |
| 6 | 300 | +1,2 % |
| 7 | 500 | +1,8 % |
| 8 | 750 | +2,5 % |
| 9 | 950 | +3,5 % |
| 10 | 1 175 | +5,0 % |
| **Somme par catégorie** | **4 040** | **+15,9 points répartis sur les bonus** |

**5 catégories = 20 200 Fame de base.** Les bonus individuels ne doivent jamais être appliqués à toutes les statistiques à la fois : un objet cible **une** statistique précise. Toute la collection a une identité et un avantage distincts à documenter dans le catalogue.

### D. Contrat d'équilibrage sans boost

| Origine | Fame de base | Part |
| --- | ---: | ---: |
| Niveaux 1 à 100 | 5 050 | 20 % |
| 50 objets de Collection | 20 200 | 80 % |
| **Budget total sans bonus** | **25 250** | **100 %** |
| **Coût intégral Fame Shop** | **24 650** | |
| **Solde minimal restant** | **600** | |

**Critère non négociable :** le joueur ayant atteint le **niveau 100**, acquis les **50 objets**, et ayant reçu **zéro bonus Notoriété sur ses récompenses**, peut acheter **les 120 paliers** et garder **600 Fame**. Cette proportion **80 % collections / 20 % niveaux est une répartition de base à niveau 100**, pas un pourcentage imposé sur tous les parcours après application de boosts. Tester ces totaux automatiquement (aucun calcul uniquement documenté).

### E. Prestige absolu — récompense Endgame

- **Septième effet spécial**, mais **pas de septième série de paliers ni de coût** : déblocage **gratuit et automatique** seulement quand les **six** boosts atteignent chacun le niveau **20** (120/120).
- **Chaque tranche complète de 100 Fame encore possédées** multiplie les bonus du Fame Shop par **×1,01**, de manière **composée** :
  `prestigeMultiplier = 1.01 ** Math.floor(availableFame / 100)`.
- Multiplier **uniquement la portion bonus venant du Fame Shop** (y compris Notoriété), pas le revenu de base, ni les bonus des collections, ni Prestige lui-même. Pour une statistique : `totalMultiplier = 1 + collectionBonus + (shopBonus * prestigeMultiplier)`, avec bonus exprimés en fractions.
- Multiplicateur recalculé selon **Fame disponible**, et non Fame gagnée à vie ; Fame gagnée au-delà du niveau 100 entretient cette progression. Limiter les erreurs de précision, gérer les valeurs extrêmes sans `Infinity` ni corrompre la sauvegarde.
- À la fin du Shop sans aucun boost Fame, la réserve minimale **600 Fame** donne `1.01^6 ≈ 1.06152`. Aucun effet rétroactif sur revenus, transactions ni Fame déjà gagnés.

### F. Invariants comptables et sauvegardes

- **Cash/Gold** reste le seul solde monétaire. Fame = compteurs de prestige séparés, non convertibles en Gold.
- La dépense en Collection diminue le cash et augmente les possessions/Fame/bonus **une seule fois**, **sans XP ni revenu positif**. Des pièces détenues peuvent figurer dans le patrimoine sous **valeur comptable au prix d'achat** (pas de valorisation de marché ni vente) ; l'intégration Stats doit documenter explicitement ce choix pour éviter de compter deux fois le prix.
- **Important :** `game.lifetimeEarned` doit continuer de refléter les **revenus monétaires réellement crédités**. Ajouter une **autorité XP distincte** avant d'appliquer le bonus Expérience, sinon un boost d'XP inventerait des revenus et fausserait les Stats.
- Le revenu bonus d'entreprises s'applique au **brut crédité** et à sa dette fiscale ; le bonus Trading à la **plus-value nette positive réellement payée**, à l'XP/ledger associés et à la fiscalité selon les règles existantes. Clics et dividendes restent hors fiscalité sauf changement de règle ultérieur explicite.
- Opérations de marché et cash conservent leurs frais, prix de revient et pertes ; pas de profit sur le capital restitué. Conserver rattrapages hors ligne, reliquats sous-centimes, horloges de 72 h et Stats par source.
- **Versionner le schéma de sauvegarde (v6 envisagée)** avec `fame`, `collections`, niveaux des boosts et XP autonome ; migration **v1–v5**, import/export/réinitialisation et validation stricte. Pas de progression Fame recomptée à chaque chargement ou horloge.
- Les moteurs métier sont purs et centralisés, sans logique d'argent/Fame dupliquée dans Vue ; aucune seconde boucle de simulation pour la collection.

## 2. Plan d'implémentation en 8 passes

### [x] Passe 1 — Socle de catalogue et tests d'équilibrage

- Fixer des IDs stables pour les six bonus et cinq catégories ; ajouter tables immuables : 20 coûts normaux, 20 coûts Notoriété, rangs collection Fame/bonus.
- Créer les tests vérifiant sommes **3 890 / 5 200 / 24 650**, **4 040 × 5 = 20 200**, **25 250 − 24 650 = 600**, **80 %** de Fame de base issues des collections.
- Déterminer les **50 prix cash**, avec simulation/profil de revenus existants (départ, niveaux 10/25/50/75/100, revenus entreprises/Trading, hors ligne) et borner chaque prix en centimes sûrs.
- Livrable : catalogue central et règles de calcul testées, **sans changement visible dans le jeu**.
- **Livraison du 13/11/2026 :** `src/prestige/catalog.ts` (six boosts, prix exacts des 20 paliers, cinq catégories, 50 emplacements à ID stable, récompenses et 50 prix cash immuables), `src/prestige/catalog.test.ts` (cinq tests), `package.json` (script npm test mis à jour). Contrôle de sommes : 3 890 × 5 + 5 200 = 24 650 ; 50 objets = 20 200 Fame ; niveau 100 = 5 050 ; solde sans boosts = 600.
- **Validation exécutée :** `node --experimental-strip-types --test src/prestige/catalog.test.ts` → **5/5 PASS** ; `tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --allowImportingTsExtensions --strict --noUnusedLocals --noUnusedParameters src/prestige/catalog.ts` → **PASS**. Identité des contenus testés et commités vérifiée par SHA Git blob. **Limite :** `npm test` complet et `npm run build` du dépôt entier non exécutés localement (clone complet inaccessible dans l'environnement de validation) ; les exécuter dès qu'un environnement complet est disponible, au plus tard en passe 8. Aucun changement de runtime ni de l'UI à cette passe.


### [x] Passe 2 — Niveaux au-delà de 100, XP distincte, état Fame et migration

- Séparer XP de `lifetimeEarned` dans la progression : les 50 seuils historiques jusqu'au niveau 50 restent compatibles ; étendre les niveaux au-delà de 100 de manière stable et sûre.
- Corriger `isEnterpriseUnlocked` qui rejette actuellement les joueurs de niveau >50, sans modifier les conditions de niveau minimum des 20 entreprises.
- Ajouter Fame, XP autonome, niveau Fame déjà récompensé, collections possédées, six niveaux de boost, état Endgame à l'état central ; sauvegarde v6, migrations, chargements, exports/imports et reset.
- Migrations : créditer une seule fois la somme des niveaux déjà atteints ; frais et bonus préexistants inchangés ; aucune monnaie perdue ni double récompense.
- Tests : level-up multiple (y compris hors ligne), niveau 1, 50→51, 99→100, >100, migrations et sauvegardes invalides.
- Livrable : progression sans plafond arbitraire à 100 et comptabilité Fame fiable.
- **Livraison vérifiée du 13/11/2026 :** `src/game.ts` conserve les 50 seuils historiques et les 49 upgrades du clic, mais calcule les niveaux 51+ dynamiquement ; `src/economy/catalog.ts` accepte les joueurs de niveau supérieur à 50. L'état v6 ajoute `prestige.experienceCents`, `fameMicros`, les Fame cumulées et leur origine, le dernier niveau récompensé, les futurs niveaux de boosts et les collections possédées. La Fame niveau 1 vaut 1 ; chaque niveau atteint `n` attribue une fois `n` Fame (y compris saut de niveaux). Les revenus cash restent distincts de l'XP.
- Les quatre propriétaires des crédits (clic, entreprises, dividendes, profits positifs reconnus au Trading) enregistrent maintenant l'XP et les Fame de niveaux via `creditExperience` ; ni les achats ni les taxes ne créent d'XP. L'affichage de progression et Stats lit l'XP distincte ; les revenus monétaires et leur ventilation restent inchangés.
- **Sauvegarde :** priorité `localStorage` v6, migration **v1–v5** sans répétition, import JSON brut v4/v5/v6 validé avant remplacement, export complet v6 et reset conservés. Les tests historiques v5 ont été adaptés et `src/prestige/state.test.ts` couvre niveau 1, 50/51, 99/100, 100/101, sauts, restauration v5 et données Fame corrompues.
- **Validation CI confirmée :** GitHub Actions `Build main/root site` a réussi `npm test` (incluant les tests UI Vue et les tests Fame) et `npm run build:root`, puis généré/commité les artefacts de production dans [`0390c371`](https://github.com/Nighttug58/CAPITAL_IDLE/commit/0390c3715a47df04f6d7aa169197b4eefd8bf7af). Les changements de gameplay visuel Fame/Collection restent réservés aux passes 4–7.

### [x] Passe 3 — Moteur partagé de bonus, intégration aux six sources

- Exposer une **unique fonction de calcul** par type de boost combinant shop, collections et futur Prestige ; valeurs en points de base, calculs sûrs.
- Brancher le boost clic à la récompense, entreprises au rattrapage agrégé et à la taxation, dividendes à leur versement, trading aux seuls profits positifs nets, XP à la nouvelle autorité, Fame à l'attribution level-up/achat de collection.
- Préserver les règles actuelles pour les comptes sans boost, les arrondis, le stockage, les transactions, l'XP et la fiscalité.
- Tests d'intégration : +0 %, +5 %, +100 % ; cumul +0,1 % collection ; taxes sur revenus augmentés ; pas de double revenu, ni bonus sur pertes/capital ; offline.
- Livrable : moteur appliqué à toutes les sources, sans régression économique.
- **Livraison validée (14/11/2026) :** moteur unique `src/prestige/bonuses.ts` avec `getBonusBreakdown`, `getTotalBonusBps`, `getBonusMultiplier` et mise à l'échelle précise des récompenses. `src/prestige/catalog.ts` associe chaque emplacement de collection à une seule des six statistiques, sans bonus supplémentaire. Shop (+5 %/palier) et Collection (+0,1 % à +5 %) s'additionnent sans composition ; Prestige absolu reste réservé à la passe 7.
- **Intégrations :** clic (récompense et texte flottant existant), entreprises (brut, rattrapage hors ligne, dette fiscale et XP), dividendes (avant reliquat sous-centime), trading (uniquement bénéfice net réalisé positif ; supplément réellement crédité, imposé et comptabilisé, jamais capital restitué ni perte), XP (compteur distinct) et Fame (nouvelles récompenses de niveau uniquement, sans recalcul historique). Reliquats `clickCarryBps`, `tradingCarryBps`, `experienceCarryBps` persistés en v6, et migration compatible avec les premières sauvegardes v6 sans ces champs.
- **Affichage :** la page Entreprises et Stats présentent le revenu brut augmenté et utilisent le compteur XP indépendant pour débloquer les entreprises ; le code ancien reste inchangé pour les comptes sans boosts.
- **Validation effective :** GitHub Actions [run 43527336314](https://github.com/Nighttug58/CAPITAL_IDLE/actions/runs/43527336314) **success** pour `npm test` (**178 tests métier + 26 tests UI**) et `npm run build:root` (TypeScript/Vite). Première erreur de typage TS2322 dans le catalogue détectée via les logs, corrigée avec les unions littérales `as const`, puis nouveau workflow validé. Publication des assets `main / (root)` demandée avec succès.

### [x] Passe 4 — Achat et progression du Fame Shop

- Actions métier pures : `buyFameUpgrade(type)`, validations fonds, limites de niveau, coûts, débit atomique et conservation des fractions.
- 20 paliers par type, **+5 % par palier**, tarifs figés et plus chers pour Notoriété.
- Tests : achat 1→20, 20→refus, insuffisance, refus cash négatif sans incidence, impossibilité d'acheter deux fois un même palier, coût total 24 650.
- Livrable : boutique fonctionnelle au niveau domaine, sans UI définitive.
- **Livraison du 14/11/2026 :** `src/prestige/shop.ts` fournit `buyFameUpgrade(state, id, expectedCurrentLevel)`, `getFameShopOffer(s)` et `hasValidFameShopLedger`. L'achat est une transition pure et atomique : un seul palier, coût exact en Fame (micro-unités), +500 points de base (+5 %), aucune mutation du cash, des taxes, de l'XP, des revenus passés ni de la Fame totale gagnée. Le palier attendu **obligatoire** rejette une seconde action d'UI devenue périmée (`stale-level`) plutôt que d'acheter accidentellement le niveau suivant ; refus des IDs inconnus, fonds insuffisants, états invalides et niveaux 20/20.
- **Anti-doublon sauvegarde :** `getPurchasedFameBoostCost` dans `src/prestige/catalog.ts` dérive les sommes des paliers détenus ; `restorePrestigeState` vérifie exactement `FameGagnéeTotale − FameDisponible = PrixDesPaliersAcquis` avant d'accepter un snapshot v6. Aucun second compteur de dépenses ne risque de diverger ; les fractions de Fame ne sont jamais arrondies lors de l'achat.
- **Tests :** `src/prestige/shop.test.ts` couvre les six offres et prix, achat simple, achat répété au même palier, fonds insuffisants, état invalide, cash négatif (indépendant de la Fame), fractions avec Notoriété, persistance localStorage/export/import JSON, restauration anti-triche et **120 achats après niveau 100 + 50 collections pour 24 650 Fame, laissant 600 Fame**. Cette passe ne crée ni nouvel écran ni bouton d'achat (UI prévue passe 6).
- **CI validée :** workflow GitHub Actions [run 43528260071](https://github.com/Nighttug58/CAPITAL_IDLE/actions/runs/43528260071) **success** avec **186 tests métier + 26 tests UI (212 au total)**, `vue-tsc --noEmit`, `vite build`, synchronisation du site `main/(root)` et demande de publication Pages réussies.

### [x] Passe 5 — Collections : 50 objets et transactions Gold → Fame

- Créer **50 fiches distinctes** : Montres / Autos / Peintures / Antiquités / Joaillerie, 10 par catégorie, descriptions courtes, prix cash validés, bonus parmi les six.
- Actions métier d'achat unique en cash avec crédit Fame instantané et bonus permanent ; sans revente, sans XP, sans effet fiscale rétroactif.
- Contrôler Fame par catégorie, requêtes par onglet, possession/idempotence, compatibilité patrimoine Stats.
- Tests : prix cash, monnaie négative, achat répété, offre Fame sans Notoriété, avec Notoriété, total 20 200 de base et 50/50 possessions.
- Livrable : collection complète dans le moteur, prête pour l'interface.
- **Livraison du 14/11/2026 :** `src/prestige/collections-catalog.ts` crée les **50 fiches fictives uniques** (nom, description historique ou produit, visuel de catégorie, prix Gold, Fame de base, identifiant stable, statistique ciblée, bonus de +0,1 % à +5 %) en réutilisant exclusivement les emplacements/prix de `src/prestige/catalog.ts`. Cinq catégories contenant dix objets, lecture par ID et par catégorie, valeur comptable calculée à partir des prix réellement payés.
- **Transactions métier :** `src/prestige/collections.ts` fournit `buyCollectionItem(state,id)`, `getCollectionOffer`, `getCollectionOffersByCategory` et `getCollectionProgress` pour alimenter la future interface. Les achats sont **définitifs et uniques**, débitent le cash au centime et créditent la Fame en micro-unités **une seule fois**. `Notoriété` est calculée au moment de l'achat **avant d'acquérir le bonus de l'objet**, donc une pièce améliorant la Fame ne bonifie pas rétroactivement sa propre acquisition. Aucun XP, revenu, dividende, tick de marché, fiscalité ni revente fictifs.
- **Patrimoine et sauvegarde :** `src/economy/stats-overview.ts` ajoute `collectionCount` et `collectionBookValue` à la fortune nette. Un achat transfère de la liquidité vers un bien conservé à son **coût historique d'achat**, donc le patrimoine total ne double pas le cash et ne recalcule jamais la valeur sur le marché. `restorePrestigeState` et l'import v6 refusent les possessions sans Fame de base correspondante, les IDs inconnus et les doublons ; les sauvegardes v6 existantes et la migration v1–v5 sont préservées.
- **Équilibrage :** 50 acquisitions garantissent **20 200 Fame de base**, soit **80 % de l'offre sans bonus au niveau 100**. Comme certains objets améliorent eux-mêmes les **futurs** gains de Fame, le total réellement reçu peut dépasser 20 200 Fame selon l'ordre d'achat ; ce surplus n'est ni passif ni rétroactif. Les coûts Fame Shop (24 650) et la garantie de financement au niveau 100 ne changent pas.
- **Validation CI réelle :** GitHub Actions [run 43529609083](https://github.com/Nighttug58/CAPITAL_IDLE/actions/runs/43529609083) **success**, **194 tests métier + 26 UI = 220 tests réussis**, `vue-tsc --noEmit`, Vite et build des assets dans `main/(root)` exécutés. Les nouveaux tests `src/prestige/collections.test.ts` couvrent 50 fiches/achats, 5 catégories, chaque bonus, fonds manquants, cash négatif, refus de second achat, attribution Fame avec et sans Notoriété, export/import v6 et patrimoine inchangé. Un premier test supposait à tort que les objets ne bonifiaient pas la Fame d'autres achats ; l'assertion a été corrigée pour vérifier le minimum de 20 200 **et** les récompenses effectivement reçues. La page/modale UI restent réservées à la passe 6.

### [ ] Passe 6 — Interface Fame Shop & page Collection

- Accueil : bouton **Fame [solde] ✦ Shop** aligné **à droite du Gold** ; dégradé violet vertical, animation légère au survol/clic, icône étoile à quatre branches.
- Fame Shop : modale scrollable, **six lignes/cartes** (bonus actuel, niveau 0/20, coût prochain palier, achat, MAX), état de solde, lisibilité PC/mobile, accessibilité.
- Navigation : **Collection avant Stats**, cinq onglets, grille de pièces, état possédé, sélection et modale descriptive avec prix, Fame, bonus et bouton Acheter ; confirmation adaptée aux gros achats.
- Corriger les contraintes de hauteur/largeur responsives : éviter les modales **étroites/verticales illisibles**, respecter `overflow-y`, fermeture/Échap/retour navigateur, positionnement stable.
- Tests UI Vue et parcours : bouton, achat, insufficient funds, scroll, onglets, modale, responsive.
- Livrable : boucle de jeu Fame/Collection utilisable de bout en bout.

### [ ] Passe 7 — Prestige absolu, Stats et sauvegardes complètes

- Débloquer **automatiquement et gratuitement** Prestige absolu si et seulement si **120/120** paliers sont détenus ; formule exacte `1.01 ^ floor(fameAvailable / 100)`.
- Ajouter l'effet aux six bonus **du Shop seulement** ; montrer facteur actuel, tranches et verrouillage/déblocage, sans nouvelle source de Fame.
- Stats : Fame possédée / Fame totale obtenue / ventilation niveaux-collections, objets possédés, six bonus (shop + collection + Prestige), patrimoine si valeur comptable retenue.
- Contrôles save v6, export/import, RESET, même session puis relance, migration à partir v5 : pas de corruption, double Fame, gains rétroactifs ni disparition de Prestige.
- Tests numériques de Prestige à Fame 0/99/100/500/600/1 000/10 000 et cas extrêmes, achat complété, état sauvé/restauré.
- Livrable : Endgame fiable et observable dans l'UI.

### [ ] Passe 8 — Équilibrage global, non-régression et publication

- Simulations chiffrées **sans bonus Notoriété** : niveau 100 + 50 collections = 25 250 Fame ; 120 achats = 24 650 Fame ; reste **600**.
- Simulations de parcours avec Notoriété acheté tôt/tard, progression >100, Prestige dynamique, cash insuffisant/solde fiscal négatif, Trading bénéficiaire ou perdant, très longue absence.
- Revoir le rythme d'acquisition des 50 objets **en Gold** et la progression des niveaux dans le contexte des 20 entreprises, sans changer la répartition Fame verrouillée.
- Vérifier `npm test`, `npm run test:ui`, `npm run build`, interface PC/mobile, import/export JSON (v1–v6), reset, sauvegardes corrompues.
- Actualiser README, puis publier via le **pipeline existant** GitHub Pages `main / (root)` : build de production, synchronisation racine si requise ; jamais remplacer directement l'HTML compilé par le HTML source.
- Ne cocher cette passe qu'après les vérifications effectives et la disponibilité du site publié.

## 3. Définition de « terminé »

- [ ] Deux revenus Fame seulement : niveaux et collections, avec aucun double crédit.
- [ ] Niveau ≥100 sans rupture des achats/récompenses hérités du niveau 50.
- [ ] **50 collections uniques**, cinq catégories et bonus de +0,1 % à +5 %.
- [ ] **120 paliers** de +5 %, six boosts, +100 % chacun avant Prestige.
- [ ] **80 % de Fame de base issue des collections au niveau 100** ; achat de **toute la boutique sans boost**, reste 600 Fame.
- [ ] Prestige absolu gratuit après 120/120 ; facteur composé exact par 100 Fame possédées.
- [ ] Un moteur commun de bonus ; XP distincte des revenus, fiscalité et trading corrects.
- [ ] UI lisible et testée ; sauvegardes migrées, export/import/reset complets.
- [ ] Tests et build verts ; `main / (root)` publié.

**Après validation de cette roadmap :** le prochain `next` commence par la **Passe 1**.
