# ROADMAP — CAPITAL_IDLE / Entreprises, Fiscalité, Statistiques et Sauvegardes

**Statut : terminée — 8/8 passes livrées**  
**Branche cible : `main`**  
**Créée le : 13 novembre 2026**  
**Périmètre :** troisième source de revenus « Entreprises », taxes différées sur les bénéfices, page Stats et outils manuels de sauvegarde.  
**Roadmap Trading V1 :** [ROADMAP_TRADING.md](ROADMAP_TRADING.md) — terminée, à préserver.

> **Règle de travail pour les prochains « next » :** traiter la **première passe non cochée**, implémenter, vérifier `npm test`, `npm run test:ui` lorsque pertinent, et `npm run build` ; commiter la réalisation **et** cocher la passe dans ce fichier sur `main`. Ne jamais déclarer une passe terminée sans résultat vérifié. Scinder en sous-passes documentées si nécessaire. Ne pas refaire le Trading, le simulateur News ou le clicker hors modifications indispensables.

## 0. État technique constaté avant cette roadmap

- Dépôt `Nighttug58/CAPITAL_IDLE`, branche `main` : Vue 3 + TypeScript + Vite, hébergement GitHub Pages depuis `main / (root)`.
- Navigation **Accueil / Trading**, Trading conserve **Portfolio / Actions / Crypto / News**. La nouvelle navigation principale visée est **Accueil / Trading / Entreprises / Stats**, avec **Stats tout à droite**. Les onglets Trading existants restent en place.
- État financier central `CapitalState` (`src/capital.ts`) : `game.balance` est **l'unique solde** ; `game.lifetimeEarned` est l'autorité pour l'expérience/niveau. Ne créer aucun deuxième portefeuille.
- Sauvegarde actuelle **v4** via `src/persistence.ts`, migration antérieure v1/v2/v3 ; restauration stricte dans `src/game.ts` qui **refuse actuellement les soldes négatifs**.
- Transactions et prix de revient moyen dans `src/trading/trades.ts` ; frais de 0,5 % actions, 1 % crypto, 1,5 % memecoins. Les profits réalisés sont nets des frais, sans compter le capital restitué.
- Horloge et rattrapage Trading dans `src/trading/clock.ts` / `runtime.ts` ; dividendes par seconde dans `dividends.ts`. Attention : le rattrapage du marché existant est volontairement effectué en lots bornés ; **ne pas lancer une seconde boucle par seconde sur des années d'absence pour les entreprises**.
- Pas d'`AGENTS.md` à la racine au moment de la préparation de cette roadmap.
- Le pipeline `npm run build:root` produit les ressources GitHub Pages ; ne pas remplacer l'`index.html` compilé racine par le HTML source.

## 1. Contrat fonctionnel validé

### A. Entreprises — troisième voie de revenus

1. **20 types d'entreprises uniques** dans une nouvelle page accessible depuis la navigation principale. Une seule instance achetable par type : **aucune franchise**.
2. **Aucune revente** d'entreprise, d'amélioration ou de niveau : achats et améliorations définitifs.
3. Une entreprise acquise commence au **niveau 1** et atteint au plus le **niveau 20** ; exactement **19 améliorations** payantes après l'achat initial.
4. Les revenus sont **fixes par seconde** pour une entreprise à niveau donné ; aucune volatilité, aucun effet des News boursières, aucune gestion de stocks, employés, charges d'exploitation ou événements d'entreprise.
5. **Déblocage progressif** des types d'entreprises selon le **niveau joueur**. Les entreprises verrouillées restent visibles (avec condition de déblocage) mais non achetables.
6. Amélioration ordinaire à chaque niveau et **bonus spécial aux paliers 5, 10, 15 et 20**. Les bonus sont permanents, déterministes et pris en compte dans le revenu fixe affiché.
7. Revenus crédités automatiquement dans `game.balance` et pris en compte dans la progression `game.lifetimeEarned`, comme les revenus réellement encaissés existants ; aucun achat ni coût d'amélioration n'ajoute d'XP.
8. **Revenus hors ligne sans aucune limite de durée** : 1 jour, 15 jours, plusieurs mois ou davantage. Aucun plafond en heures et aucun arrêt de production après 4 h/8 h/12 h. Les entreprises ne s'améliorent pas toutes seules pendant l'absence.
9. Les revenus sont **bruts au moment du crédit** ; la taxe correspondante s'accumule séparément (voir fiscalité).

**Catalogue envisagé à équilibrer (20 entrées, sans franchise) :**

