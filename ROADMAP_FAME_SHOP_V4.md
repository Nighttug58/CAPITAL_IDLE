# CAPITAL_IDLE — ROADMAP FAME SHOP V4 (30 nouveaux pouvoirs, 8 passes)

**Dépôt :** Nighttug58/CAPITAL_IDLE · **Branche :** main
**Statut :** 4/8 passes réalisées ; passes 1–4 validées, restent les passes 5–8.
**Décision :** 30 pouvoirs retenus par le joueur; 196 niveaux Fame en plus; 178 100 Fame de coût additionnel, 345 810 Fame pour tout le magasin historique et V4.
**Déclenchement :** « Next » exécute **une seule passe non terminée** avec vérification de l'état réel de main avant toute mutation. Ne jamais marquer une passe terminée sans preuves et commit.
**Références techniques (inspection de main) :** src/prestige/catalog.ts, src/prestige/absolute-v8.ts, src/prestige/collections-v3.ts, src/exact-runtime-v8.ts, src/exact-save-validation.ts, src/exact-state-v8.ts, src/exact-prestige-v8.ts, src/exact-market-v8.ts, src/trading/auto-sell-v8.ts, src/offline-report-v8.ts, src/components/FameShopScreen.vue.

## 1. Invariants non négociables

1. Les six branches du Fame Shop V2 (6×20 = 120 rangs) demeurent inchangées, y compris leur coût combiné exact de 167 710 Fame et les prix historiques versionnés. Les nouvelles 30 branches ont 196 rangs, coût total 178 100 Fame.
2. Le Prestige absolu se déverrouille toujours au 120/120 des **six** branches historiques. Son facteur basé sur des tranches de 100 Fame disponibles et son plafond ×(100 + Prestiges) n'amplifient **jamais** les 30 nouvelles branches. Ne pas le faire dépendre du 316/316.
3. Chaque niveau V4 acheté est permanent au-delà des Prestiges. La Fame disponible, elle, retombe à zéro à chaque Prestige selon le comportement V8 actuel. Les effets de cycle/temporaires disparaissent ou expirent selon leurs contrats explicites.
4. Toute valeur économique exacte : BigInt en unité canonique pour cash/centimes et Fame/micro-Fame ; registre d'achat déterministe et validé sans débits doubles, sérialisation JSON canonique, pas de Number pour montants non sûrs. Conserver import v1-v7 et anciennes V8.
5. Ne jamais retirer le cash deux fois ; un profit de trading ne doit pas générer deux fois XP, taxe ou Fame. Toutes les automatisations passent par l'unique moteur exact de vente V8. Les gains fictifs ne créditent pas directement de PP ; leur contribution éventuelle au patrimoine net éligible se fait par la formule Prestige normale.
6. Trading : 45 actifs, prix d'exécution identiques au cours affiché, aucun impact achat/vente, quantités non plafonnées hors cash/position, frais actuels, staking conservé. Les news restent chaotiques, leur moteur et leur génération restent inchangés.
7. Fiscalité progressive et calendrier de 72 h conservés, avec paiement intégral avant Prestige. Aucune remise implicite de dette. Ne pas traiter une réserve fiscale comme de la richesse supplémentaire.
8. Entreprises : niveaux illimités, source de vérité V8, revenus hors ligne exacts; collections : 100 objets déterministes et récompense 100/100 inchangées.
9. Contrats, timers et ventes automatiques : un seul temps de référence autoritatif, comportement idempotent au tick, pendant replay hors ligne, import et rechargement. Éviter les animations lourdes/rafales DOM.
10. UX mobile : catégories compactes, onglets/scroll sans cacher derniers éléments, boutons ACHETER et MAX atomiques, confirmation pour tout coût irréversible ou grosse liquidation, coûts et bonus clairement indiqués.

## 2. Grille économique V4 contractuelle

Prix du rang **n** d'un pouvoir : P + S×(n−1), n de 1 à N. Total d'une branche : N×P + S×N×(N−1)/2 (entiers Fame).
Aucun prix ne dépend de la richesse, des bonus actuels ou de la fréquence de Prestige.

