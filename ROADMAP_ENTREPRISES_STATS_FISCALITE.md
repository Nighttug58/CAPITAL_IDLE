# ROADMAP — CAPITAL_IDLE / Entreprises, Fiscalité, Statistiques et Sauvegardes

**Statut : à développer — 0/8 passes livrées**  
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

- [ ] Introduire dans `CapitalState` les modèles typés `enterprises`, `fiscal` et `stats` ; désigner les propriétaires de chaque compteur.
- [ ] Préparer la **migration v4 → v5** avec conservation intégrale des parties et absence de taxation rétroactive ; maintenir les migrations anciennes par la chaîne existante.
- [ ] Modifier de manière ciblée la validation/arithmétique du cash pour permettre un **solde négatif issu d'un prélèvement fiscal**, jamais un achat à découvert.
- [ ] Définir le référentiel des catégories statistiques, la convention d'arrondi en centimes et la configuration du taux fiscal (décision encore ouverte).
- [ ] Tests migration v1–v4, nouvelle partie, invalides, balance négatif valide, interdiction d'achat en négatif.
- **Livrable :** nouveaux états persistants et contrats métier sans régression Trading.

### Passe 2 — Catalogue et équilibrage des 20 entreprises

- [ ] Définir exactement 20 entreprises avec identifiants stables et niveau joueur requis.
- [ ] Fixer **prix initial**, revenu/s au niveau 1, **19 coûts d'amélioration**, courbe de revenu et **bonus explicites aux niveaux 5, 10, 15, 20**.
- [ ] Comparer les délais de retour sur investissement et la progression globale au clicker, aux dividendes et au trading ; corriger les courbes déséquilibrées.
- [ ] Fonctions pures de consultation (`unlock`, `price`, `incomeAtLevel`), contrôles d'unicité et niveau 1–20.
- [ ] Tests catalogue, bonus de palier, monotonie des coûts/revenus, conditions de déblocage, plafonds.
- **Livrable :** catalogue déterministe exploitable par le jeu, chiffres documentés.

### Passe 3 — Achat, amélioration, revenus et page Entreprises

- [ ] Actions métier `buyEnterprise` / `upgradeEnterprise` : une seule propriété par type, **non revendable**, niveau maximum 20, fonds et déblocage vérifiés côté moteur.
- [ ] Crédit continu du **revenu fixe brut** dans le solde et dans la progression, avec reste de centime maîtrisé, une seule source de crédit.
- [ ] Ajouter **Entreprises** à la barre de navigation et construire l'écran mobile : catalogue verrouillé/achetable/possédé, niveau, coût de la prochaine amélioration, rendement/s et paliers spéciaux (une amélioration à la fois).
- [ ] Mettre à jour l'état et les sauvegardes lors des achats et améliorations sans créer de timer parallèle.
- [ ] Tests métier et Vue : fonds insuffisants, double achat impossible, niveau 20, absence de bouton Revente, navigation et petites largeurs.
- **Livrable :** entreprises jouables en ligne, sans franchises, sans fiscalité encore activée.

### Passe 4 — Taxes différées sur entreprises et ventes de titres

- [ ] Créer **un moteur fiscal unique** avec compteur `taxesDue`, ventilation des sources, `taxesPaid`, dates de période et taux configuré.
- [ ] Brancher l'accumulation des taxes sur bénéfices des entreprises ; **ne pas réduire le crédit brut**.
- [ ] Brancher l'accumulation sur les **plus-values de ventes bénéficiaires** de `src/trading/trades.ts`, y compris memecoins, en réutilisant exactement le calcul du prix de revient et des frais déjà existants.
- [ ] Implémenter **paiement manuel intégral** (remise du timer à 72 h) et **prélèvement automatique après 72 h** ; solde négatif autorisé, zéro double taxe.
- [ ] Tests vente partielle, coût moyen, pertes, frais, taxes non immédiates, paiement avec solde insuffisant, redémarrage du timer et niveau joueur stable.
- **Livrable :** fiscalité cohérente en session, avec règle de taux explicitement fixée avant activation.

### Passe 5 — Hors ligne illimité et chronologie des échéances

- [ ] Raccorder les entreprises et la fiscalité à la reprise d'une partie sans multiplier les boucles temporelles.
- [ ] Avancer les entreprises **par calcul de durée agrégé**, puis appliquer les échéances successives de 72 h dans le bon ordre ; respecter les revenus gagnés avant/après chaque échéance.
- [ ] Garantir que le timer reste ancré à la dernière échéance/au dernier paiement manuel, et **ne repart jamais au chargement**.
- [ ] Gérer navigation/masquage/rechargement/reprise/import sans double encaissement ni double prélèvement, y compris avec le replay du marché préexistant.
- [ ] Tests absences 1 h, 72 h pile, 73 h, 10 jours, 90 jours, 1 an ; paiement anticipé, horloge reculée, valeurs extrêmes, performance mobile.
- **Livrable :** revenus d'entreprises sans limite de durée et fiscalité fiable après fermeture prolongée.

