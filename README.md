# CAPITAL_IDLE

Clicker économique et simulateur de Trading **fictif**, gratuit, jouable dans le navigateur et adapté aux smartphones. Développé avec **Vue 3, TypeScript et Vite**.

**Jouer :** https://nighttug58.github.io/CAPITAL_IDLE/

## Moteur économique V8 — grands nombres et migration

Depuis la **passe 1 de la refonte**, la sauvegarde active utilise `capital-idle-save-v8` et un moteur exact en **BigInt**. Le cash, les dépenses, les investissements, le prix de revient, le staking, les revenus, l'XP, la Fame, les PP et les impôts sont calculés en unités entières, puis conservés dans le JSON sous forme de **chaînes décimales canoniques**. Les grands nombres apparaissent en K, M, B, T, Q, QQ, AA, AB, AC… sans perdre les valeurs comptables.

La première ouverture d'une sauvegarde locale **v1 à v7** effectue une migration contrôlée vers V8 : l'original n'est pas effacé et, pour v7, une copie `capital-idle-save-backup-v7` est conservée. Les imports manuels v4–v7 sont acceptés après validation stricte. Une sauvegarde corrompue bloque l'écriture et demande import ou réinitialisation explicite : **aucun reset silencieux**. L'export manuel utilise désormais les champs exacts V8. `src/capital.ts` reste un modèle v7 de compatibilité/affichage, non l'autorité économique active.

## Prestige V2 et pouvoirs News

Le Prestige demande le **niveau 150** et **10 milliards $** de patrimoine éligible (hors collections et principal du Capital de départ, après impôts). Ses **11 améliorations classiques** se débloquent entre les **Prestiges 1 et 3** ; leurs achats historiques et tarifs versionnés sont conservés. Les Points Prestige (PP) utilisent la formule exacte `floor(10 × (patrimoine éligible / 10 Md $)^0,35)` ; l'Héritage Transcendant et le Musée impérial ajoutent leurs pourcentages sur les **nouveaux PP seulement**, consignés dans les reçus V3. Le Prestige remet la **Fame disponible** et l'XP du cycle à zéro, pas les boosts achetés, les collections, les PP, l'Héritage ou les succès. Les taxes dues sont intégralement prélevées avant le calcul.

Dès le **Prestige 3**, les commandes Trading → News permettent de **générer une News** pour 5 % du patrimoine de référence ou **terminer une News active** pour 10 % après confirmation. Le prix inclut la valeur comptable des collections, est prélevé sur le cash disponible et ne crée ni XP/Fame ni PP. Le moteur maintient toujours une News directionnelle rouge ou verte lorsque la dernière disparaît.

## Accueil — le clicker

- Départ à **0 $**, **1 $ par clic**.
- **Niveaux joueur sans plafond à 100** : chaque dollar de gain éligible donne **1 XP de base**, avant les bonus. La courbe **XP V4** exige ×5 des seuils V3 aux niveaux 1–50, monte progressivement vers ×10 au niveau 100 et ×25 au niveau 200 et au-delà. La migration unique V3 → V4 conserve le niveau atteint, sa progression relative, les Fame et achats antérieurs, sans attribuer de nouveaux gains lors de l'import.
- **999 améliorations du clic** avec gains progressifs par tranches de **50 niveaux du clic** : +1 $/achat jusqu'au niveau 50, +2 $/achat des niveaux 51–100, +3 $/achat des niveaux 101–150, etc., jusqu'à +20 $/achat des niveaux 951–1 000. Le revenu va de **1 $/clic au départ** à **10 500 $/clic au niveau 1 000**, avant les bonus Fame et Collection. Le **premier achat coûte 375 $**. La hausse de prix commence à **+750 $** et **chaque hausse suivante augmente légèrement de 0,05 %** (avec arrondi au dollar). Cette croissance exponentielle progressive donne un dernier achat à **970 678 $** et un coût total de **444 951 055 $**, plutôt que les **748 875 $ / 374 250 375 $** de la grille purement linéaire. Le prix initial et le pas initial conservent leur majoration de 50 % par rapport à l'ancienne grille. Les clics 2–50 demandent les niveaux joueur 2–50, puis chaque niveau joueur débloque 20 achats de clic supplémentaires ; **niveau joueur 98** suffit donc à déverrouiller le palier clic 1 000.
- **Un seul solde** finance les améliorations du clicker, les transactions Trading et les entreprises. Il peut devenir négatif après le prélèvement automatique ou manuel de taxes, mais **aucun achat à crédit** n'est permis.
- Les niveaux bénéficient des clics, des dividendes encaissés, des revenus fixes des entreprises et des **profits nets réalisés** en Trading. Ni le capital récupéré lors d'une vente, ni les gains latents, ni les taxes payées ne donnent de l'expérience. Les dépenses et les impôts ne font pas redescendre le niveau.