| ID | Groupe | Pouvoir | N | P | S | Dernier | Total Fame |
|---|---|---|---:|---:|---:|---:|---:|
| 01 | Trading | Instinct du trader | 10 | 180 | 80 | 900 | 5 400 |
| 02 | Trading | Stop suiveur | 5 | 600 | 300 | 1 800 | 6 000 |
| 03 | Trading | Empire des dividendes | 15 | 250 | 90 | 1 510 | 13 200 |
| 04 | Trading | Radar des news | 5 | 600 | 250 | 1 600 | 5 500 |
| 05 | Trading | Diversification royale | 10 | 180 | 80 | 900 | 5 400 |
| 06 | Trading | Réseau d'informateurs | 1 | 2 800 | 0 | 2 800 | 2 800 |
| 07 | Trading | Sortie stratégique | 5 | 600 | 200 | 1 400 | 5 000 |
| 08 | Entreprises | Synergies industrielles | 10 | 300 | 120 | 1 380 | 8 400 |
| 09 | Entreprises | Recherche et développement | 10 | 350 | 150 | 1 700 | 10 250 |
| 10 | Entreprises | Contrats gouvernementaux | 5 | 950 | 650 | 3 550 | 11 250 |
| 11 | Entreprises | Méga-infrastructures | 5 | 1 200 | 700 | 4 000 | 13 000 |
| 12 | Entreprises | Franchise internationale | 10 | 250 | 110 | 1 240 | 7 450 |
| 13 | Entreprises | Conseil d'administration | 5 | 500 | 300 | 1 700 | 5 500 |
| 14 | Collections | Expositions temporaires | 5 | 400 | 160 | 1 040 | 3 600 |
| 15 | Collections | Restauration de prestige | 10 | 180 | 90 | 990 | 5 850 |
| 16 | Collections | Expert en antiquités | 1 | 1 500 | 0 | 1 500 | 1 500 |
| 17 | Collections | Ventes privées | 5 | 220 | 125 | 720 | 2 350 |
| 18 | Collections | Mécène impérial | 5 | 600 | 400 | 2 200 | 7 000 |
| 19 | Clics | Frénésie capitaliste | 10 | 150 | 80 | 870 | 5 100 |
| 20 | Clics | Billet légendaire | 5 | 400 | 200 | 1 200 | 4 000 |
| 21 | Clics | Surcharge automatique | 5 | 500 | 250 | 1 500 | 5 000 |
| 22 | Clics | Clic chargé | 10 | 130 | 60 | 670 | 4 000 |
| 23 | Clics | Réaction en chaîne | 10 | 220 | 90 | 1 030 | 6 250 |
| 24 | Fiscalité | Réserve fiscale | 5 | 120 | 60 | 360 | 1 200 |
| 25 | Fiscalité | Fidélité fiscale | 5 | 450 | 200 | 1 250 | 4 250 |
| 26 | Fiscalité | Échelonnement fiscal | 5 | 350 | 180 | 1 070 | 3 550 |
| 27 | Fiscalité | Optimisation patrimoniale | 1 | 1 500 | 0 | 1 500 | 1 500 |
| 28 | Prestige | Renaissance fulgurante | 5 | 650 | 260 | 1 690 | 5 850 |
| 29 | Prestige | Défis de milliardaire | 10 | 250 | 110 | 1 240 | 7 450 |
| 30 | Prestige | Destin du magnat | 3 | 2 200 | 1 300 | 4 800 | 10 500 |

**Totaux prouvables par assertions de catalogue :** Trading 43 300; Entreprises 55 850; Collections 20 300; Clics 24 350; Fiscalité 10 500; Prestige 23 800; somme 178 100 Fame; N=196; ancienne boutique 167 710; ensemble 345 810 Fame / 316 rangs.

## 3. Contrats métiers des 30 pouvoirs

### Trading — 01 à 07

