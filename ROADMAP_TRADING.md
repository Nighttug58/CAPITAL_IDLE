# ROADMAP — CAPITAL_IDLE / Trading & News V1

Statut : **en développement — passes 1 à 5 terminées**  
Branche cible : **main**  
Dernière définition fonctionnelle : **13 novembre 2026**

> **Mode d'exécution :** à chaque « next », réaliser la **première passe non cochée**, vérifier le résultat, puis commiter le code **et la mise à jour de cette roadmap** sur main. Une passe = un objectif livrable et vérifiable. Ne jamais cocher une passe sans exécution et validation effectives. Si une passe est trop volumineuse, la scinder en sous-passes documentées avant de continuer. Ne pas refactoriser le clicker sans nécessité démontrée.

## 0. État actuel vérifié

- Application Vue 3 + TypeScript + Vite, déploiement statique GitHub Pages.
- Clicker existant : 50 niveaux, 49 améliorations, solde commun, total gagné et sauvegarde localStorage v3.
- Entrée UI dans **src/App.vue**, styles dans **src/style.css**, économie du clicker dans **src/game.ts**, persistance dans **src/persistence.ts**, tests dans **src/game.test.ts**.
- La navigation comporte actuellement seulement « Accueil » ; le Trading n'existe pas encore.
- Aucun **AGENTS.md** dans l'arborescence consultée.
- Ne pas modifier les règles existantes des clics, améliorations, niveaux ni l'ergonomie mobile de l'accueil.

## 1. Spécification fonctionnelle figée

### Navigation et actif

- Barre inférieure : **Accueil** / **Trading**. Trading : **Portfolio / Actions / Crypto / News**.
- **45 actifs** : **20 actions** d'entreprises parodiées (Nvideo, Mike, McGonagal, Simsung…), **15 cryptomonnaies** réelles de nom, **10 memecoins** de nom réel.
- Prix de référence initial inspiré d'un instantané vérifié de cours réels pour les actifs concernés, **sans synchronisation future obligatoire**. Toutes les données financières réelles sont des références d'équilibrage, non des prix à jour en permanence.
- Chaque actif a un **prix minimum**, un **prix maximum**, une **offre totale fixe**, une **quantité disponible à l'achat**, un prix et une quantité détenue. Le marché individuel ne partage pas les stocks entre joueurs.
- Cryptos : offre d'origine / offre maximale définie à la création, sans retirer burns ni tokens détenus (documenter les actifs sans plafond natif et choisir une règle de jeu explicite). Actions : quantité maximale d'actions prédéfinie. Les fractions sont autorisées avec précision contrôlée.
- Bornes crypto : **minimum = 5 % du prix de référence** ; **maximum visé = 500 % d'une référence haute**. Avant de figer les données, clarifier dans le catalogue la référence haute exacte (cours instantané, plus haut historique, autre) ; **ne pas inventer une source ou une formule définitive**. Actions : bornes fixes par entreprise à équilibrer.
- Les stocks ne sont ni recréés ni augmentés par des achats ; une vente restitue des titres à l'offre disponible. Le joueur peut théoriquement acheter la totalité de l'offre si son solde le permet.

### Moteur de marché

- Marché **individuel, purement simulé, très chaotique**, sans serveur, sans API de prix obligatoire et sans levier.
- **1 tick de marché toutes les 5 secondes réelles**. Chaque actif : bruit, tendance/momentum, régime, sensibilité aux événements et profil de risque. Actions moins extrêmes que cryptos, memecoins les plus extrêmes.
- Gains spectaculaires et pertes sévères possibles, sans remontée garantie ni oscillation prévisible exploitable. Les bornes fixes des cours sont toujours respectées.
- Les prix, événements et rendements continuent d'évoluer pendant la fermeture : **rattrapage déterministe et cohérent à la réouverture**, sans processus serveur actif.
- Historique des cours : **1 heure glissante maximum** par actif ; points de marché espacés de 5 s ou agrégation conservant les grandes oscillations (720 points / actif au plus si 5 s brut). Mini-graphiques simplifiés ; graphique détaillé limité à cette heure.

### Transactions, portefeuille et progression