## Prestige : taxes automatiquement soldées
- Les impôts en cours ne bloquent plus le Prestige. Le moteur rattrape les revenus, débite **l'intégralité de la dette fiscale** en une seule transaction, enregistre le paiement par source et calcule les PP à partir du **patrimoine net d'impôts**. Aucune taxe n'est effacée gratuitement ; si la transaction ou la sauvegarde échoue, ni le Prestige ni le paiement ne sont validés.
- Le calendrier fiscal de **72 h réelles conserve son ancrage** : aucun redémarrage du délai lors du Prestige. Le paiement manuel dans Stats reste possible.

## XP par niveau : croissance dégressive et migration
- Les seuils augmentent de **10 % jusqu'au niveau 50**, **5 % pour les niveaux 51–100**, **2 % pour les niveaux 101–200**, puis **1 % à partir de 201**. Les seuils des 50 premiers niveaux sont inchangés ; le taux de gain de base reste **1 XP par dollar éligible**, avant bonus Fame.
- Les sauvegardes V8 sur l'ancienne courbe XP V3 migrent **une seule fois** vers `xpCurveVersion: 4`, en maintenant le niveau et la fraction de progression, sans modifier la Fame gagnée ni les achats. Le témoin `xpRebaseV4` des montants ordinaires (ou la copie de secours des montants extrêmes) justifie la rebase et disparaît au Prestige. Les imports historiques v4–v7 restent pris en charge.

## Fame Shop, Ascension du Fame et Prestige Transcendant

- Le **Fame Shop** propose six bonus (clics, entreprises, dividendes, XP, Trading, Fame) de **20 niveaux** chacun. Les achats sont permanents et utilisent uniquement la Fame disponible. À **120/120**, le **Prestige absolu** se débloque gratuitement : chaque tranche entière de **100 Fame disponibles** augmente les **seuls bonus du Fame Shop** d'un facteur ×1,01, jusqu'au plafond **×(100 + nombre de Prestiges terminés)**. Exemples : zéro Prestige = ×100, 100 Prestiges = ×200. Fame disponible = 0 après le reset : facteur ×1. Les bonus des collections sont additionnés, jamais multipliés par le Prestige absolu.
- Ce facteur et le compteur de Prestiges sont **calculés en BigInt dans le moteur V8**, avec exponentiation bornée et représentation fixe, sans `Infinity` ni perte de PP/Fame. Au-delà de `Number.MAX_SAFE_INTEGER` Prestiges, les champs canoniques optionnels `prestigeCountExact` et `cycleExact` conservent les cycles exactement ; la projection numérique historique reste compatible.
- La boutique **Prestige Transcendant**, accessible au **Prestige 3**, contient **7 branches principales et 3 branches News**, chacune de **1 000 niveaux**. Cinq branches économiques renforcent les revenus/XP/Fame futurs, l'**Héritage** bonifie les PP futurs et le **Capital de départ** crédite une dotation exacte après chaque Prestige (jusqu'à 1 quadrillion de dollars), sans crédit d'XP/Fame/taxe/PP et avec exclusion de son principal de l'assiette des PP suivants.
- Lorsque les **7 branches principales** sont à **1 000/1 000**, le **Prestige Transcendant ultime** se débloque sans achat supplémentaire : le solde **PP non dépensés** renforce uniquement les cinq branches économiques par le facteur exact `1 + PP / [2 × (PP + 1 000 000 000)]`, strictement inférieur à ×1,5. Ce facteur est recalculé après toute dépense ou gain PP ; **l'Héritage, le capital de départ et les News ne sont jamais multipliés**. Les PP ne sont pas consommés par ce bonus.