- **01 Instinct du trader (10)** : indicateurs descriptifs sur 30 à 300 secondes d'historique observé, pas de prédiction certaine ni de modification du marché.
- **02 Stop suiveur (5)** : seuil minimum paramétrable par niveau : 25 %, 20 %, 15 %, 10 %, 5 %. Sommet post-acquisition du reliquat, suivi avec prix exécutables; aucune vente d'unités bloquées par staking. Action une seule fois par franchissement.
- **03 Empire des dividendes (15)** : +1 % par niveau, +15 % maximum des dividendes effectivement crédités, sans changer rendement affiché ni cours.
- **04 Radar des news (5)** : alertes positions, expiration, pression actuelle, cumul, fenêtre indicative de prochaine news. Aucune connaissance anticipée de l'issue d'un tirage futur. Respect du Prestige « news-preview » existant.
- **05 Diversification royale (10)** : +0,5 % dividendes par action éligible différente, plafonné à +1 % par rang (max +10 %). Position > ou = 1 % de la valeur des actions du portefeuille pour être éligible ; uniquement actions (max 20).
- **06 Réseau d'informateurs (1)** : analyse des 100 derniers événements réellement persistés, avec cours avant/après si échantillons disponibles; pas de fabrication d'historique disparu. Stockage borné en temps/volume.
- **07 Sortie stratégique (5)** : vente programmée par prix de profit net théorique et pourcentage de position ; progression 25/50/75/100 %, niveau 5 autorise 3 cibles. Frais ordinaires et taxe ordinaire, pas de vente à découvert.

Arbitrage des ventes **sur chaque tick et replay hors ligne** : liquider selon news rouge/début ou verte/fin existantes, puis stop suiveur, puis sortie stratégique ; montant disponible recalculé après chaque ordre. Aucun double débit ni deuxième liquidation d'une position nulle. Historique compact dans le rapport de lancement.

### Entreprises — 08 à 13

- **08 Synergies industrielles (10)** : paire unique entre deux entreprises, +1 % revenus par rang à chacune (max +10 %), entreprise ne peut figurer dans deux paires.
- **09 Recherche et développement (10)** : −0,8 % des prochains coûts d'amélioration par niveau, max −8 %, aucun remboursement des anciens niveaux, prix d'acquisition initial inchangé.
- **10 Contrats gouvernementaux (5)** : 1 à 5 contrats concurrents par niveau ; capital immobilisé, durée 30–120 min, succès +0 à +5 % du capital vs échec −15 %, critères/issue définis et déterministes une fois le contrat démarré; comptabilisation des profits taxables seulement. Exemple mise 100 B$, succès 103 B$; échec 85 B$. Remboursement du principal sans XP/Fame additionnels; contrat forcé terminé avant Prestige aux conditions d'échec. Ne jamais double compter le principal dans patrimoine et cash; définition claire du traitement du capital bloqué dans l'assiette PP.
- **11 Méga-infrastructures (5)** : débloque projets à 10 B$, 1 T$, 100 T$, 10 Q$, 1 AA$. Chacun procure +5 % de revenus d'une catégorie d'entreprises pendant 30 min. Max +15 % par catégorie, projet consommé sans revente/remboursement, désactivé au Prestige.
- **12 Franchise internationale (10)** : +1 % des revenus d'une entreprise sélectionnée par rang, max +10 %, changement cooldown 30 min.
- **13 Conseil d'administration (5)** : +3 % des revenus de l'entreprise principale par rang, max +15 %, changement cooldown 30 min. Compatible 12 sans double comptabilisation.

### Collections — 14 à 18

- **14 Expositions temporaires (5)** : +1 %/rang aux revenus entreprises et dividendes, max +5 %, pendant 30 min, cooldown 2 h; demande au moins 3 objets. Prix 0,5 % du patrimoine net positif (minimum 1 M$) prélevé une fois, sans crédit Fame/XP.
- **15 Restauration de prestige (10)** : 2 objets restaurables par niveau, 20 au total; coût 20 % du prix catalogue de chaque objet en dollars; chaque objet restauré +0,25 % revenus éligibles, max +5 % global. Achat permanent, une restauration par objet, aucune deuxième récompense de collection ni Fame.
- **16 Expert en antiquités (1)** : dashboard prix manquants, bonus, détails d'acquisition et 100/100.
- **17 Ventes privées (5)** : 1–5 offres par jour (temps réel) au max, −1 %/rang prix, −5 % maximum, 24 h par offre, uniquement objets non acquis, offres persistées; ne crée jamais de deuxième récompense.
- **18 Mécène impérial (5)** : nouvelles ailes à 1 B$, 100 B$, 10 T$, 1 Q$, 100 Q$, achat permanent; chacune +0,5 % revenus entreprises/dividendes (+2,5 % maximum), ne crée pas de nouvel objet dans le 100/100.