- Modal d'actif : infos détaillées, historique graphique 1 h, prix et bornes, quantité disponible/détenue, événements liés ; sous-onglets **Acheter / Vendre**, saisie de quantité et boutons **25 % / 50 % / MAX**.
- MAX à l'achat = maximum abordable **frais compris**, sans dépasser l'offre restante. MAX à la vente = 100 % des unités détenues. Achat/vente exécuté au **prix affiché courant**, instantanément.
- Frais **sur achat et sur vente** : **actions 0,5 %**, **crypto 1 %**, **memecoins 1,5 %**.
- Portefeuille : positions détenues, quantités, valeur au cours actuel, coût moyen, P&L latent / réalisé, revenus de dividendes ; argent disponible **partagé avec le clicker**.
- Les dividendes et **bénéfices nets réalisés** (après coût de revient et frais) augmentent le total gagné pour les niveaux. **Ne jamais recompter le capital récupéré**, ni les plus-values latentes. Les pertes diminuent le patrimoine mais ne font jamais baisser le niveau déjà atteint.
- Calcul financier robuste : validation des fonds/stock, pas de doubles transactions, quantités/prix bornés, frais exacts, précisions monétaires maîtrisées, prix d'achat moyen incluant frais, robustesse contre NaN/Infinity, sauvegardes invalides et exploit achat/vente aller-retour.

### Dividendes des 20 entreprises