### Passe 6 — Page Stats et fiscalité visible

- [ ] Ajouter **Stats** en **dernière position à droite** de la navigation principale sans supprimer les onglets Trading existants.
- [ ] Vue d'ensemble patrimoine/progression ; gains et pertes ventilés selon leurs sources **sans double comptage** ; cartes entreprises.
- [ ] Bloc fiscal clair avec dette, détail par origine, taxes totales payées, décompte avant échéance et **Payer maintenant**.
- [ ] Valeur patrimoniale nette correcte : cash potentiellement négatif, actifs, valeur comptable des entreprises, moins dette fiscale encore due.
- [ ] Compatibilité mobile, contrastes, formatage monétaire, confirmation éventuelle du paiement, tests de composants.
- **Livrable :** page Stats exploitable, fiscale et économique.

### Passe 7 — Export JSON, import confirmé, réinitialisation confirmée

- [ ] **Tout en bas de Stats** : Exporter, Importer et Réinitialiser la sauvegarde.
- [ ] Export JSON complet, versionné, stable, téléchargeable ; ne pas interrompre la partie.
- [ ] Import avec validation forte et migration supportée, aperçu/résumé du fichier, confirmation **avant remplacement**, transaction atomique et relance propre des runtimes.
- [ ] Réinitialisation avec saisie `RESET`, confirmation, suppression des clés obsolètes empêchant une migration fantôme et nouveau cycle fiscal.
- [ ] Tests export→import (toutes les données et horloges préservées), corruption, mauvaise version, annulation, reset, absence de résurrection v4.
- **Livrable :** outils de sauvegarde manuelle fiables sans compromettre l'autosauvegarde.

### Passe 8 — Audit final, régressions et livraison

- [ ] Audit croisé des trois sources : revenus/XP, cash, trades, taxes, patrimoine, statistiques, aucune double autorité.
- [ ] Tester longs rattrapages, import après long arrêt, vente juste avant/après échéance, paiement anticipé, solde négatif et recouvrement par revenus passifs.
- [ ] Vérifier `npm test`, `npm run test:ui`, `npm run build` ; compléter tests métier/UI nécessaires et vérifier les modales en viewport smartphone.
- [ ] Mettre à jour le README et les règles utilisateur selon le **comportement réel livré** ; préserver la roadmap Trading V1 déjà terminée.
- [ ] Vérifier le pipeline GitHub Pages **`main / (root)`**, sans changer la stratégie de publication ; confirmer l'accès aux nouvelles pages après déploiement.
- [ ] Cocher la roadmap seulement après vérification et ajouter le ou les commits des passes livrées.
- **Livrable :** système complet stable, documenté et publié.

## 4. Critères de clôture globale

- [ ] Chaque type d'entreprise peut être acquis **une seule fois**, ne peut pas être revendu, et s'arrête à **niveau 20** avec bonus 5/10/15/20.
- [ ] Toutes les entreprises génèrent leurs revenus fixes **en ligne et hors ligne sans plafond temporel** ; la progression ne recompte ni dépenses ni capital transféré.
- [ ] Fiscalité : uniquement bénéfices d'entreprises et **plus-values réalisées** actions/cryptos/memecoins, dette accumulée et prélèvement **toutes les 72 h réelles**, possibilité de **solde négatif**, paiement manuel qui relance 72 h.
- [ ] **Stats** est le bouton le plus à droite et affiche progression, gains par source, patrimoine et taxes.
- [ ] **Exporter / Importer / Reset** sont en bas de Stats, sûrs, versionnés, confirmés pour les actions destructrices.
- [ ] Les anciennes sauvegardes continuent de charger ; un reset ne ressuscite pas la sauvegarde d'une ancienne version.
- [ ] Aucune régression du clicker, du Trading, des News, des dividendes, des performances mobile ou de la publication.

## 5. Décisions ouvertes limitées à l'équilibrage

- **Taux d'imposition exact** : **à valider** ; 15 % est une proposition antérieure, pas une décision confirmée.
- **Valeurs économiques** des 20 entreprises : définir et calibrer en passe 2 (prix/revenus/bonus/coûts). Les règles de gameplay, elles, sont fixées ci-dessus.
- Ne pas introduire de franchises, revente, charges, employés, taxes immédiates, plafonds hors ligne, prestige post-20, intérêts de retard, ou nouvelle fonctionnalité majeure sans nouvelle décision explicite.