### Clics — 19 à 23

- **19 Frénésie capitaliste (10)** : dix clics manuels en 3 secondes activent +2,5 % des gains de clic manuel par rang, jusqu'à +25 %, décroît après 3 secondes sans clic manuel. Pas d'activation par Auto Click.
- **20 Billet légendaire (5)** : apparition manuelle, fréquence max une fois toutes 15 min au niveau 1 → 5 min au niveau 5, gain de 5 → 30 clics normaux; non cumulable hors ligne, aucun événement DOM en rafale.
- **21 Surcharge automatique (5)** : +50 % fréquence Auto Click actif pendant 4 s par rang (max 20 s), cooldown 15 min. Ne crée pas d'Auto Click quand la branche $ est au niveau 0, aucune double récompense.
- **22 Clic chargé (10)** : après 15 s sans clic manuel, un clic unique ×(2×rang), max ×20; une seule charge, pas de stockage hors ligne ni déclenchement par Auto Click.
- **23 Réaction en chaîne (10)** : chance 0,5 % par rang (max 5 %) d'ajouter 3–5 clics bonus non récursifs. Effets de bonus correctement soumis aux revenus, XP, Fame et taxes existants.

### Fiscalité — 24 à 27

- **24 Réserve fiscale (5)** : 20 % de la dette due réservée par rang, max 100 %. Le cash reste unique, mais une portion est indisponible pour les achats. Réserver n'est pas une dépense, ni un revenu, ni un avoir supplémentaire; libération au paiement ou recalcul après nouveau dû.
- **25 Fidélité fiscale (5)** : jusqu'à −1 % sur prochaine échéance par rang, −5 % max; qualification au plus une fois par période de 72 h, paiement anticipé >=1 M$ et >=24 h avant échéance, sans rétroactivité. Réduction appliquée une seule fois à la dette due lors du règlement qualifiant, avec trace comptable explicite et jamais deux fois via Prestige.
- **26 Échelonnement fiscal (5)** : 2 à 6 versements selon niveau, intervalle 12 h, frais de gestion de 1 % du montant échelonné, un plan actif, non cumulable avec remise future par lot opportuniste; solde total intégralement réglé avant Prestige, calendrier fiscal 72 h conservé.
- **27 Optimisation patrimoniale (1)** : rapports exacts des revenus bruts/nets, frais, dettes, projections (indiquées comme simulations). Aucune écriture économique.

### Prestige — 28 à 30

- **28 Renaissance fulgurante (5)** : au début d'un nouveau cycle Prestige, +20 % clics/entreprises pendant 1 minute par rang, max 5 minutes. Un seul déclenchement, pas à chaque reload.
- **29 Défis de milliardaire (10)** : 1 défi par rang et cycle (max 10), objectifs déterministes mesurables, récompense boost actif +5 % sur clics OU entreprises pendant 10 min; un seul boost de défi actif, pas de Farming d'objectifs revendiqués.
- **30 Destin du magnat (3)** : spécialisation unique verrouillée pour le cycle, Trader frais −2/4/6 % de leur montant, Industriel +2/4/6 % revenus entreprises, Collectionneur +1/2/3 % revenus éligibles (clic, entreprise, dividende), pas de Fame ou PP direct. Choix lors du lancement du cycle (y compris chargement de sauvegarde V8 migrée : valeur neutre tant que choix non effectué).

## 4. Agrégation et plafonds V4 (sans altérer les anciennes branches)

Les nouveaux bonus en points de pourcentage s'additionnent **entre eux par source**, jamais via des cascades multiplicatives, avant d'être appliqués **une seule fois** au revenu de référence déjà calculé avec les anciens bonus. Plafonds nouveaux bonus V4 : dividendes +45 %, revenus entreprises +100 % (temporaires compris), frais Trading réduits d'au plus 6 % du montant des frais de base, frais d'upgrade entreprises −8 %, rabais fiscal maximum −5 % sur échéance admissible. Clic chargé limité à un événement ×20, Réaction en chaîne non récursive.