## Achievements — récompenses de progression
- Bouton ruban sur Accueil, ouvrant une page de **478 cadeaux en cash** répartis entre niveaux, clics, revenus, entreprises, collections, Prestige, bénéfices réalisés sur actions, cryptos et memecoins, et dividendes. Les paliers atteints dans les anciennes sauvegardes sont reconnus au chargement : le joueur choisit quand les réclamer.
- Chaque cadeau est **unique et persisté** dans `achievements.claimedIds`, y compris lors des Prestiges ; les cadeaux n'ajoutent ni XP ni Fame et ne créent pas de taxe. Reset intégral = remise à zéro des succès. Les anciens fichiers v4–v7 restent importables, les v7 antérieures sans compteur sont migrées sans cadeau automatique.

## Trading — 45 instruments

| Type | Nombre | Frais à l'achat | Frais à la vente | Dividendes |
| --- | ---: | ---: | ---: | --- |
| Actions d'entreprises fictives/parodiques | 20 | 0,5 % | 0,5 % | Oui |
| Cryptomonnaies | 15 | 1 % | 1 % | Non |
| Memecoins | 10 | 1,5 % | 1,5 % | Non |

Les cours initiaux sont des **repères de gameplay figés au 13 novembre 2026**, pas des cotations actuelles. Tous les cours, variations, News et dividendes sont simulés **sur l'appareil du joueur**, et n'ont aucun lien avec les marchés réels.