- **Taux annuel variable entre 1 % et 30 %**, propre à chaque action.
- Évolution **douce, continue et non instantanée**, fluctuation naturelle + influence progressive des News, haussière ou baissière ; jamais de saut immédiat de taux.
- Après la fin d'une News, le taux poursuit son évolution depuis sa valeur actuelle, **sans retour brutal**.
- Pour le paiement, utiliser **nombre d'actions détenues × prix de référence fixe × rendement annuel courant / 86 400** par seconde réelle (taux en fraction, ex. 0,08 pour 8 %).
- **24 heures réelles = 1 année de jeu** ; revenus crédités chaque seconde active et reconstitués correctement hors ligne (incluant évolution des rendements et événements pendant l'absence).
- Les cryptos et memecoins **ne versent pas de dividendes**.

### News : influence réelle sur le marché

- Onglet **News** en liste scrollable. **Une nouvelle toutes les 2 à 8 minutes** (intervalle aléatoire).
- Chaque événement reçoit lors de sa création **une durée d'influence aléatoire de 2 à 30 minutes** ; la durée devient fixe pour cet événement et **ne se re-tire pas** après sauvegarde/relance.
- Compte à rebours exact visible dans la liste et dans la modale détaillée. Un événement expiré cesse d'influencer ; la fin ne force pas le prix à inverser.
- News pouvant affecter : un titre, plusieurs actifs, un segment, tout le marché, un cours, un dividende ou les deux. Événements concomitants autorisés avec effets composés plafonnés.
- Modale News : titre, texte développé, actifs concernés, sentiment et fiabilité (rumeur/confirmé), niveau d'impact, scénarios possibles, compte à rebours, lien vers fiche d'actif.
- Événements avec phases narratives éventuelles (rumeur → développement → confirmation/démenti) ; événements positifs, négatifs, trompeurs ou sans grande conséquence. Les annonces ne garantissent **jamais** un profit.
- **Objectif de catalogue : 300 événements textuels distincts et soignés**, couvrant entreprises, résultats, innovations, scandales, macroéconomie, adoption/réglementation crypto, piratages, memes, hype et rumeurs. Ne pas confondre 300 véritables fiches avec 10 textes répétés par simple substitution de nom.
- Conservation : **10 dernières News expirées + toutes les News encore actives**, même au-delà de dix temporairement. Les effets et compteurs continuent hors ligne.

### Ergonomie et contraintes

- Design **premium sombre/or**, mobile-first, respect du 100dvh, safe areas et navigation fixe ; **seuls les panneaux de listes internes défilent**.
- Chaque ligne d'actif affiche nom, ticker, prix, variation et **sparkline** vert/rouge sur l'historique disponible.
- Les modales sont accessibles (fermeture, clavier, focus, mise en page mobile) et affichent les valeurs sans masquer les opérations essentielles.
- Sauvegarde locale versionnée, migration sans perte du clicker v1/v2/v3 ; taille bornée (1 h de cours, 10 News expirées, états nécessaires), sans écriture localStorage à chaque tick de chaque actif si non nécessaire.
- Aucune promesse d'anti-triche absolue : une partie 100 % locale et l'horloge de l'appareil ne sont pas sécurisables comme un serveur. Prévoir garde-fous sur sauts temporels, données absurdes et temps négatif.

## 2. Plan d'implémentation — exécuter dans l'ordre

### Passe 1 — Fondations et sauvegarde versionnée

- [x] Définir les types métiers séparés (catalogue, cotation, positions, lots/coût moyen, dividendes, news, simulation/horloge) ; ne pas tout mettre dans App.vue.
- [x] Définir une autorité unique sur l'argent, les gains réalisés et le niveau ; préserver le moteur de clic existant.
- [x] Établir l'état initial Trading et sa persistance/migration versionnée depuis la v3, avec validation/restauration robustes.
- [x] Tests : anciennes parties inchangées, sérialisation, initialisation d'une partie vide, données corrompues.
- **Livrable :** modèle Trading sauvegardable et rétrocompatible, sans nouvelle interface obligatoire.

**Validée le 13/11/2026** — commit de développement [040ce69](https://github.com/Nighttug58/CAPITAL_IDLE/commit/040ce69b739ec9839e853cc30d3b661a6ed74ae4). Les tests **npm test** (incluant 7 nouveaux tests) et **npm run build** ont réussi dans [GitHub Actions #43442174518](https://github.com/Nighttug58/CAPITAL_IDLE/actions/runs/43442174518). Le clicker existant utilise l'état v4 commun, sans changement visuel. Le stockage v3 est conservé pour migration et les fonctions d'achat/vente restent à faire en passe 5.


### Passe 2 — Catalogue des 45 actifs

- [x] Ajouter exactement 20 entreprises fictives et leurs tickers, profils, prix de référence, quantités, bornes, rendements initiaux.
- [x] Ajouter exactement 15 cryptos et 10 memecoins authentiques, prix de référence et offre de création/max, avec une fiche de provenance/datation des références.
- [x] Conserver les règles de calcul des bornes explicites, contrôler les incohérences d'actifs sans plafond naturel ; permettre la totalité du stock achetable.
- [x] Tests d'unicité, de nombres, de bornes et de quantités.
- **Livrable :** catalogue auditable, exploitable par moteur et UI.

**Validée le 13/11/2026** — [catalogue 1bea41b](https://github.com/Nighttug58/CAPITAL_IDLE/commit/1bea41bc87d2bdac6e9ca3b6fe28b89a5fc886d3), [correctif a479024](https://github.com/Nighttug58/CAPITAL_IDLE/commit/a4790242b3c2318a5dd9a3e7a8239b650c95f570). **npm test** et **npm run build** réussis dans [GitHub Actions #43443878397](https://github.com/Nighttug58/CAPITAL_IDLE/actions/runs/43443878397). Sources et quantités explicitées dans **TRADING_ASSETS.md**. Le plafond crypto V1 est provisoirement 5× le prix de référence du 13/11, et non 5× un record historique non vérifié ; cette convention pourra être affinée avant simulation.


### Passe 3 — Simulateur de cours chaotiques

- [x] Implémenter un PRNG reproductible à graine sauvegardée et des ticks de 5 s avec régimes, momentum, bruit, volatilité par catégorie et clamps des prix.
- [x] Stocker/réduire l'historique à 1 h par actif ; exposer des séries simplifiées pour sparklines sans compromettre le graphique détaillé.
- [x] Calibrer pumps/crashes, éviter le comportement mécaniquement profitable aux bornes et la saturation immédiate.
- [x] Tests déterministes, frontières, valeurs extrêmes, indépendance relative et fluidité de 45 actifs.
- **Livrable :** marché vivant et visualisable par données, hors intégration News.

**Validée le 13/11/2026** — [moteur 07415be](https://github.com/Nighttug58/CAPITAL_IDLE/commit/07415beefe2e4f81205d8ebb4ecd0e0b46dba181), **npm test** (9 nouveaux tests) et **npm run build** réussis dans [GitHub Actions #43445236181](https://github.com/Nighttug58/CAPITAL_IDLE/actions/runs/43445236181). Moteur pur `src/trading/market.ts` : PRNG xorshift32 sauvegardé, quatre régimes par actif, volatilité stock/crypto/memecoin, momentum, phases de pump/crash multi-ticks, respect des bornes sans retour imposé, 720 échantillons max par actif sur 1 h et sparklines réduites avec conservation des extrêmes. **La passe 4 doit encore brancher le scheduler et le rattrapage hors ligne** ; aucune animation en direct n'est encore visible dans l'UI.


### Passe 4 — Temps réel, rattrapage hors ligne et persistance maîtrisée

- [x] Scheduler propre (pas de timers multiples) + timestamp de dernière simulation, pause/reprise au retour sur l'onglet, visibilité du navigateur.
- [x] Reconstituer l'évolution entre deux sessions de façon reproductible ; stratégie de rattrapage **bornée en coût** pour les très longues absences, sans boucle non bornée ni effacement silencieux des gains.
- [x] Conserver une chronologie/cohérence des quotes et de l'heure glissante ; éviter les doubles ticks et les doublons après reload.
- [x] Garde-fous réalistes pour horloges reculées, sauvegardes absurdes et durée énorme ; tests (fermé 1 h, 24 h, longue absence, reload).
- **Livrable :** marché persistant sans backend, performant sur mobile.

**Validée le 13/11/2026** — [code b237f33](https://github.com/Nighttug58/CAPITAL_IDLE/commit/b237f33d85f4bea4dd311ef5eb988ec07ca75248), **40 tests OK** (dont 8 nouveaux) et **npm run build OK** dans [GitHub Actions #43446216141](https://github.com/Nighttug58/CAPITAL_IDLE/actions/runs/43446216141). `src/trading/clock.ts` rejoue au plus 128 ticks de 5 s par tranche et conserve le retard restant sans supprimer de ticks ; les données historiques dépassant une heure sont omises pendant le rejeu, sans changer les cours ou le PRNG. `src/trading/runtime.ts` exploite un seul timer, gère visibilitychange/pagehide/pageshow et sauvegarde les progrès à intervalles maîtrisés. Le clicker reste inchangé visuellement. Le calcul des **News et dividendes hors ligne** sera ajouté aux passes 6–7 ; cette passe couvre pour l'instant le **marché des cours**.


### Passe 5 — Transactions et Portfolio : moteur financier pur

- [x] Implémenter l'achat/vente au dernier prix, les frais 0,5/1/1,5 %, les quantités fractionnaires, offre restante, 25/50/MAX et coût moyen.
- [x] Créditer le même solde que le clicker ; affecter le niveau aux seuls **profits nets réalisés positifs**, jamais au capital restitué ni à la valeur non vendue.
- [x] Calculer positions, valeur de marché, P&L latent/réalisé et résultats de vente négatifs ; interdire fonds/titres négatifs.
- [x] Tests sur cas fractionnaires, frais inclus dans MAX, vente à perte, aller-retour, vente partielle, vente de 100 % du stock.
- **Livrable :** Trading économique complet mais sans écran final.

**Validée le 13/11/2026** — moteur financier [5b32e2d](https://github.com/Nighttug58/CAPITAL_IDLE/commit/5b32e2db741f65f75df2417c21ea542500d9fd6e), tests et documentation [b52ec71](https://github.com/Nighttug58/CAPITAL_IDLE/commit/b52ec716b18db86bf569592ca41b8a97132c0b6b), correction de précision [7583cd3](https://github.com/Nighttug58/CAPITAL_IDLE/commit/7583cd3d84576e93006998dcefb9e2822e590a1e) et test final [099f007](https://github.com/Nighttug58/CAPITAL_IDLE/commit/099f0078b7256e5a2db86a646357d9f4cbe337fc). **50 tests réussis** (dont 10 nouveaux) et **npm run build réussi** sur [GitHub Actions #43449139531](https://github.com/Nighttug58/CAPITAL_IDLE/actions/runs/43449139531) ; déploiement réussi. Calcul en centimes pour achats/ventes, frais des trois catégories, coût moyen incluant les frais, gestion du stock complet, raccourcis 25 %/50 %/MAX, reçus, portefeuille et profits réalisés cumulés. Les niveaux ne progressent que lorsque le bénéfice net réalisé cumulé dépasse son précédent record ; les pertes n'abaissent pas les niveaux. **Le clicker existant est inchangé**, les transactions sont disponibles en moteur pur ; l'interface Trading et les graphiques arrivent en passes 8–9. Règles détaillées dans `TRADING_ECONOMY.md`.


### Passe 6 — Moteur d'événements News

- [ ] Scheduler aléatoire 2–8 min ; événements à durée tirée une fois entre 2 et 30 min, timestamps/périodes/expiration reproductibles.
- [ ] Effets progressifs sur cours, actifs multiples et marché entier ; chevauchements sous contrôle ; phase rumeur/confirmation quand pertinent.
- [ ] Conserver 10 dernières expirées + tous les actifs ; support du rattrapage hors ligne et du lien vers les actifs.
- [ ] Commencer avec un sous-ensemble d'événements représentatifs, bien rédigés et testés ; aucun contenu inventé pour prétendre au total de 300.
- [ ] Tests sur compteur, expiration, chevauchements, reprise hors ligne, variation sous influence.
- **Livrable :** les News font réellement bouger les marchés.

### Passe 7 — Dividendes indépendants, dynamiques et hors ligne

- [ ] Implémenter une courbe de rendement distincte par action, bornée à **1–30 % annuels**, douce par tick, influencée progressivement par des News sélectionnées.
- [ ] Paiement chaque seconde depuis la quantité × prix de référence × taux courant / 86 400, précision des centimes et poussières fractionnaires.
- [ ] Intégrer revenus actifs et hors ligne au solde et au cumul gagné ; restituer correctement les changements d'événements sur longue absence, sans double paiement.
- [ ] Tests sur limites 1/30 %, gradualité, évolution après expiration, 24 h, cumul avec achats/ventes et reload.
- **Livrable :** revenus passifs variables et fiables.

### Passe 8 — UI Trading, listes et Portfolio

- [ ] Navigation Accueil/Trading sans casser l'écran du clicker ; quatre sous-onglets et scroll interne mobile.
- [ ] Listes Actions et Crypto (cryptos + memecoins), état de marché, mini-graphes 1 h, prix et variation.
- [ ] Portfolio avec positions, coût moyen, valorisation, P&L et dividendes par seconde.
- [ ] Composants Vue dédiés ; rendu réactif sans recalcul lourd, accessibilité et adaptation petites hauteurs d'écran.
- **Livrable :** navigation et consultation complètes.

### Passe 9 — Modales Trading et News, catalogue rédactionnel complet

- [ ] Modale actif : grand graphique historique, bornes, quantités, rendement/tendance pour actions, événements liés, formulaire Acheter/Vendre + 25/50/MAX, confirmations/erreurs utiles.
- [ ] Liste News scrollable, indication actif/expiré, compteur synchronisé et modale avec explication, scénario, fiabilité, lien actif.
- [ ] Porter progressivement le catalogue à **300 fiches éditoriales distinctes** validées (possible en sous-passes si nécessaire), sans données de cours ou annonces réelles présentées comme actuelles.
- [ ] Tests UI/interactions : transactions, fermeture modales, navigation, compteurs et retour du navigateur.
- **Livrable :** expérience Trading + News jouable de bout en bout.

### Passe 10 — Stabilisation, équilibrage et livraison

- [ ] Tester les 45 actifs sur longues simulations : pumps/crashes, taux 1–30 %, stock, rendements, absence de gain gratuit, bornes toujours respectées.
- [ ] Tester localStorage migration v1/v2/v3, réouverture et longues absences, fluidité smartphone, performance et limite de stockage.
- [ ] Vérifier responsabilités non dupliquées, absence de listeners/timers orphelins et qualité du code ; corriger défauts réellement constatés.
- [ ] Mettre à jour README : règles Trading, limites marché local/offline, exécution tests et fonctionnement GitHub Pages.
- [ ] Exécuter **npm test** et **npm run build** avec succès avant validation finale (ou documenter précisément tout blocage indépendant).
- **Livrable :** version Trading V1 stable et documentée.

## 3. Critères de fin de roadmap

- [ ] Les 45 actifs sont présents avec la bonne répartition.
- [ ] Le marché est chaotique, individuel, borné, reproductible et persiste hors ligne.
- [ ] On peut acheter/vendre des fractions, tout le stock disponible et utiliser les raccourcis 25/50/MAX correctement frais compris.
- [ ] Les dividendes fluctuent doucement entre 1 et 30 %, sont influencés par les News et crédités précisément en ligne/hors ligne.
- [ ] Une News apparaît toutes les 2–8 min, influe 2–30 min, affiche son compte à rebours, et le catalogue atteint 300 fiches distinctes.
- [ ] Historique des cours ≤ 1 heure ; News expirées ≤ 10, sans perdre les News actives.
- [ ] Les niveaux ne montent pas artificiellement à la revente de capital, les sauvegardes précédentes survivent.
- [ ] Interface mobile Accueil/Trading avec graphiques, modales, Portfolio, News ; tests et build OK.

## 4. Consignes pour les prochains « next »

1. Lire cette roadmap et les fichiers concernés **dans l'état actuel du dépôt**, ne pas s'appuyer sur des chemins ou commits supposés.
2. Sélectionner la première passe non cochée, faire la modification **réelle**, avec tests adaptés.
3. Ne cocher que les cases effectivement réalisées ; si le périmètre change, le documenter avant d'avancer.
4. **Commiter sur main** le code, les tests et cette roadmap, puis communiquer le commit, le bilan concret et la passe suivante.
5. Rester minimaliste : composants/modules selon leur responsabilité, sans bridges/fallbacks/wrappers superflus ; aucune dépendance lourde sans nécessité.