Les coûts en dollars des nouvelles fonctionnalités sont des **money sinks**. Ils ne créditent ni XP ni Fame; leurs éventuelles recettes bénéficient aux sources de revenus explicites, à la taxation et à la richesse normale, sans PP spéciaux. Préciser pour chaque action la base du calcul fiscal et la ligne de statistiques.

**Nuances techniques à figer avant développement :**
- Radar de news ≠ « news-preview » Prestige : ne pas dévoiler une future news sans possession du pouvoir existant.
- L'actuel Auto Click peut être pris en compte hors ligne selon la version active : adopter uniquement le comportement réel du moteur V8 et garantir qu'une surcharge temporaire n'est pas appliquée deux fois lors du replay.
- Calcul du coût d'une exposition à partir de l'assiette et timestamp immédiatement avant achat, arrondi exact au centime, confirmation de dépense.
- Définir l'éligibilité des restaurations « revenus éligibles » précisément : uniquement clics, dividendes, entreprises, sans XP/Fame/PP directs.
- Les limites s'appliquent aux **seuls bonus V4** ; ne pas nerfer les bonus historiques acquis.

## 5. Architecture de sauvegarde / migration

- Nouveau catalogue statique V4 séparé du catalogue V2, avec IDs stables « fame-v4-01 » à « fame-v4-30 », N, P, S, effets documentés et somme de coûts vérifiable.
- Nouveau sous-registre V4 versionné et optionnel dans un ancien snapshot V8, rempli à zéro lors de migration déterministe et sans achat rétroactif. Champs: niveaux, coût cumulatif exact, états permanents (restaurations, ailes), états temporaires (contrats, expositions, cooldowns, seuils/ordres, spécialisation), version et reçus bornés.
- Préserver la relation actuelle `lifetimeFameMicros = fameMicros + fameSpentMicros + fameForfeitedMicros` en ajoutant les dépenses V4 au registre dépensé TOTAL et en adaptant le validateur pour calculer et vérifier `coût V2 historique + coût V4` sans fausses corrections. Ne pas augmenter le solde Fame à l'import.
- Ne jamais sauvegarder une fonction, un BigInt brut ou un montant Number non sûr; les unités canoniques restent en chaînes décimales.
- Migrations V8 anciennes idempotentes, validateur strict, imports JSON compatibles, backups, refus d'une sauvegarde malformée (aucun reset silencieux).

## 6. Ordre d'exécution — huit passes indépendantes

### Passe 1 — Catalogue et socle V4
**TERMINÉE, VALIDÉE.** Modèle immuable des 30 pouvoirs + calcul prix BigInt, niveaux, V4 ledger V8, validation, migration sûre des anciennes V8, compatibilité XP/Fame/Prestige absolu. Tests catalogue 30/196/178100 et invariants de dépense, import/export, corruptions et Prestiges. **Pas de nouveaux effets actifs** avant les passes dédiées.

**Validation passe 1 (22/11/2026) :** catalogue V4 complet (30 pouvoirs, 196 rangs, 178 100 Fame), registre V4 en micro-Fame inclus dans le montant total permanent `fameSpentMicros`, migration zéro coût idempotente avec backup dédié, import/export JSON et validateur V8 strict. Les six branches historiques et le Prestige absolu sont inchangés ; les nouveaux pouvoirs n'ont encore aucun effet gameplay ni UI. Vérification distante sur branche `fame-v4-pass1-validation` au commit `1c3916289784e1bcb216c70d0c39cc90dc7991e3` : `npm run verify:release` réussi, 458/458 tests Node, 120/120 tests UI, TypeScript et Vite build verts. Rapport GitHub Actions : https://github.com/Nighttug58/CAPITAL_IDLE/actions/runs/44961936431. Seuls les fichiers de la passe 1 sont intégrés sur main; le workflow temporaire reste limité à la branche de validation.