- Les **45 actifs évoluent toutes les 5 secondes**, chacun avec son momentum, ses régimes, des chocs aléatoires et des bornes de prix.
- Toutes les positions Trading sont **au comptant**, sans levier ni vente à découvert. La fiscalité peut entraîner un **solde global négatif** : cela n'autorise aucun achat de titres. **L'offre de chaque actif est informative et ne plafonne pas les achats** ; les cryptos autorisent des fractions.
- Ouvrir un actif donne accès à son cours, au graphique, aux bornes, aux quantités détenues et au formulaire **Acheter / Vendre**.
- **Aucun plafond de liquidité ou d'offre par ordre ni régénération** : les achats dépendent du cash disponible, des frais, de la précision et du prix du cours ; les ventes dépendent des unités réellement détenues et non verrouillées en staking. Les reliquats sous le centime peuvent être vendus pour **0,00 $**, sans créer de monnaie ; les achats immédiatement invendables restent refusés.
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
- **Présence permanente d'au moins une News haussière (verte) ou baissière (rouge)** : si aucune annonce directionnelle n'est active, le moteur en lance une immédiatement au tick suivant (y compris à l'ouverture et après expiration). Ce filet de sécurité ne remet pas à zéro les 5–10 minutes d'apparition normale ni la prévision Prestige ; les nouvelles annonces se cumulent avec celles déjà actives.

- Un événement apparaît **toutes les 5 à 10 minutes** (tirage indépendant, hors bonus de fréquence Prestige).
- Son influence dure **5 à 30 minutes hors bonus Prestige**, avec des effets graduels sur les cours et éventuellement les rendements. Plusieurs annonces peuvent se chevaucher ; l'impact cumulé est limité.
- **279 News pouvant apparaître** (sur 300 fiches historiques) : les 21 annonces baissières touchant tout le marché sont exclues du tirage et n'influencent plus les cours. Les News globales haussières, ainsi que les News baissières limitées à une entreprise, un secteur ou une classe d'actifs, restent possibles. Les anciennes fiches sont conservées pour compatibilité avec les sauvegardes.
- L'onglet News affiche les **10 dernières annonces** ; toute annonce plus ancienne encore active reste également visible.
- Les modales News affichent l'intensité, les poids cours/dividendes, le temps, les bonus Prestige, la pression individuelle et le cumul réel par actif, actualisés pendant l'événement. Les indices ne sont pas des pourcentages de variation garantis.
- **Les effets de toutes les News actives se cumulent par actif** : annonces de même sens renforcées, annonces opposées partiellement compensées, avec plafonnement du cumul. Les fiches News indiquent le contexte, un scénario possible, le statut et les actifs ciblés. Les rumeurs peuvent être confirmées ou démenties, mais elles ne garantissent pas un mouvement de cours.

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

- Sauvegarde automatique **V8** en `localStorage` : **v1 à v7** locales sont migrées selon leur format, sans effacement silencieux des originaux ni des preuves historiques, et l'import accepte les exports v4 à v8. Le JSON V8 conserve le cash, les titres, les taxes, l'XP/Fame, les collections, les succès et les **reçus PP versionnés** en chaînes entières canoniques. Aucun compte ni synchronisation cloud.
- Tout en bas de **Stats** : **Exporter** télécharge un JSON V8 complet et versionné ; **Importer** valide les formats **v4/v5/v6/v7/v8** (taille maximale **16 Mo**, champs exacts, horloges, portefeuille, reçus et cohérence des ledgers), montre un aperçu et exige une **confirmation avant remplacement** ; **Réinitialiser** nécessite la saisie exacte de `RESET`.
- Import et reset remplacent la sauvegarde **V8** après arrêt de l'ancien runtime ; aucun fichier invalide ou écriture non confirmée ne remplace volontairement une partie valide. Lorsqu'une V8 existe, elle prime sur les anciennes clés : une V8 corrompue bloque le chargement et ne ressuscite jamais une V7 historique.
- La restauration conserve les dates de simulation ; le revenu d'entreprises et les taxes sont repris sur toute la durée écoulée. Le **Trading/News/dividendes** conserve volontairement son rejeu **par tranches bornées** : une très longue absence peut demander plusieurs cycles pour rattraper ce sous-système, sans limiter les revenus fixes des entreprises.
- La sauvegarde et les historiques peuvent utiliser plusieurs mégaoctets. Si le stockage local est bloqué/saturé, la session peut rester jouable, mais la progression n'est pas garantie après fermeture. **Exporter régulièrement** une copie JSON sécurise la partie. Les JSON sont modifiables par l'utilisateur : la validation vérifie la structure, ce n'est pas un système anti-triche ni une preuve cryptographique.

## Interface

Navigation **Accueil / Trading / Entreprises / Collection / Succès / Stats** (Stats à droite). Pages **Fame Shop**, **Prestige** et **Prestige Transcendant** accessibles depuis Accueil, sans multiplier les onglets. Dans Trading : **Portfolio / Actions / Crypto / News** et Staking lorsqu'il est débloqué. Interface sombre adaptée aux petits écrans et au paysage ; navigation clavier, Échap/retour navigateur pour les modales, bouton plein écran si le navigateur le permet.

## Rééquilibrage des niveaux et du clic — 14/11/2026

Les revenus donnent **1 XP par dollar éligible** (plus les bonus XP existants), mais le coût XP des niveaux joueur est multiplié par **4**. Les sauvegardes **v6 sans marqueur de courbe XP** sont converties une seule fois : l'XP historique est normalisée à la nouvelle échelle, sans modifier le Gold, les objets, la Fame ou les niveaux déjà atteints. Les anciennes sauvegardes v1–v5 suivent la même règle. Les fichiers v6 actuels portent `prestige.xpCurveVersion: 2` ; ils ne sont pas reconvertis au rechargement.

**Les revenus par clic augmentent eux aussi en cours de progression.** Chaque amélioration reste permanente, et son bonus est déterminé par le niveau de clic atteint : niveaux 2–50 **+1 $/clic**, 51–100 **+2**, 101–150 **+3**, etc. Repères : niveau 50 = **50 $/clic**, niveau 100 = **150 $/clic**, niveau 150 = **300 $/clic**, niveau 500 = **2 750 $/clic**, niveau 1 000 = **10 500 $/clic**. Les 999 achats existants sont reconnus sans modification de leur compteur, de leurs coûts payés ni des sauvegardes.

Les améliorations du clic atteignent **1 000 niveaux**, avec une **exponentielle volontairement légère sur les écarts de prix** : `prix(1) = 375`, puis `prix(n) = prix(n−1) + arrondi[750 × 1,0005^(n−2)]` pour chaque achat `n = 2..999`. Le taux de **+0,05 % par niveau** concerne uniquement l'**augmentation entre deux prix**, et **pas** le coût total multiplié par 1,5. Exemples : clic à 3 $ → 1 125 $, clic à 101 $ → 76 475 $, clic à 501 $ → 425 336 $, clic à 1 000 $ → 970 678 $. **Coût cumulé de tous les paliers : 444 951 055 $.** Les bonus Fame Shop/Collection, l'XP à 1 par dollar éligible et les seuils de niveau joueur ×4 ne changent pas.

## Archive d'équilibrage Fame/Collection V1 — scénario historique 50 pièces

| Élément | Valeur de référence |
|---|---:|
| Fame des niveaux 1–100, sans bonus (**ancien scénario V1**) | 5 050 |
| Fame de base des 50 collections | 20 200 |
| Budget Fame théorique au niveau 100 | 25 250 |
| Coût des six améliorations, 120 paliers | 24 650 |
| Fame restant dans ce scénario sans Notoriété | **600** |
| Coût total en Gold des 50 collections | **3 012 250 000 $** |
| XP nécessaires pour atteindre le niveau 100 | **17 537 564 XP** |

**Attention : les valeurs de ce tableau sont historiques (catalogue initial de 50 pièces et anciennes courbes XP), et ne décrivent pas les 100 collections V3 ni la courbe XP V4 active. Elles sont conservées uniquement pour comparer l'évolution de l'équilibrage.**

**Limite d'équilibrage connue pour l'ancien scénario :** la proportion de **80 % de Fame issue des collections** est vraie pour le **scénario de référence au niveau 100, sans bonus** ; elle n'est **pas garantie dans le parcours économique réel**. Si tous les Gold nécessaires aux 50 collections sont gagnés comme revenu éligible à l'XP, le joueur atteint déjà environ le **niveau 153** (au minimum), lequel distribue **11 781 Fame** de base : les 20 200 Fame de base des collections représentent alors **environ 63,2 %** de ce total. Les bonus Notoriété, l'ordre des achats et la progression ultérieure modifient encore ce ratio. La passe finale conserve délibérément les coûts et récompenses déjà validés ; rapprocher la proportion réelle de 75–80 % demanderait un **nouvel arbitrage de conception** (prix Gold, XP ou Fame après le niveau 100).

**Ancien parcours simulé, niveau 154 et 50 objets d'origine dans l'ordre du catalogue :** acheter les 20 niveaux de Notoriété **après** les collections rapporte environ **22 725,14 Fame de collection** (soit **65,57 %** de la Fame gagnée), contre **42 925,14 Fame de collection** (**78,24 %**) si les 20 niveaux sont achetés **avant** les collections. Après achat des 120 paliers, cela laisse respectivement environ **10 010,14 Fame** (Prestige ≈ ×2,70) et **30 210,14 Fame** (Prestige ≈ ×20,19). La forte différence entre stratégies est une propriété volontaire du bonus Notoriété, et un **risque d'emballement économique de fin de jeu** à surveiller lors des futures évolutions.

L'achat de Notoriété **avant** les collections augmente les Fame attribuées aux **futurs** objets, alors qu'un achat tardif ne les bonifie jamais rétroactivement. Un achat de collection échange de la liquidité contre un bien comptabilisé à son coût d'acquisition, sans revenu fictif ni revente. Prestige absolu ne s'active qu'à **120/120 paliers**, avec un facteur exponentiel sur **les seuls bonus du Shop** et des protections de calcul pour éviter des gains monétaires non représentables.

**Vérifications historiques de clôture (avant V8 V3) :** `src/prestige/final-balance.test.ts` simule les 50 achats en argent réel du jeu, deux ordres de Notoriété, le Shop complet, la fiscalité, les achats interdits en solde négatif, une année d'absence et l'export/import v6. Les sauvegardes **v1–v5 migrent en localStorage**, et les **fichiers JSON v4/v5/v6** peuvent être importés avec validation et confirmation. La réinitialisation remet les boosts, Fame et collections à zéro. Les tests d'interface exécutés sous JSDOM vérifient les interactions et la structure responsive ; ils ne remplacent pas une inspection manuelle sur plusieurs appareils.

**Historique des validations :** la suite de base V7/V8 est conservée, tandis que les passes Prestige Transcendant & Collections V3 ont étendu les vérifications automatiques (420 tests métier et 107 tests Vue à la clôture de la passe 7). Les chiffres de clôture de la passe 8 et les tests Chromium sont consignés dans la roadmap et le rapport de stabilisation.

## Développement

Prérequis : **Node.js 22+ et npm**.

```bash
npm install
npm run dev
npm test
npm run test:ui
npm run build
npm run verify:release
npm run build:root
```

`npm test` exécute les vérifications de calculs financiers, les simulations temporelles, les migrations et les **tests de composants Vue**. `npm run build` lance le contrôle TypeScript puis génère `dist/` via Vite.

- `src/game.ts` : clicker, seuils de niveau extensibles et améliorations du clic.
- `src/prestige/*`, `src/ascension/transcendent-v1.ts`, `src/exact-*.ts` : l'autorité V8 calcule les six bonus Fame, les **100 objets avec raretés déterministes**, les **cinq catégories 20/20**, le **Musée impérial 100/100**, le plafond Fame progressif, les **sept branches Transcendant + trois News**, les PP futurs et la réserve PP ultime. Les objets sont acquis une seule fois, non revendables et valorisés à leur coût comptable ; leur Fame déjà gagnée ne change jamais lors des migrations. Les bonus de revenus restent additifs sur leur assiette d'origine. Les valeurs monétaires sont exactes `BigInt` (avec carry sous-centime) ; les vues Vue sont une projection bornée. Le Fame Shop est une page dédiée, la page Collections présente les niveaux de rareté et le Musée, et Stats restitue les totaux et l'import/export. La passe finale teste l'intégrité du parcours et des données sans nouvelle économie.
- `src/exact-state-v8.ts` / `src/exact-runtime-v8.ts` / `src/exact-persistence-v8.ts` / `src/exact-save-validation.ts` : **source de vérité V8**, transactions, migration, validation stricte, export/import, historique PP, et protection contre les écritures non confirmées. `src/capital.ts` et `src/persistence.ts` conservent l'ancien modèle de compatibilité.
- `src/trading/catalog.ts` : 45 actifs, bornes et quantités.
- `src/trading/market.ts`, `news.ts`, `yield.ts` : simulateur de cours, annonces et rendements.
- `src/trading/dividends.ts`, `clock.ts`, `runtime.ts` : revenus et rattrapage hors ligne.
- `src/exact-trading.ts`, `src/exact-market-v8.ts`, `src/exact-staking-v8.ts` : achat/vente au comptant en montants exacts, frais et coûts de revient, News/Dividendes et staking. Les anciens modules `src/trading/` restent utilisés pour les cotations, modèles et projections de compatibilité.
- `src/exact-economy.ts` / `src/economy/catalog.ts`, `enterprises.ts`, `clock.ts`, `fiscal.ts` : entreprises, revenus fixes, MAX, rattrapage hors ligne et fiscalité.
- `src/economy/stats-ledger.ts`, `stats-overview.ts` : statistiques par source et bilan patrimonial.
- `src/components/` et `scripts/pass8-browser-check.mjs` : composants Vue/JSDOM et scénario Chromium réel (résolutions mobiles, paysage, desktop, focus, modales, navigation et animation autonome).
- `src/trading/news-library/` : récits des événements fictifs.

Voir également [la roadmap Trading](ROADMAP_TRADING.md), [la roadmap Entreprises/Stats/Fiscalité](ROADMAP_ENTREPRISES_STATS_FISCALITE.md), [l'équilibrage Entreprises](ENTREPRISES_ECONOMIE.md), [les règles du moteur News](TRADING_NEWS.md) et [l'interface Trading](TRADING_INTERFACE.md).


## Prestige Transcendant — rééquilibrage 100 niveaux (21.11.2026)

Les **10 branches** comportent désormais **100 niveaux** au lieu de 1 000, sans changement de leur effet maximal : Empire +300 %, les branches économiques concernées +200 %, Héritage +100 % de PP futurs et Capital de départ jusqu'à 1 Qa $. Les trois améliorations News conservent également leur effet maximal. Les nouveaux rangs coûtent de **5 à 202 PP** (8 693 PP pour une branche complète, 86 930 PP pour les dix branches).

Les sauvegardes V8 préexistantes utilisent une migration idempotente du registre Transcendant V1 vers V2 : les anciens rangs sont convertis par arrondi supérieur de niveau/10, les PP payés en trop sont remboursés une seule fois au portefeuille disponible, et les PP gagnés à vie restent inchangés. Les reçus historiques V3/V4, les dotations de capital déjà octroyées et les bonus sont conservés. Une sauvegarde brute pré-migration est archivée sous la clé dédiée `capital-idle-save-backup-v8-pre-transcendent-100-ranks`. Les nouveaux reçus Prestige portent `formulaVersion:5`.

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