| Palier | Entreprises |
| --- | --- |
| 1 — Petits commerces | Kiosque, Café, Laverie, Boulangerie |
| 2 — Commerces locaux | Supérette, Restaurant, Station de lavage, Garage |
| 3 — Services | Salle de sport, Cinéma, Hôtel, Concession automobile |
| 4 — Industrie | Entrepôt logistique, Usine, Centre commercial, Laboratoire |
| 5 — Grandes entreprises | Data center, Compagnie aérienne, Entreprise énergétique, Groupe technologique |

Pour chaque entreprise, documenter : `id` stable, nom, catégorie, niveau joueur requis, prix d'achat, revenu brut de base/s, coûts des niveaux 2–20, coefficients de progression et bonus des niveaux 5/10/15/20. **Équilibrer face au clicker, aux actions, aux cryptos et aux dividendes** : pas de revenus extravagants qui rendraient le Trading inutile. Les prix, revenus et multiplicateurs précis sont à établir dans la passe 2 ; ne pas inventer de chiffres définitifs sans calibration.

### B. Fiscalité — dette accumulée et échéances réelles

1. Taxer **les bénéfices d'exploitation des entreprises** (dans cette V1 simplifiée, revenu fixe sans charges = bénéfice imposable) et **les plus-values réalisées** lors des ventes bénéficiaires d'actions, cryptos **et memecoins**.
2. Pour une vente : **base imposable = max(0, produit de vente après frais de vente − prix de revient attribuable aux unités vendues, frais d'achat inclus)**. Les frais sont déjà pris en compte dans le moteur ; ne pas les compter deux fois. Une vente à perte, le capital restitué et un gain latent ne génèrent **aucune** taxe. Taxer la plus-value positive **par opération** ; pas de compensation fiscale des pertes dans cette V1, sauf décision ultérieure.
3. **Ne pas taxer** les clics ni les dividendes dans cette version : l'accord explicite porte sur les entreprises et les plus-values de vente. La règle reste extensible sans être élargie implicitement.
4. La taxe est **calculée et ajoutée à `taxesDue`**, **jamais retenue immédiatement** sur le revenu d'entreprise ou le produit de la vente. Afficher séparément **brut, plus-value imposable et taxe différée** lorsque pertinent.
5. **Échéance automatique toutes les 72 heures réelles**, de date à date depuis le démarrage de la période ou le dernier paiement anticipé. Au moment de l'échéance : débiter le montant intégral accumulé du solde commun, remettre `taxesDue` à zéro, totaliser `taxesPaid` et démarrer la période suivante.
6. **Dette fiscale autorisée** : le prélèvement automatique doit s'exécuter même si `game.balance` devient négatif. L'argent gagné ensuite réduit mécaniquement ce déficit ; **aucun intérêt, pénalité ou emprunt distinct** n'est ajouté.
7. Le joueur peut **payer l'intégralité des taxes déjà accumulées en avance** depuis Stats, même si le paiement met le solde négatif. Le paiement vide la dette fiscale et **réinitialise immédiatement l'horloge à 72 heures**. Si aucune taxe n'est due, ne pas autoriser une remise à zéro gratuite du timer.
8. **Un solde négatif ne permet aucun achat à crédit** : améliorer les clics, acheter actions/cryptos ou entreprises exige toujours le montant disponible nécessaire ; les ventes et gains restent autorisés.
9. Pendant l'absence, calculer chronologiquement les revenus d'entreprises et les prélèvements de **chaque échéance de 72 h franchie**, y compris si plusieurs échéances se produisent avant la reprise. Aucune période ignorée, aucune taxe doublement prélevée, aucun timer réinitialisé au simple rechargement.
10. Afficher dans Stats : taxes dues, détail cumulé par source (entreprises / actions / crypto et memecoins), taxes payées cumulées, taux en vigueur, délai exact avant la prochaine échéance et **Payer maintenant**.
11. **Taux fiscal : non confirmé.** Les **15 % précédemment évoqués ne sont qu'une proposition illustrative**, pas une règle validée ; mettre le taux dans une configuration métier unique à fixer avant d'activer la taxation en production. Ne pas disperser la constante dans l'UI.

**Chronologie d'exemple :** période lancée à T0 ; des entreprises produisent, un trader vend avec plus-value ; la dette augmente sans sortie immédiate de caisse. À T0+72 h, prélèvement intégral, solde potentiellement négatif, dette remise à zéro ; prochain paiement à T0+144 h. Si le joueur paie à T0+50 h, le prochain prélèvement est à T0+122 h.

### C. Statistiques — page « Stats » tout à droite

- Vue d'ensemble : niveau, progression XP, durée de jeu (définition explicite), solde disponible, patrimoine net, gains cumulés.
- **Ventilation par source** : clics ; trading actions (profits/pertes réalisés) ; crypto et memecoins (profits/pertes réalisés) ; dividendes ; entreprises (revenus cumulés). Ne pas mélanger plus-values latentes et réalisées, revenus bruts et dépenses, ni recompter le capital récupéré.
- Entreprises : nombre acquises / 20, niveaux possédés, revenus fixes totaux par seconde, revenus encaissés cumulés.
- Patrimoine : liquidités (éventuellement négatives) + valeur de marché des actifs + valeur comptable documentée des entreprises − **taxes encore dues**. Les taxes déjà prélevées sont déjà sorties du solde : **ne pas les soustraire une seconde fois**. La valeur comptable des entreprises ne signifie pas qu'elles sont revendables.
- Bloc **Fiscalité** : compteur 72 h, dette accumulée, détails par source, historique agrégé des taxes payées, paiement immédiat.
- **Tout en bas de Stats : Gestion de la sauvegarde** (Exporter / Importer / Réinitialiser). Interface adaptée aux petits écrans, sans casser les modales ni les safe areas.
- Pas de graphique lourd ni d'historique infini : compteurs persistés et éventuelle répartition synthétique suffisent. Ne pas ajouter des fonctionnalités « nice to have » non validées.

### D. Export, import et reset manuel

1. Conserver l'**autosauvegarde locale** existante ; ajouter en bas de Stats :
   - **Exporter** : télécharger un `.json` complet et versionné (nom `CAPITAL_IDLE_save_YYYY-MM-DD.json`) sans modifier l'état en cours ;
   - **Importer** : choisir le fichier, vérifier format/taille raisonnable, version, schéma, valeurs monétaires, niveaux et horodatages ; **demander confirmation avant de remplacer** la partie active ;
   - **Réinitialiser** : confirmation irréversible avec saisie exacte de **`RESET`** ; effacer la progression et redémarrer une partie initiale.
2. L'export doit contenir **tout l'état nécessaire** pour une reprise fidèle : clicker, cash, XP, trading (positions, quotes, News et horloges), entreprises/niveaux, statistiques, fiscalité (dette, prochaine échéance, cumuls) et dernières dates de simulation. Ne pas exporter seulement l'écran Stats.
3. Export/import **ne neutralisent pas** le temps écoulé : à la restauration, les revenus d'entreprises hors ligne et échéances fiscales sont rattrapés selon les horodatages du fichier. Interdire les crédits en double dus à un redémarrage, un changement d'onglet ou un double import sans réinitialisation logique.
4. Un fichier incompatible ou corrompu doit être **rejeté sans écraser** la sauvegarde actuelle. Un import valide remplace l'état **en une seule opération logique** : arrêter l'ancien runtime, substituer l'état, persister, remonter les runtimes/compteurs et reprendre proprement.
5. Reset : ne pas seulement vider `v5`. Les vieilles clés `v1`–`v4` sont encore présentes dans certains navigateurs : les **supprimer explicitement** ou écrire un marqueur de reset empêchant toute migration/résurrection d'anciennes parties. Le reset repart à 0 $, 1 $/clic, zéro actif/entreprise et **nouvelle période fiscale de 72 h**.
6. Les exports et la sauvegarde locale ne sont pas sécurisés contre la modification volontaire par le joueur : **validation d'intégrité structurelle**, pas de fausse promesse d'antitriche avec une application 100 % locale.

## 2. Contraintes et invariants transversaux

- **Une seule autorité** de solde : `game.balance`; pas de « portefeuille entreprises » ou « portefeuille taxes » indépendant.
- Les revenus d'entreprises, plus-values et taxes sont calculés par **fonctions métier pures** et entiers de centimes / arrondis documentés ; composants Vue = affichage et commandes.
- La **dette fiscale n'est pas une dépense de progression** : ne pas réduire rétroactivement `lifetimeEarned` et ne jamais faire reculer un niveau lors du paiement. Empêcher que les transferts de capital soient comptés comme gains.
- La migration vers une **nouvelle version de sauvegarde (v5 envisagée)** doit préserver les anciennes parties v4 sans les taxer rétroactivement : initialiser les entreprises vides, la dette à 0 et la première échéance à **date de migration + 72 h**. Les statistiques anciennes impossibles à reconstituer ne doivent pas être inventées : utiliser un agrégat « historique non ventilé » si nécessaire.
- La restauration doit accepter **un solde négatif valide provenant de la fiscalité**, tout en conservant les protections contre `NaN`, `Infinity`, dépassements de capacité et états manifestement incohérents. Ne pas supprimer en bloc les validations historiques du clicker.
- Distinction stricte des horloges : simulation Trading/News/dividendes et accrual fixe entreprises/fiscalité ; éviter listeners, timers, secondes simulées ou écritures `localStorage` dupliqués.
- Le **hors ligne illimité** porte sur la **durée rémunérée** (aucun plafond arbitraire) ; l'algorithme doit être performant même après des mois/années : calcul agrégé pour les entreprises et traitement exact des échéances 72 h, plutôt qu'une boucle seconde par seconde ajoutée au replay Trading. Gérer les bornes numériques sans perte silencieuse.
- Le jeu est 100 % local : garde-fous sur horloges reculées, fichiers importés invalides, dates futures ; pas de serveur, pas de compte, pas de promesse de sécurité contre une horloge volontairement modifiée.
- Design sombre/or, mobile-first, `100dvh`, navigation fixe, zones scrollables locales, clavier/accessibilité et fermeture des confirmations. Préserver le Trading, ses modales et les animations du clicker.
- **Aucun déploiement manuel spéculatif** : le build de production doit suivre la méthode actuelle GitHub Pages `main / (root)` documentée dans README, sans remplacer les fichiers de source par les artefacts compilés.

## 3. Plan d'exécution — 8 passes, dans l'ordre

### Passe 1 — Modèle unifié, migration et contrats financiers

- [x] Introduire dans `CapitalState` les modèles typés `enterprises`, `fiscal` et `stats` ; désigner les propriétaires de chaque compteur.
- [x] Préparer la **migration v4 → v5** avec conservation intégrale des parties et absence de taxation rétroactive ; maintenir les migrations anciennes par la chaîne existante.
- [x] Modifier de manière ciblée la validation/arithmétique du cash pour permettre un **solde négatif issu d'un prélèvement fiscal**, jamais un achat à découvert.
- [x] Définir le référentiel des catégories statistiques, la convention d'arrondi en centimes et la configuration du taux fiscal (décision encore ouverte).
- [x] Tests migration v1–v4, nouvelle partie, invalides, balance négatif valide, interdiction d'achat en négatif.
- **Livrable :** nouveaux états persistants et contrats métier sans régression Trading.

**Validée le 13/11/2026** — implémentation [d829971](https://github.com/Nighttug58/CAPITAL_IDLE/commit/d8299718d4889b5f34f17abcbbf3a6c80340a487) via [PR #1](https://github.com/Nighttug58/CAPITAL_IDLE/pull/1). Sauvegarde v5 (`src/capital.ts`, `src/persistence.ts`) ; nouveaux contrats `src/economy/state.ts` ; restauration de cash négatif **uniquement en v5** ; compteurs initiaux sans taxation rétroactive ; conservation du marché existant. Les gains des versions antérieures sont rangés dans **unclassified** faute de ventilation fiable. **GitHub Actions [#43490288670](https://github.com/Nighttug58/CAPITAL_IDLE/actions/runs/43490288670)** : étapes **Test**, **Build static site**, publication des ressources et déclenchement Pages **réussis**. Taux d'impôt toujours **non défini** (`FISCAL_TAX_RATE = null`), pas de taxe active.

### Passe 2 — Catalogue et équilibrage des 20 entreprises

- [x] Définir exactement 20 entreprises avec identifiants stables et niveau joueur requis.
- [x] Fixer **prix initial**, revenu/s au niveau 1, **19 coûts d'amélioration**, courbe de revenu et **bonus explicites aux niveaux 5, 10, 15, 20**.
- [x] Comparer les délais de retour sur investissement et la progression globale au clicker, aux dividendes et au trading ; corriger les courbes déséquilibrées.
- [x] Fonctions pures de consultation (`unlock`, `price`, `incomeAtLevel`), contrôles d'unicité et niveau 1–20.
- [x] Tests catalogue, bonus de palier, monotonie des coûts/revenus, conditions de déblocage, plafonds.
- **Livrable :** catalogue déterministe exploitable par le jeu, chiffres documentés.

**Validée le 13/11/2026** — [implémentation f667a44](https://github.com/Nighttug58/CAPITAL_IDLE/commit/f667a446b4b93943b4755783dd6b5adaea94ab13), [PR #2](https://github.com/Nighttug58/CAPITAL_IDLE/pull/2) ; [CI #43494996488](https://github.com/Nighttug58/CAPITAL_IDLE/actions/runs/43494996488) : **tests, compilation et publication du build réussis**. `src/economy/catalog.ts` : 20 entreprises immuables, déblocage niv. 3–50, 19 coûts d'amélioration, revenus fixes précis au microdollar et bonus 5/10/15/20. `src/economy/catalog.test.ts` ajouté à `npm test` : unicité, 20 niveaux, paliers, sûreté des entiers, rentabilité et invariants. [Équilibrage documenté](ENTREPRISES_ECONOMIE.md) : achats de 150 $ à 300 M$, retour initial brut d'environ 8 à 64 h ; **ni achats ni versements activés avant la passe 3**. Aucun changement du moteur Trading.

### Passe 3 — Achat, amélioration, revenus et page Entreprises

- [x] Actions métier `buyEnterprise` / `upgradeEnterprise` : une seule propriété par type, **non revendable**, niveau maximum 20, fonds et déblocage vérifiés côté moteur.
- [x] Crédit continu du **revenu fixe brut** dans le solde et dans la progression, avec reste de centime maîtrisé, une seule source de crédit.
- [x] Ajouter **Entreprises** à la barre de navigation et construire l'écran mobile : catalogue verrouillé/achetable/possédé, niveau, coût de la prochaine amélioration, rendement/s et paliers spéciaux (une amélioration à la fois).
- [x] Mettre à jour l'état et les sauvegardes lors des achats et améliorations sans créer de timer parallèle.
- [x] Tests métier et Vue : fonds insuffisants, double achat impossible, niveau 20, absence de bouton Revente, navigation et petites largeurs.
- **Livrable :** entreprises jouables en ligne, sans franchises, sans fiscalité encore activée.

**Validée le 13/11/2026** — [développement eb7efd0](https://github.com/Nighttug58/CAPITAL_IDLE/commit/eb7efd06dc615a172bcca0046f62c494e2b1de36), [PR #3](https://github.com/Nighttug58/CAPITAL_IDLE/pull/3) ; [GitHub Actions #43496810153](https://github.com/Nighttug58/CAPITAL_IDLE/actions/runs/43496810153) : **`npm test` (métier + UI), `npm run build:root` et déclenchement de GitHub Pages réussis**. `src/economy/enterprises.ts` : fonctions d'achat/amélioration uniques sans revente, revenu en nano-unités temporelles et sous-centimes conservés, fonds et MAX validés. `src/components/EnterpriseScreen.vue` et `src/style.css` : nouvelle page **Entreprises** accessible via le 3e bouton, catalogue scrollable mobile, états verrouillé/disponible/possédé, niveaux et paliers 5/10/15/20. L'unique `MarketRuntime` applique le rattrapage de revenu d'entreprise en une opération à l'heure courante ; `lastAccruedAt` empêche tout double crédit lors du rejeu Trading. **Aucun prélèvement fiscal** à cette passe (`FISCAL_TAX_RATE = null`). Tests : erreurs d'achat, double acquisition, niveau 20, fonds négatifs, replay, une année de revenu, Vue mobile et navigation.

### Passe 4 — Taxes différées sur entreprises et ventes de titres

- [x] Créer **un moteur fiscal unique** avec compteur `taxesDue`, ventilation des sources, `taxesPaid`, dates de période et taux configuré.
- [x] Brancher l'accumulation des taxes sur bénéfices des entreprises ; **ne pas réduire le crédit brut**.
- [x] Brancher l'accumulation sur les **plus-values de ventes bénéficiaires** de `src/trading/trades.ts`, y compris memecoins, en réutilisant exactement le calcul du prix de revient et des frais déjà existants.
- [x] Implémenter **paiement manuel intégral** (remise du timer à 72 h) et **prélèvement automatique après 72 h** ; solde négatif autorisé, zéro double taxe.
- [x] Tests vente partielle, coût moyen, pertes, frais, taxes non immédiates, paiement avec solde insuffisant, redémarrage du timer et niveau joueur stable.
- **Livrable :** fiscalité cohérente en session, avec règle de taux explicitement fixée avant activation.

**Validée le 13/11/2026** — [PR #4](https://github.com/Nighttug58/CAPITAL_IDLE/pull/4), [commit initial c442de0](https://github.com/Nighttug58/CAPITAL_IDLE/commit/c442de05188dafcc1cf7aedb3a1ffb28485a8d83), correctifs des deux catégories fiscales de Trading et [CI #43504552219](https://github.com/Nighttug58/CAPITAL_IDLE/actions/runs/43504552219) : **npm test (métier + UI), compilation TypeScript/Vite, synchronisation `main/root` et déclenchement Pages réussis**. Moteur unique `src/economy/fiscal.ts`, synchronisation `src/economy/clock.ts` ; dette fiscale par source et taxes payées, reliquats infra-centime entreprises, prélèvements toutes les **72 h réelles**, découvert fiscal permis sans diminution de l'XP, paiement anticipé avec reset d'horloge, débit atomique et calcul en périodes pour les absences. Taxes sur gains réalisés de `src/trading/trades.ts` après coût d'achat et commissions ; les ventes à perte ne sont pas taxées. Une **première page Stats fiscale** et son paiement avec confirmation sont disponibles dès cette passe ; le tableau de bord statistique complet reste à la passe 6. **Taux actif provisoire : 15 %**, défini uniquement dans `src/economy/state.ts`, à confirmer/ajuster ultérieurement (aucun caractère définitif). Tests métier/UX couvrent ventes partielles, actions/cryptos/memecoins, revenus bruts d'entreprises, taxes par source, paiement 72 h, paiement anticipé, solde négatif, rollover sur 10 jours et absence de double prélèvement.

### Passe 5 — Hors ligne illimité et chronologie des échéances

- [x] Raccorder les entreprises et la fiscalité à la reprise d'une partie sans multiplier les boucles temporelles.
- [x] Avancer les entreprises **par calcul de durée agrégé**, puis appliquer les échéances successives de 72 h dans le bon ordre ; respecter les revenus gagnés avant/après chaque échéance.
- [x] Garantir que le timer reste ancré à la dernière échéance/au dernier paiement manuel, et **ne repart jamais au chargement**.
- [x] Gérer navigation/masquage/rechargement/reprise/import sans double encaissement ni double prélèvement, y compris avec le replay du marché préexistant.
- [x] Tests absences 1 h, 72 h pile, 73 h, 10 jours, 90 jours, 1 an ; paiement anticipé, horloge reculée, valeurs extrêmes, performance mobile.
- **Livrable :** revenus d'entreprises sans limite de durée et fiscalité fiable après fermeture prolongée.

**Validée le 13/11/2026** — [implémentation 7b7c174](https://github.com/Nighttug58/CAPITAL_IDLE/commit/7b7c17466c3c2b0d7a7cc90c373faba416d9cb99) via [PR #5](https://github.com/Nighttug58/CAPITAL_IDLE/pull/5). `src/economy/clock.ts` et `fiscal.ts` : rattrapage en temps constant **O(1)**, sans itération par seconde ni par période de 72 h ; crédit du brut jusqu'à la dernière échéance, collecte mathématiquement équivalente des taxes des périodes complètes (aucune pénalité/intérêt), puis dette de la période partielle. Le timer reste ancré à la **dernière échéance réelle** ou au paiement anticipé, jamais au rechargement. `src/trading/dividends.ts` réutilise cette même horloge pour ne pas contourner la collecte pendant le rejeu du marché ; le runtime reste à minuterie unique, sans double crédit. Scénarios de restauration JSON v5 et reprise simulée après sauvegarde ; l'UI **Importer** manuelle sera livrée à la passe 7 et devra conserver les timestamps. **12 tests ajoutés** dans `src/economy/offline.test.ts` (1 h, 72/73 h, 10/90/365 jours, 4/1000 ans, transactions proches d'échéance, paiement anticipé, horloge reculée, ancien état déjà crédité, runtime en pause/reprise, replay Trading et performance). [CI #43507010064](https://github.com/Nighttug58/CAPITAL_IDLE/actions/runs/43507010064) : **npm test, build TypeScript/Vite, synchronisation main/root et demande de publication GitHub Pages réussis**. Les limitations restent uniquement la capacité numérique de l'état monétaire (pas de plafond temporel artificiel).

### Passe 6 — Page Stats et fiscalité visible

- [x] Ajouter **Stats** en **dernière position à droite** de la navigation principale sans supprimer les onglets Trading existants.
- [x] Vue d'ensemble patrimoine/progression ; gains et pertes ventilés selon leurs sources **sans double comptage** ; cartes entreprises.
- [x] Bloc fiscal clair avec dette, détail par origine, taxes totales payées, décompte avant échéance et **Payer maintenant**.
- [x] Valeur patrimoniale nette correcte : cash potentiellement négatif, actifs, valeur comptable des entreprises, moins dette fiscale encore due.
- [x] Compatibilité mobile, contrastes, formatage monétaire, confirmation éventuelle du paiement, tests de composants.
- **Livrable :** page Stats exploitable, fiscale et économique.

**Validée le 13/11/2026** — [PR #6](https://github.com/Nighttug58/CAPITAL_IDLE/pull/6), [implémentation 6e5e5b5](https://github.com/Nighttug58/CAPITAL_IDLE/commit/6e5e5b58b0958a74c79270fc4c5fcbaf9b5a330d), correctif d'arrondi au centime [3ba3a7c](https://github.com/Nighttug58/CAPITAL_IDLE/commit/3ba3a7cbd984b395549f65c4196f83c236957692). [CI #43509305079](https://github.com/Nighttug58/CAPITAL_IDLE/actions/runs/43509305079) : **tous les tests métier et Vue, compilation TypeScript/Vite, mise à jour du build main/root et déclenchement GitHub Pages réussis**. `src/economy/stats-ledger.ts` : comptage effectif des clics, revenus de dividendes réellement payés, plus-values et pertes réalisées séparées par origine, temps actif uniquement au premier plan, sans second timer. `src/economy/stats-overview.ts` : bilan patrimoine = cash (négatif possible) + valeur de marché des titres + montant investi dans entreprises − impôts encore dus ; les taxes déjà payées sont dans le cash, sans double déduction. `src/components/StatsScreen.vue` : progression XP, niveau 50, gain total pour la progression, temps joué, clics, barres de répartition, gains/pertes actions/cryptos/memecoins, revenus et niveaux Entreprises, patrimoine ventilé et module fiscal existant avec confirmation. Les anciennes sauvegardes v5 sans suivi par source migrent une seule fois dans `unclassified` : aucune attribution historique fictive. Tests `src/economy/stats.test.ts` et `src/components/stats-ui.test.ts` enrichis. **Import/Export/Reset manuels réservés à la passe 7.**

### Passe 7 — Export JSON, import confirmé, réinitialisation confirmée

- [x] **Tout en bas de Stats** : Exporter, Importer et Réinitialiser la sauvegarde.
- [x] Export JSON complet, versionné, stable, téléchargeable ; ne pas interrompre la partie.
- [x] Import avec validation forte et migration supportée, aperçu/résumé du fichier, confirmation **avant remplacement**, transaction atomique et relance propre des runtimes.
- [x] Réinitialisation avec saisie `RESET`, confirmation, suppression des clés obsolètes empêchant une migration fantôme et nouveau cycle fiscal.
- [x] Tests export→import (toutes les données et horloges préservées), corruption, mauvaise version, annulation, reset, absence de résurrection v4.
- **Livrable :** outils de sauvegarde manuelle fiables sans compromettre l'autosauvegarde.

**Validée le 13/11/2026** — [PR #7](https://github.com/Nighttug58/CAPITAL_IDLE/pull/7), [commit de développement 32c88e2](https://github.com/Nighttug58/CAPITAL_IDLE/commit/32c88e2517b250e56366f9af4ba0de13903f9a45). [CI #43511841930](https://github.com/Nighttug58/CAPITAL_IDLE/actions/runs/43511841930) : **`npm test` avec tests métier et Vue, compilation TypeScript/Vite, mise à jour du site `main/root` et demande de build GitHub Pages réussis**. `src/save-transfer.ts` : export JSON complet versionné, horodatage, nom `CAPITAL_IDLE_save_YYYY-MM-DD.json`, fichier maximal 16 Mo, import de fichiers bruts v4/v5 et conteneurs v5, **vérification stricte** des sections, montants, horodatages, positions, fiscalité et statistiques ; rejet intégral avant confirmation si corrompu, sans remise à zéro silencieuse. `src/persistence.ts` : écriture v5 contrôlée **avant** purge des clés v1–v4, priorité v5 même si corrompue pour éviter toute résurrection. `src/App.vue` : arrêt de l'ancien runtime, remplacement synchronisé et relance sur les horloges importées, rattrapage normal des gains d'entreprises et échéances fiscales (pas de remise à zéro du timer sur import), retour à la partie précédente si écriture impossible. `src/components/StatsScreen.vue` : **tout en bas** Exporter, Importer (aperçu + confirmation), Reset irréversible **avec saisie exacte RESET** ; styles mobiles et messages d'erreur. `src/save-transfer.test.ts` : **11 tests** export/import complet, v4/v5, migration d'anciennes données, 90 jours hors ligne, rejet de corruption/taille/version/date, reset sans résurrection et échec de stockage ; `src/components/stats-ui.test.ts` : **4 tests UI** supplémentaires, import/annulation/reset et petits écrans. L'autosauvegarde existante reste active.

### Passe 8 — Audit final, régressions et livraison

- [x] Audit croisé des trois sources : revenus/XP, cash, trades, taxes, patrimoine, statistiques, aucune double autorité.
- [x] Tester longs rattrapages, import après long arrêt, vente juste avant/après échéance, paiement anticipé, solde négatif et recouvrement par revenus passifs.
- [x] Vérifier `npm test`, `npm run test:ui`, `npm run build` ; compléter tests métier/UI nécessaires et vérifier les modales en viewport smartphone.
- [x] Mettre à jour le README et les règles utilisateur selon le **comportement réel livré** ; préserver la roadmap Trading V1 déjà terminée.
- [x] Vérifier le pipeline GitHub Pages **`main / (root)`**, sans changer la stratégie de publication ; confirmer l'accès aux nouvelles pages après déploiement.
- [x] Cocher la roadmap seulement après vérification et ajouter le ou les commits des passes livrées.
- **Livrable :** système complet stable, documenté et publié.

**Validée le 13/11/2026** — [PR #8](https://github.com/Nighttug58/CAPITAL_IDLE/pull/8) et [commit d'audit d2a044f](https://github.com/Nighttug58/CAPITAL_IDLE/commit/d2a044f09bef3c7f9465e8e37bdf16bdae9b1ca8), [correction scénario de dette 160bd39](https://github.com/Nighttug58/CAPITAL_IDLE/commit/160bd39ebf1a087d72d95e90bcc1e7dc8dafcc07). **Audit** : l'unique `game.balance` demeure l'autorité de cash ; les entreprises contribuent au solde et à l'XP en brut avec taxe différée ; les plus-values du Trading sont nettes des deux commissions et séparées du capital récupéré ; taxes payées ne réduisent pas l'XP et sont retirées une seule fois du bilan patrimonial. Une double écriture par transaction Trading (watcher clicker + `persist()`) a été supprimée en protégeant l'affectation par `applyingMarket`. `src/economy/integration.test.ts` ajoute **5 scénarios de bout en bout** : clic + entreprise + patrimoine, dette fiscale entraînant un solde négatif puis résorption passive, ventes au passage de 72 h, dividendes au passage d'une échéance, sauvegarde importée après 90 jours. Un contrôle UI ajoute les invariants de **largeur, hauteur et défilement** des modales Actions/Crypto sur petite hauteur ; modales News et animations clicker gardent leurs tests existants. **Réserve** : ces tests de composants/CSS vérifient la structure responsive, **pas un rendu photographié dans un navigateur mobile réel**. README actualisé aux quatre pages, entreprise, taxation et v5. **CI** : [Build main/root #43513345179](https://github.com/Nighttug58/CAPITAL_IDLE/actions/runs/43513345179) — `npm test` (métier et Vitest UI), `npm run build:root`, commit du site compilé et demande Pages **réussis** ; [Pages #43513427777](https://github.com/Nighttug58/CAPITAL_IDLE/actions/runs/43513427777) — **publication réussie**. Le site compilé `index.html` sur `main / (root)` référence des fichiers `/CAPITAL_IDLE/assets/`. **Réserve supplémentaire** : l'accès HTTP direct du site depuis l'environnement d'audit n'a pas pu être mesuré ; on dispose du statut positif du déploiement GitHub Pages.

## 4. Critères de clôture globale

- [x] Chaque type d'entreprise peut être acquis **une seule fois**, ne peut pas être revendu, et s'arrête à **niveau 20** avec bonus 5/10/15/20.
- [x] Toutes les entreprises génèrent leurs revenus fixes **en ligne et hors ligne sans plafond temporel** ; la progression ne recompte ni dépenses ni capital transféré.
- [x] Fiscalité : uniquement bénéfices d'entreprises et **plus-values réalisées** actions/cryptos/memecoins, dette accumulée et prélèvement **toutes les 72 h réelles**, possibilité de **solde négatif**, paiement manuel qui relance 72 h.
- [x] **Stats** est le bouton le plus à droite et affiche progression, gains par source, patrimoine et taxes.
- [x] **Exporter / Importer / Reset** sont en bas de Stats, sûrs, versionnés, confirmés pour les actions destructrices.
- [x] Les anciennes sauvegardes continuent de charger ; un reset ne ressuscite pas la sauvegarde d'une ancienne version.
- [x] Aucune régression du clicker, du Trading, des News, des dividendes, des performances mobile ou de la publication.

## 5. Décisions ouvertes limitées à l'équilibrage

- **Taux d'imposition exact** : **à valider** ; **15 % est actif provisoirement dans le code**, mais reste un réglage d'équilibrage et pas une validation définitive.
- **Valeurs économiques** des 20 entreprises : catalogue de gameplay fixé lors de la passe 2 et documenté dans [ENTREPRISES_ECONOMIE.md](ENTREPRISES_ECONOMIE.md). Une révision des courbes reste possible après retours de jeu.
- Ne pas introduire de franchises, revente, charges, employés, taxes immédiates, plafonds hors ligne, prestige post-20, intérêts de retard, ou nouvelle fonctionnalité majeure sans nouvelle décision explicite.