### Passe 2 — Interface Fame Shop V4
**TERMINÉE, VALIDÉE.** Sept catégories (Classique / Trading / Entreprises / Collections / Clics / Fiscalité / Prestige), 36 pouvoirs et 316 rangs, 30 cartes V4 avec effets théoriques clairement marqués inactifs jusqu'aux passes 3–8. Prix et progressions exacts, boutons ACHETER/MAX pour les six anciens bonus et les trente pouvoirs V4 ; achats en une seule mutation et sauvegarde V8 atomiques, strictement sans influence économique V4 pour l'instant. Navigation mobile horizontale des catégories et zone de cartes scrollable indépendamment, pieds de page fixes, ARIA/notice, ancien affichage et Prestige absolu conservés ; projection du multiplicateur Prestige absolu avant/après un achat (et après MAX), sans amplifier les pouvoirs V4.

**Validation passe 2 (22/11/2026) :** GitHub Actions sur branche `fame-v4-pass2-validation`, commit `9bec12a499a584db2cd3838f5dd8f550a876b37c`, rapport https://github.com/Nighttug58/CAPITAL_IDLE/actions/runs/44962997405. `npm run verify:release` **réussi**, 462/462 tests Node, 125/125 tests UI Vitest/jsdom, vérification TypeScript et build Vite réussis. `npm run build:root` **réussi** (suite complète rejouée, mêmes 462+125 tests). Pas de test graphique en véritable navigateur dans cette passe : la validation UI est jsdom + vérification CSS. Workflow temporaire non intégré sur main. Aucune modification des systèmes métier des passes 3 à 8.

### Passe 3 — Trading V4
**TERMINÉE, VALIDÉE.** Pouvoirs 01–07 : indicateur de tendance réellement observée (30–300 s) ; stop suiveur 25/20/15/10/5 % avec sommet par position ; bonus dividendes +1 %/rang et diversification des actions éligibles ≥1 % (50 bps/titre, plafond 100 bps/rang) ; Radar des news par paliers sur effets/expirations observés sans fuite de future news ; journal borné des 100 news suivies après déblocage (cours observés au début et à la fin) ; sorties programmées sur bénéfice réalisé après frais, fractions 25/50/75/100 % et jusqu'à 3 objectifs au rang 5. Paramètres par actif dans la modale Trading, analytique et journal dans l'onglet News.

**Intégrations métier :** même moteur exact V8 de vente, taxes, XP, bonus Trading et staking ; exécution une seule fois, priorité News auto-sell existantes → stop suiveur → sortie stratégique ; reçus exacts dans le rapport hors ligne, sans revente ni gain dupliqué. Nouvelles données V8 facultatives sur anciens snapshots, validation stricte anti-données falsifiées, permanence des réglages et du journal entre Prestiges, réinitialisation des peaks/ordres liés à une position fermée, aucun impact achat/vente sur les prix. Aucun effet des pouvoirs 08–30 encore activé. Les autres systèmes de trading et les six boosts Fame historiques restent inchangés.

**Validation passe 3 (22/11/2026) :** GitHub Actions sur branche `fame-v4-pass3-validation`, commit `b9d9a0b507e73f680171f823565effe3148927e1`, rapport https://github.com/Nighttug58/CAPITAL_IDLE/actions/runs/44964330165. `npm run verify:release` **réussi** (471/471 tests Node, 127/127 tests Vitest UI, contrôle TypeScript, build Vite). `npm run build:root` **réussi** (mêmes suites rejouées). Vérifications UI automatisées dans jsdom ; pas de test visuel dans un navigateur réel annoncé. Workflow temporaire conservé uniquement sur la branche de validation.

### Passe 4 — Entreprises V4
**TERMINÉE, VALIDÉE.** Pouvoirs 08–13 intégrés au moteur économique V8 et à l’écran Entreprises : **08** paire unique de deux entreprises détenues, +1 % de revenus par rang pour chacune (max +10 %) ; **09** réduction BigInt de 0,8 %/rang (max −8 %) sur le coût des futures améliorations et MAX, prix d’acquisition initial préservé, somme exacte des coûts individuels y compris au-delà du niveau 20 ; **10** 1 à 5 contrats simultanés, capital immobilisé en centimes exacts, durées 30/60/90/120 minutes, résultat déterministe persistant (succès +0/+2/+3/+5 %, échec −15 %), seuls les profits créditent XP/Fame et la taxe progressive, reçus bornés, sortie anticipée au Prestige à −15 % ; **11** cinq projets consommables par cycle (10 B$, 1 T$, 100 T$, 10 Q$, 1 AA$), +5 % de revenus pendant 30 minutes sur catégorie sélectionnée, plafond +15 % par catégorie, aucune récupération du coût ; **12** franchise +1 %/rang sur l’entreprise choisie, cooldown 30 min ; **13** conseil +3 %/rang sur l’entreprise choisie, cooldown 30 min.

**Garanties V8 :** revenus additifs V4 par entreprise (jamais amplifiés par le Prestige absolu), plafonnés à +100 % V4 ; un seul curseur d'accrual et découpage aux échéances de contrats et d'infrastructures ; fonctionnement pendant rattrapage hors ligne, taxes à 72 h et rechargements ; capital de contrat non doublé dans la richesse éligible aux PP (valorisation conservatrice de récupération à 85 % avant clôture) ; frais des projets non comptés comme revenu ou investissement récupérable. Avant chaque Prestige, liquidation des contrats restants sous pénalité et paiement des taxes selon les règles existantes. Les niveaux Fame restent permanents, mais sélections, contrats, projets et cooldowns du cycle sont remis à zéro. Sous-registre optionnel pour anciennes sauvegardes V8, validation stricte du JSON (BigInt canonique, niveau déverrouillé, catégories, timestamps, reçus et issue déterministe). Actions irréversibles soumises à confirmation, interface compacte responsive. Aucun pouvoir des passes 5–8 activé.

**Validation passe 4 (22/11/2026) :** branche isolée `fame-v4-pass4-validation`, commit `13c484942ba312bab2541eb25fc10ff2c42b2218`. GitHub Actions https://github.com/Nighttug58/CAPITAL_IDLE/actions/runs/44978434358 : `npm run verify:release` **réussi**, 480/480 tests métier Node, 131/131 tests UI Vitest/jsdom, TypeScript et build Vite réussis ; `npm run build:root` **réussi** avec répétition complète des mêmes tests. Aucune assertion de test réel dans un navigateur visuel (tests UI automatisés jsdom). Workflow de validation temporaire exclu du commit de main.

### Passe 5 — Collections V4
**À faire.** Pouvoirs 14–18 ; achats restauration/ailes, expositions et offres; compteurs permanents, coûts dynamiques, UI Collections ; aucune double Fame/récompense/bonus 100/100. Tests idempotence y compris sauvegardes pré-V4.

### Passe 6 — Clics V4
**À faire.** Pouvoirs 19–23 ; moteur de clic manuel séparé des ticks Auto Click, cooldowns, événements chance bornés, calcul des gains exact, aucun bouclage auto, UX légère. Vérification offline/rechargement.

### Passe 7 — Fiscalité V4
**À faire.** Pouvoirs 24–27 ; réserve indisponible sans deuxième solde, fiscalité à 72 h, paiements anticipés et réduction idempotente, échelonnement et liquidation au Prestige, écran statistiques. Tests BigInt et dettes négatives, import/replay.

### Passe 8 — Prestige V4 et audit final
**À faire.** Pouvoirs 28–30, renouvellement propre des cycles et conservation des niveaux, sélection spécialisation, défis; audit transversal de tous les effets combinés + caps, performance, migrations multi-Prestige, replay offline, achats simultanés; stabilisation UI. Exécuter **npm run verify:release** puis **npm run build:root**, commit après validation, confirmer GitHub Pages à partir des preuves disponibles. Ne pas prétendre avoir testé le navigateur s'il n'est pas disponible.

## 7. Définition de terminé

Pour **chaque passe** : relire `main` et son dernier état, modifier exclusivement les fichiers nécessaires, tests unitaires + UI ciblés, tests complets via `npm run verify:release` si exécutable, commit uniquement après validation. Documenter SHA/éventuel déploiement et changer le statut de la passe seulement si réalisée. Si aucune exécution du code n'est possible dans l'environnement courant, **ne pas déclarer une passe d'implémentation validée** et ne pas effectuer de commit risqué : livrer une modification isolée de planification et signaler explicitement la limite.

**Cette roadmap est une spécification. Aucun de ses nouveaux pouvoirs n'est réputé implémenté du seul fait de ce document.**
