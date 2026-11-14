# CAPITAL_IDLE — Roadmap Prestige (7 passes)

**État : passe 5 implémentée (5/7), passe 6 à faire ; tests et build à exécuter.**  
**Dépôt : Nighttug58/CAPITAL_IDLE — branche main**  
**Date : 14/11/2026**  
**Historique :** le commit initial de roadmap (`4e680fa`) est documentaire ; la passe 1 ajoute les contrats purs et tests (`ac0eb03`), sans modifier le moteur de jeu, la sauvegarde active ni l'interface.

## 0. Objectif et audit de l'existant

Le Prestige est une boucle de réinitialisation volontaire de l'empire financier, rémunérée en **Points de Prestige (PP)**. La boutique Prestige offre des mécaniques inédites, plutôt que de dupliquer les multiplicateurs de gains du Fame.

- **Fame** = progression et multiplicateurs économiques, déjà implémentés avec les collections et le Fame Shop.
- **Prestige** = nouveaux outils de trading, news, temps simulé, profondeur de marché, staking et automatisation.
- Les bonus Fame existants et les nouveaux bonus Prestige doivent rester indépendants : ne jamais multiplier les bonus Fame Shop par des multiplicateurs Prestige génériques.

### Vérification du dépôt main avant écriture

- Application **Vue 3 + TypeScript + Vite**, logique métier en fonctions pures et tests Node/Vitest (package.json).
- **Aucun AGENTS.md** relevé dans l'arborescence complète de main lors de l'audit du 14/11/2026.
- **Attention au nommage :** le dossier src/prestige/ est déjà celui du **Fame et des collections** ; CapitalState.prestige et PrestigeState contiennent l'XP, la Fame, les boosts et les objets. src/prestige/absolute.ts expose le bonus existant **Prestige absolu** (Fame Shop complet). **Il ne s'agit PAS du nouveau cycle de Prestige.** Ne pas écraser ni détourner ce contrat : créer une autorité distincte pour les PP / cycles (par exemple src/ascension/ et CapitalState.ascension), et clarifier les libellés en UI.
- **CapitalState v6** dans src/capital.ts ; stockage localStorage dans src/persistence.ts ; import/export JSON versionnés et validation stricte dans src/save-transfer.ts ; remplacement atomique de la sauvegarde et arrêt/reprise du runtime dans src/App.vue. Les migrations v1 à v5 et imports v4/v5/v6 sont en place.
- **XP/Fame :** src/prestige/state.ts crédite la Fame lors des niveaux, avec lastAwardedLevel actuellement lié au niveau du run. Une réinitialisation XP impose un **plus haut niveau récompensé global** distinct pour éviter de regagner la Fame des niveaux déjà parcourus, sans casser le validateur de sauvegarde v6.
- **Collections :** objets uniques conservés, Fame reçue une fois, valeur comptable visible dans Stats via src/economy/stats-overview.ts. **Exclure la valeur des collections conservées** du patrimoine donnant droit aux PP, sinon le joueur pourrait reprendre immédiatement des PP sans reconstruire l'économie.
- **Marché :** 20 actions + 15 cryptos + 10 memecoins ; prix et dividendes évoluent par tick de **5 s**, historique limité à **1 h**, flux News de **2–8 min**, durée des News **2–30 min**, influences prix/dividendes graduelles, cumul actuellement plafonné à ±1,25. Points d'entrée : src/trading/{market,news,clock,runtime,state,trades,dividends,types}.ts.
- **Liquidité actuelle :** src/trading/trades.ts applique frais, solde, quantité disponible issue de totalSupply et précision des unités ; **pas encore de profondeur de carnet ni de réserve de liquidité régénérable indépendante**. Ne pas confondre stock maximal de l'actif et liquidité négociable.
- **Fiscalité :** dette fiscale par source et collecte toutes les **72 h réelles**, taux actuellement **15 %**, trésorerie possiblement négative après prélèvement ; src/economy/{state,clock,fiscal}.ts. Les gains de trading positifs réalisés sont taxés ; pas d'achat à crédit.
- **Statistiques :** patrimoine net actuel = cash + valeur marché des titres + investissement comptable des entreprises + collections − taxes dues. Cette définition reste utile à Stats, mais nécessite une **assiette Prestige distincte**.
- **Rattrapage :** entreprises et fiscalité sont calculées par temps réel ; marché/dividendes utilisent un rattrapage borné. Import, reset, transitions d'onglets, visibilité et timers sont des points sensibles.

**Impératif pour les futurs next :** examiner le code actuel juste avant chaque passe, respecter les autorités existantes, et ne pas considérer une autre roadmap comme une source supérieure au code réel.

## 1. Contrat du Prestige — paramètres de conception

### Éligibilité et PP

- Premier Prestige et suivants : **niveau joueur au moins 100 sur le cycle courant** ET patrimoine Prestige éligible au seuil P0.
- **P0 sera fixé en passe 1 par simulation du jeu réel** ; ne pas introduire un chiffre arbitraire avant de mesurer l'économie au niveau 100. Il est stocké comme constante versionnée après arbitrage.
- **Patrimoine Prestige (USD fictifs)** = solde cash + valeur liquidable des titres détenus + valeur comptable investie dans les entreprises − dette fiscale. Ne jamais ajouter collections, Fame, PP, gains historiques, valeur de bots, ni somme des transactions. Évaluer le portefeuille une seule fois après rattrapage.
- **PP gagnés = floor(20 × sqrt(P / P0))**, pour P ≥ P0, avec protection contre nombres non finis/overflow. Exemples : P0 → 20 PP ; 4P0 → 40 ; 9P0 → 60 ; 16P0 → 80 ; 25P0 → 100 ; 100P0 → 200.
- La formule s'applique au patrimoine **du cycle qui sera entièrement consommé par la réinitialisation**, non aux possessions permanentes. Aucun achat/vente aller-retour ne crée de PP.
- Objectif indicatif d'équilibrage : boutique complète après **20–30 Prestiges** avec stratégies variées, à mesurer et corriger en passe 7, jamais présenté comme garanti.

### Réinitialisation et conservation

| Élément | Après Prestige |
| --- | --- |
| Cash, revenu cumulé du run, achats de clics, XP/niveau du run | Réinitialisés au départ normal |
| Actions, cryptos, memecoins, positions et profits réalisés du run | Réinitialisés ; nouveau marché / horloge / PRNG initialisés proprement |
| Entreprises et niveaux d'entreprises | Réinitialisés |
| News actives, ordres automatiques en attente, positions en staking et timers liés aux actifs | Clôturés / annulés sans remboursement supplémentaire, car les positions du run disparaissent |
| Fame disponible, Fame totale, boosts Fame, Prestige absolu, collections possédées | **Conservés** |
| Plus haut niveau déjà récompensé en Fame | **Conservé globalement** ; aucune Fame en double lors des nouveaux niveaux |
| PP disponibles, PP gagnés à vie, achats Prestige, nombre de cycles | **Conservés** |
| Statistiques historiques inter-cycles | **Conservées séparément**, avec stats du run remises à zéro |
| Dette fiscale | **Doit être intégralement réglée AVANT de valider** ; pas d'effacement |
| Échéance des 72 h | **Ne doit jamais être réinitialisée par le Prestige** ; le calendrier réel continue |

**Précaution fiscale :** régler d'abord les revenus/impôts échus, refuser un Prestige tant qu'une dette courante subsiste ; ne pas utiliser la fonction de reset général pour effacer le passif. Un paiement manuel normal peut respecter les règles actuelles de 72 h, mais l'acte Prestige lui-même ne doit jamais offrir de remise, de nouveau délai ou de double prélèvement.

**Transaction atomique :** écran de confirmation indiquant PP, actifs perdus, Fame préservée et fiscalité ; suspendre runtime, calculer et valider UNE fois, écrire un nouvel état complet, puis relancer. En cas d'échec de persistance, conserver l'ancien cycle intact. Protéger le double clic et les imports concurrents.

### Cohabitation avec Fame

- Préserver le module src/prestige/ et ses contrats actuels ; ne pas le remplacer par les PP.
- Faire évoluer le contrôle Fame global : conserver l'ancienne progression récompensée et ne créditer QUE les nouveaux records mondiaux de niveau (101+ si 100 avait déjà été atteint), avec calcul de Notoriété seulement sur ces nouveaux gains ; aucune Fame automatique lors d'un reset.
- Les objets de collection restent uniques et achetés une seule fois dans toute la vie de la sauvegarde ; ne pas rendre des objets déjà possédés rachetables.
- Le bonus existant **Prestige absolu** continue de dépendre de la Fame disponible et des 120 niveaux du Fame Shop ; ce n'est pas une monnaie PP.
- Ne pas interpréter le retour au niveau 1 comme une suppression de Fame ou une invalidité automatique de l'ancien ledger.

## 2. Catalogue final : 18 améliorations / 87 niveaux / 1 637 PP

**Prix par niveau n (à partir de 1)** = prix initial + (n−1) × incrément ; achats sans crédit ni rétroactivité. Les niveaux et dépenses se vérifient depuis un catalogue immuable. Toute amélioration est permanente entre les cycles.

| # | Amélioration | Niveau max | Prix niv. 1 | Incrément | Total PP | Effet au maximum |
| ---: | --- | ---: | ---: | ---: | ---: | --- |
| 1 | Auto Click | 20 | 1 | +1 | 210 | 20 clics/s automatiques |
| 2 | Auto Investisseur | 1 | 30 | — | 30 | achats automatisés paramétrables |
| 3 | Auto Trader | 1 | 50 | — | 50 | ventes automatisées paramétrables |
| 4 | Auto Entreprise | 1 | 25 | — | 25 | réinvestissement dans les entreprises |
| 5 | Événements prolongés | 4 | 10 | +6 | 76 | durée réelle des News ×2 (+25 %/niv.) |
| 6 | Marché extrême | 4 | 12 | +8 | 96 | pression des News ×2, hausses ET baisses |
| 7 | Fréquence médiatique | 10 | 3 | +2 | 120 | fréquence des News +50 % (+5 %/niv.) |
| 8 | Vision anticipée | 5 | 7 | +5 | 85 | fenêtre de prévision jusqu'à 30 s |
| 9 | Propagation médiatique | 1 | 50 | — | 50 | les News ciblées peuvent toucher un 2e actif |
| 10 | Radar de volatilité | 1 | 20 | — | 20 | classement des actifs les plus volatils |
| 11 | Ordres automatiques | 1 | 25 | — | 25 | ordres limites, Stop Loss, Take Profit |
| 12 | Frénésie boursière | 1 | 45 | — | 45 | +50 % de pression News pendant 60 s, cooldown 30 min réelles |
| 13 | Accélérateur temporel | 5 | 12 | +9 | 150 | vitesses sélectionnables ×1, ×1,5, ×2, ×3, ×4, ×5 |
| 14 | Liquidité institutionnelle | 10 | 4 | +3 | 175 | capacité de liquidité ×3 (+20 %/niv.) |
| 15 | Régénération de liquidité | 10 | 4 | +3 | 175 | reconstitution ×2,5 (+15 %/niv.) |
| 16 | Staking crypto | 1 | 40 | — | 40 | accès au staking des cryptos éligibles |
| 17 | Rendement de staking | 10 | 5 | +4 | 230 | récompenses en coins ×2 (+10 %/niv.) |
| 18 | Staking composé automatique | 1 | 35 | — | 35 | réinvestissement des gains toutes les 10 min |

**Totaux contrôlés : 18 entrées, 87 niveaux achetables, 1 637 PP.**  
Le **bonus ultime de Prestige**, débloqué après 87/87 niveaux, est une **extension de fin de parcours à spécifier et équilibrer dans la passe 7** : pas compris dans les 18 upgrades ni dans les 1 637 PP, et aucun multiplicateur Fame infini.

### Paramètres d'usage et invariants

- **Auto Click :** +1 clic/s/niveau ; gains et XP via l'unique opération métier, sans créer 20 animations ou autant de setInterval. Fonctionne seulement quand le jeu tourne activement, pas de clics hors ligne.
- **Automates :** paramétrage par whitelist d'actifs, budget/ordre, réserves cash, stop, objectifs de vente ; conditions prévisibles, erreurs explicites, aucune transaction pendant une sauvegarde remplacée. Les frais, impôts, liquidités, quantités et soldes s'appliquent aux bots comme aux commandes manuelles. Aucun profit garanti.
- **Ordres :** exécuter sur les cours simulés disponibles avec priorité déterministe, liquidités et frais ; ordres conservés au rechargement mais annulés lors d'un Prestige, jamais rejoués deux fois.
- **News :** événements positifs ET négatifs amplifiés ; idem impacts éventuels sur dividendes. Durée ×2 s'applique aux nouvelles annonces sans changer rétroactivement les dates d'annonces déjà lancées. La fréquence se calcule sur le temps réel (intervalle initial 2–8 min, réduit selon les bonus) ; éviter une avalanche à ×5. Conserver 10 news expirées visibles et toutes les actives dans des limites de sauvegarde ; ajuster la borne si nécessaire.
- **Anticipation :** vrai événement futur calculé de manière déterministe à partir du PRNG / annonce planifiée, sans consommer deux fois le hasard, ni garantir le mouvement effectif des cours. Valeur à l'écran calibrée 6 s par niveau, maximum 30 s.
- **Propagation :** ajouter un deuxième actif seulement pour les News « single », jamais dupliquer toute une News sectorielle, globale ou toute la bibliothèque. Sélection reproductible.
- **Accélérateur :** multiplie le nombre / le rythme de pas de **cours virtuels**, pas l'amplitude individuelle de chaque tick ; ne multiplie **ni** dividendes, entreprises, taxes, staking, cooldowns ni durée réelle des News. Bouton ×1 ↔ vitesse débloquée et sélecteur des vitesses accessibles.
- **Deux horloges obligatoires :** horloge de marché **virtuelle** (simulée) et horloge civile **réelle** pour news, dividendes, revenus entreprises, fiscalité, staking et cooldowns. Le moteur actuel utilise les mêmes timestamps : concevoir explicitement le mapping et la migration avant de l'accélérer. Éviter que cinq pas de marché ne multiplient accidentellement par cinq l'effet financier intégré d'une même news réelle. Le rattrapage hors ligne reste borné, déterministe, reprenable et compatible import/export.
- **Liquidité :** ajouter une profondeur négociable distincte de totalSupply, par actif, et un mécanisme de réapprovisionnement. Le stock total reste plafonné ; le bonus ×3 porte sur la capacité de liquidité, non sur l'offre totale. Définir une règle de slippage/impact mesurée ou une limite d'exécution ; éviter prix négatifs, dépassements de supply et profits gratuits d'aller-retour.
- **Staking :** initialement uniquement une sélection des 15 cryptos classiques (pas les 10 memecoins). Base illustrative **0,02 %, 0,04 %, 0,06 % par heure réelle**, selon l'actif ; niveau 10 double ces récompenses. Coins placés verrouillés ; déblocage après 5 minutes réelles ; récompenses en quantités de coins (et non USD directement), précision propre à l'actif, reliquat conservé, capital bloqué valorisé UNE seule fois dans le portefeuille et Stats.
- **Staking hors ligne :** limite de rémunération **24 h par reprise**, aucune accélération Prestige ; capital et gains conservés dans l'état persistent. Versement/compound par tranche de 10 min, sans timer par position. Contrôler la supply, les arrondis et les petits montants. Les coins gagnés n'accordent pas d'XP avant vente ; leur coût de revient doit rendre le profit réalisé et la fiscalité cohérents à la vente (base de coût nulle pour les coins récompensés, à définir/tester précisément).
- Les bonus de news et volatilité restent **risqués**, non des promesses de hausse ; maintenir des bornes de cours et des limites de pression explicites.

## 3. Roadmap d'implémentation — 7 passes

Une seule passe par **next**. **Passe 1 cochée après implémentation des contrats et tests le 14/11/2026 ; passes 2 à 7 non commencées.**

### Passe 1 — Architecture, contrats et calibrage

- [x] Revalider HEAD, AGENTS.md éventuels, fichiers réels, chemins de revenu et dépendances après cette documentation.
- [x] Fixer P0 à partir d'une simulation reproduisant niveau 100, cash, holdings, entreprises et collections, en visant le budget PP proposé.
- [x] Préparer les contrats de données dédiés au Prestige : currency PP, cumul gagné, cycles, niveaux, high-water Fame mondial, historiques de cycles, paramètres des automates, horloges réelles/virtuelles.
- [x] Définir les dépendances et responsabilités par module ; ne pas déplacer le Fame historique ni renommer silencieusement CapitalState.prestige.
- [x] Choisir le plan de migration v6 → v7 (ou extension v6 versionnée explicitement), validations de la sauvegarde et de l'import/export, anti-rollback, règles fiscales et collections.
- [x] Fixer les protocoles de test et références de comparaison avant implémentation ; garder le périmètre contenu.
- **Livrable :** architecture contractuelle et seuil P0 documenté/justifié, tests de forme si du code est ajouté. Pas de Prestige jouable encore.

### Passe 2 — Moteur de Prestige, économie et sauvegarde

- [x] Implémenter eligibility, richesse Prestige sans collections, formule des PP, achat des cycles et états refusés.
- [x] Rattraper les échéances, empêcher l'effacement de taxes et conserver la période réelle ; transaction de Prestige atomique / idempotente.
- [x] Réinitialiser uniquement l'économie du run, les portefeuilles, les entreprises, les news/ordres/stakes ; conserver Fame, bonus, collections et acquisitions Prestige.
- [x] Séparer niveau du run et record mondial de niveaux rémunérés en Fame, avec migration et conservation de l'historique.
- [x] Brancher sauvegarde, import/export, reset complet, migration des anciens fichiers et validation de PP non forgés (ledger des dépenses calculé depuis le catalogue).
- [x] Tests : 1er/2e Prestige, niveau <100, seuil, défaut cash, taxes impayées, erreur de stockage, double activation, import v4/v5/v6, replay sans récompense de Fame en double.
- **Livrable :** moteur métier de Prestige fonctionnel et persistant, sans boutique UI finale.

### Passe 3 — Boutique et écran Prestige

- [x] Ajouter un écran dédié **Prestige** et un point d'accès clair depuis l'Accueil, sans déplacer Stats de l'extrémité droite de la barre principale.
- [x] Catalogue fixe des **18 upgrades**, 87 niveaux, coûts du tableau, achats PP validés par moteur métier, blocage des niveaux max.
- [x] Afficher PP, cycles, patrimoine éligible, seuil et projection de gain PP, améliorations acquises et restant à acheter.
- [x] Modale de confirmation de Prestige : pertes du run, gains PP, maintien Fame/collections, état des dettes.
- [x] UI responsive smartphone/desktop, navigation retour/Escape, aucune régression Fame Shop/Collection/Stats.
- [x] Tests UI achats, max, solde, confirmation, refus, restauration.
- **Livrable :** parcours Prestige et boutique jouables ; effets des nouveaux bonus métier encore dépendants des passes suivantes.

### Passe 4 — Accélérateur, News et liquidités

- [x] Isoler temps réel / temps virtuel en restant déterministe en sauvegarde, replay et pause/reprise.
- [x] Accélérateur 5 niveaux : vitesses ×1/×1,5/×2/×3/×4/×5, activation désactivation sans réinterpréter le passé.
- [x] News : durée ×2, impact ×2 bilatéral (prix + dividende), fréquence +50 %, anticipation, propagation, radar, frénésie +50 % pendant 60 s et cooldown 30 min.
- [x] Introduire liquidité par actif, profondeur ×3, récupération ×2,5 ; relier achats manuels et ordres métier au même moteur, respect supply et frais.
- [x] Tests limites ±, double influence/cap, PRNG, rattrapage long, fiscalité 72 h stable, dividendes non multipliés, historique 1 h, dérive sans news artificiellement amplifiée à ×5.
- **Livrable :** nouveau comportement des marchés, volontairement plus stratégique et risqué.

### Passe 5 — Staking crypto

- [x] Définir liste blanche des cryptos stakables, rendement par actif (trois plages), écrans de dépôt/retrait, quantité liquide / verrouillée.
- [x] Débloquer Staking avec les PP, rendement +10 % par niveau jusqu'à ×2, auto-compound toutes les 10 min.
- [x] Gains par horloge réelle, retrait différé 5 min, hors ligne plafonné à 24 h de récompenses, reliquat et précision des unités.
- [x] Valoriser et taxer sans doublon : récompense de coins, coût de revient, ventes ultérieures, XP uniquement au profit réalisé ; protéger le stock et la supply.
- [x] Tests fractionnaires, absence/reprise/import, retrait pendant News, changement de prix, impossibilité de vendre des coins verrouillés, suppression des stakes lors d'un Prestige, non-accélération par ×5.
- **Livrable :** staking réellement jouable, persistant, sans exploitable duplication des coins.

### Passe 6 — Bots, ordres et capacités actives

- [ ] Auto Click : 1 à 20 clics/s sur session active avec même autorité de revenus/XP que clic manuel, sans spam d'animations, aucune accumulation d'intervalles.
- [ ] Auto Investisseur : liste d'actifs, budget, réserve cash, taille d'ordre, activation individuelle.
- [ ] Auto Trader + Ordres automatiques : prix limite, Stop Loss, Take Profit, seuils de gain/perte, ordre d'exécution déterministe.
- [ ] Auto Entreprise : achats/améliorations selon budget, conditions de déblocage et réserve.
- [ ] Intégrer au runtime unique et protéger reprise, visibilité, arrêt, reset/import, changements de stratégie et boucles d'ordres.
- [ ] Frénésie boursière contrôlable depuis l'interface ; timing et cooldown persistés en temps réel si non terminés à la passe 4.
- [ ] Tests frais, fiscalité, insuffisance de liquidité, solde négatif, cumul Auto Click/Fame, pas de double ordre ni achats sur anciennes sauvegardes.
- **Livrable :** automatisations pilotables et sûres, sans gain de ressources gratuit.

### Passe 7 — Équilibrage, audit et livraison

- [ ] Simuler 20–30 cycles, progression typique et extrême, comptabilité PP (1637), achats précoces, midgame, maximisation ; ajuster P0 et paramètres si nécessaire, documenter les écarts.
- [ ] Tester toutes les combinaisons Fame + Prestige absolu existant + news extrêmes + vitesse ×5 + Auto Click + staking + entreprises.
- [ ] Tests de résistance longues absences, PRNG, fonds/positions/staking, taxe 72 h, saturations en cents, liquidités, performance mobile, sauvegardes import/export/RESET.
- [ ] Spécifier puis décider l'**upgrade final après boutique complète** (hors 18 upgrades), avec coût, plafond et absence de boucle exponentielle incontrôlée ; n'implémenter qu'après validation des simulations.
- [ ] Mettre à jour README, documentation d'économie et cette roadmap ; exécuter npm test et npm run build, et vérifier pages/main/root si publication concernée.
- [ ] Conclure avec un bilan mesuré, les arbitrages et les limites non testées sur appareil physique.
- **Livrable :** Prestige stabilisé, équilibré, documenté et publiable.


## 3bis. Résultat de la passe 1 — audit, seuil et contrat

**Statut : terminée sur main le 14/11/2026.** Seuls un contrat TS pur, ses tests, le lanceur de tests et cette roadmap changent. **Aucun reset, PP crédité, nouvelle page ou nouvel automate n'est activé à cette passe.**

### Source et calibrage traçable

- Référence auditée : HEAD avant passe 1 = `4e680fa76871158940cd518daea88c8ecb0b0970` ; arborescence complète sans AGENTS.md. Le code constaté reste l'autorité pour le développement.
- Source XP : `getLevelStartThreshold(100) = 17 537 564` dollars d'XP de base (pas 100 M$ de niveau). Le joueur peut être niveau 100 avant d'être prêt à devenir Prestige : c'est voulu.
- Source entreprises : kiosque **75 000 $**, entrepôt **80 M$**, usine **220 M$**, centre commercial **500 M$**, laboratoire **1,2 Md$**. Le palier **100 M$** situe le premier Prestige dans l'économie industrielle, sans rendre obligatoires les groupes de 20–300 Md$.
- **P0 retenu pour les premiers cycles : 100 000 000 USD fictifs de patrimoine éligible**. C'est une valeur versionnée, révisable seulement par une décision explicite et des simulations en passe 7.
- **Snapshots économiques déterministes** dans `src/ascension/contracts.test.ts` : état de niveau 100 avec cash de 17 537 564 $ (non éligible), puis états à 110 M$, 1 Md$ et 1,6 Md$ de revenus déjà acquis, possédant actions Nvideo, entreprises selon leur catalogue et un objet de collection. Les achats passent par les **vraies fonctions métier** ; le patrimoine passe par le **vrai calcul Stats**, dont on retranche le livre des collections ; aucun héritage de collection ne produit des PP. Les rendements de référence obtenus restent autour de **20 / 63 / 79–80 PP**. Un achat d'action absorbe des commissions, de sorte que l'assiette finale n'est pas un chiffre inventé égal aux revenus initiaux.
- Ces snapshots **ne sont pas une partie chronométrée de zéro à 100 M$** et ne prouvent pas 20–30 cycles ; seuls les scénarios de prix, d'XP et de détention sont vérifiés ici. Le temps moyen par cycle, les bots et les multiplicateurs cumulés seront simulés en passe 7.

### Contrat technique retenu

- Nouveau domaine **`src/ascension/`**, distinct du Fame historique dans `src/prestige/`. Le nouveau `CapitalState.ascension` (passage **v7** en passe 2) contiendra `progress` (permanent) et `run` (temporaire).
- `progress` : PP disponibles et gagnés à vie, compteur de Prestiges, niveaux des 18 upgrades, **record mondial des niveaux déjà payés en Fame**, journal historique de cycles. `run` : bots, horloge marché virtuelle et date réelle de départ ; positions, ordres et staking seront rattachés au Trading de ce cycle avec une seule autorité chacun.
- **Migration v6 → v7** : `prestige` v6 est conservé comme état Fame, `ascension` reçoit un état vierge, `highestFameAwardedLevel` s'initialise à `prestige.lastAwardedLevel`, aucune Fame/PP rétroactive. Le validateur Fame doit accepter une XP de run revenue à 0 avec le record global conservé, sans attribuer deux fois les niveaux 1–100.
- **Anciennes versions** : migration locale v1–v6 ; import JSON toujours validé (v4/v5/v6 et v7), conteneur export versionné, validation stricte `lifetimePoints - availablePoints === coût total des achats PP calculé du catalogue`, niveaux et identifiants exacts, pas de nombres non sûrs, timestamps civils cohérents.
- **Protection import/reset** : une ancienne sauvegarde importée ne « fusionne » pas la monnaie PP avec une partie récente ; le joueur confirme le remplacement complet. Le reset complet supprime aussi PP/Fame. Aucune création de PP ou de Fame à l'import, et aucune restauration fantôme d'une ancienne clé locale après reset.
- **Règle fiscale** : un Prestige valide exige `taxesDueCents = 0` après rattrapage. Il ne relance jamais le calendrier réel des **72 h**. Les actifs du run ne sont ni vendus fictivement ni remboursés une deuxième fois ; aucun titre ou collection permanente ne se transforme en argent lors du reset.
- **Horloges** : `realAnchorMs` pour fiscalité/entreprises/staking/dividendes/News/cooldowns, `simulatedAtMs` pour cotations. L'accélérateur ne doit pas amplifier involontairement le drift ou l'intégrale de pression d'une news en rejouant cinq ticks pour une seconde réelle.
- **Testabilité** : code de calcul isolé, contrats immuables, `src/ascension/contracts.test.ts` branché dans `npm test` ; chaque futur step garde des tests purs Node, UI Vitest, migrations, fiscalité, replay, `npm run build` et limites de débit. La suite ne peut conclure « tests réussis » sans avoir réellement exécuté les commandes.
- **État des validations de cette passe** : vérification du contenu et des prix par lecture du dépôt ; calcul indépendant de la formule réalisé. **Suite complète `npm test` et `npm run build` non exécutée dans cette session** (GitHub accessible par connecteur, mais clonage/npm distant non accessibles). Aucun workflow GitHub Actions déclenché.


## 3ter. Résultat de la passe 2 — moteur, réinitialisation, sauvegarde v7

**Périmètre :** moteur métier et migration, sans bouton de Prestige dans l'interface. HEAD de référence au démarrage : `739295a` ; aucun AGENTS.md dans l'arborescence main. La racine GitHub Pages n'a pas été recompilée.

### Fonctionnalités intégrées

- `src/ascension/catalog.ts` : 18 identifiants et coûts déterministes (87 niveaux, 1 637 PP) + validateur de dépenses. Les achats utilisateur et leurs effets arrivent en passe 3 et suivantes.
- `src/ascension/state.ts` : sections permanentes/temporaires initialisées en v7, migration v6, validation stricte des PP, historiques (100 derniers cycles), horloges, settings et record Fame global.
- `src/ascension/engine.ts` : `performPrestige`, transaction métier refusable (niveau 100, 100 M$ hors collections, dette fiscale nulle, marché rattrapé, horloge sûre) et `commitPrestige` avec writer atomique ; second Prestige impossible sans regagner le niveau 100 et le patrimoine.
- `src/prestige/state.ts` : les nouveaux niveaux ne créditent de Fame que s'ils battent le **record mondial de niveaux**. L'XP et le niveau du run restent distincts ; aucune collection n'est rachetable.
- `src/capital.ts`, `src/persistence.ts`, `src/save-transfer.ts` : état v7, priorités v7 > v6 > anciennes, import v4/v5/v6/v7, validation intégrale, reset complet, aucune ancienne sauvegarde ressuscitée après reset. Le calendrier fiscal et les taxes déjà payées sont préservés pendant Prestige mais pas pendant RESET complet.
- Tests métier `src/ascension/engine.test.ts`, tests existants adaptés aux nouvelles clés v7, plus couverture UI de gestion des sauvegardes adaptée. Le programme de tests est inscrit dans `package.json`.

### Validation / limites explicites

- Vérification statique et audit des chemins d'état au dépôt GitHub. Les résultats des **tests Node/Vitest** et du **build Vite/vue-tsc** ne peuvent pas être attestés dans cette session : le dépôt est accessible par connecteur GitHub, sans clone npm utilisable ; **aucun workflow payant déclenché**.
- Avant la passe 3, exécuter `npm test` puis `npm run build` sur un environnement avec dépendances et résoudre tout échec avant d'activer la boutique. Les tests nouvellement écrits ne sont **pas** des résultats d'exécution.
- Pas de bouton Prestige, pas d'auto-click, pas de vitesse de marché ni staking à cette étape. L'interface publique compilée à la racine n'a pas changé.


## 3quater. Résultat de la passe 3 — boutique Prestige dédiée

**Statut : code et tests écrits, commités sur main.** Vérification de l'arborescence au HEAD précédent `96116aa` et absence de `AGENTS.md`. Le build du site statique à la racine n'a pas été publié.

- `src/ascension/shop.ts` : achat métier pur avec vérification des 18 identifiants, niveau attendu, max, solde PP, coût arithmétique, absence de mutation en cas de refus. Ledger `pointsGagnés − pointsDisponibles = coûtCatalogue(desNiveauxAchetés)` vérifié avant achat. Aucun Fame, cash ou XP modifié par un achat PP.
- `src/ascension/presentation.ts` : texte et catégories UI distincts de l'autorité des prix (`catalog.ts`), 18 fiches réparties en 5 rubriques avec les passes d'activation des effets (4, 5, 6).
- `src/components/PrestigeScreen.vue` : page complète à défilement indépendant, solde PP, cycles, progression du catalogue, seuil de patrimoine, niveau requis, taxes dues et confirmation `PRESTIGE`. Retour avec focus, touche Escape, modal responsive, notifications d'achat/erreur. Les effets non encore implémentés sont clairement indiqués.
- `src/App.vue` : bouton d'accès depuis Accueil, navigation principale inchangée (Stats à droite), purchases exécutés par la logique métier et enregistrés via `replaceWholeSave` (arrêt du runtime + remplacement atomique). Prestige déclenché via `commitPrestige`, même writer atomique ; en cas de backlog, réveil du runtime et message explicite ; en cas d'échec de stockage, ni PP ni nouveau cycle en mémoire.
- `src/style.css` : styles propres au Prestige, page scrollable smartphone/desktop, confirmations lisibles et responsive faible hauteur.
- `src/ascension/shop.test.ts` et `src/components/ascension-ui.test.ts` : couverture du catalogue, achats et prix, niveaux obsolètes, soldes insuffisants, import/export v7, confirmation, reset, conservation Fame, focus, navigation et styles. `npm test` / `npm run test:ui` sont mis à jour.
- `src/components/StatsScreen.vue` : message d'import compatible avec v7.

**Limite de validation :** tests Node/Vitest et `npm run build` non exécutés dans cet environnement sans copie clonable du dépôt et sans accès npm réseau. Il est interdit de déclarer le déploiement ou la réussite des tests sans exécution réelle. Les effets de jeu des 18 upgrades sont hors périmètre et ne sont pas activés tant que les passes suivantes ne les implémentent pas.


## 3quinquies. Passe 4 — séparation des horloges, news et profondeur de marché

**Portée :** code métier et UI source modifiés sur `main`. Aucun workflow GitHub Actions déclenché, aucun artefact GitHub Pages (racine main) recompilé dans cette session. **Tests ajoutés mais non exécutés** faute d'accès aux dépendances npm et au dépôt clonable dans le conteneur de cette conversation.

### Marché, horloges, évolutions

- `src/trading/dividends.ts` exploite `ascension.run.marketClock` comme **frontière virtuelle cumulée** : une seconde réelle ajoute 1/1,5/2/3/4/5 secondes de temps de cours, le nombre de ticks étant dérivé des quanta virtuels de 5 000 ms. Le pas réel des dividendes demeure 1 seconde ; les variations du rendement restent sur une cadence autour de 5 secondes réelles, indépendante du nombre de ticks de prix. Les anciens états v7 dotés d'une horloge virtuelle dormant depuis la passe 2 sont réancrés à leur dernière seconde réelle traitée.
- `src/trading/market.ts` accepte un timestamp **réel** pour les ticks virtuels supplémentaires, tout en conservant exactement le comportement des appelants historiques sans options. La pression prix des news est divisée par la vitesse sélectionnée pour éviter l'effet secondaire `×5 vitesse = ×5 impact`. Les 720 points d'historique correspondent toujours à **une heure réelle** ; au-delà d'un tick/s les points ne sont conservés qu'à un pas réel de 5 s. Les quotes restent bornées.
- `src/ascension/market-effects.ts` contrôle les vitesses déverrouillées, protège contre un changement en plein rattrapage, active Frénésie (+50 % pendant 60 s, cooldown réel de 30 min) et expose preview et radar. Le verrou de la Frenzy est persistant et vérifié à l'import.
- La fiscalité, les entreprises, les cooldowns et le versement des dividendes conservent leur horloge réelle : aucun changement au contrat des 72 h et pas de crédit fictif lors d'une accélération.

### News

- `src/trading/news.ts` : durée des événements nouveaux `×(1 + .25 × niveau)` jusqu'à **×2** ; puissance symétrique en hausse/baisse et sur pression dividendes jusqu'à **×2** ; intensité Frénésie `×1,5` supplémentaire (plafonnée à 3). Fréquence `×(1 + .05 × niveau)` jusqu'à **+50 %**, horodatée en temps réel, **indépendante de la vitesse virtuelle**.
- Propagation additionnelle **uniquement pour les news `single`**, à un second actif distinct du même univers, sans doubler les news globales, sectorielles ou par catégorie.
- Vision anticipée : annonce future **choisie une seule fois** à la planification, stockée dans `trading.upcomingNews` et affichée dans sa fenêtre de 6–30 s ; voir l'annonce ne la relance pas ou ne consomme pas de PRNG en plus. Message de simulation, pas garantie de résultat financier.
- Le simulateur historique `advanceNewsTick` sans options garde sa signature et ses comportements de référence. Les durées de 60 min des news Prestige sont acceptées par le validateur, le plafond de base reste 30 min.

### Liquidité et UI

- `src/trading/liquidity.ts` : **profondeur par actif, séparée de `totalSupply`** et par sens (buy/sell), base **0,001 % de la supply**, capacité finale ×3, recharge de base **10 % de capacité/minute réelle**, vitesse de recharge finale ×2,5. Calcul paresseux au moment d'un ordre, sans timer indépendant ; restitution totale après 10 minutes réelles à niveau zéro.
- `src/trading/trades.ts` refuse les ordres dépassant la liquidité (`insufficient-liquidity`) et consomme la profondeur **avec les mêmes garanties que commissions, précision et supply**. `getMaximumBuyQuantity` et les boutons de vente MAX tiennent compte du sens de la liquidité ; les tests qui autorisaient l'achat de toute la supply en un clic ont été révisés.
- `src/trading/types.ts` et `src/trading/state.ts` : sauvegarde optionnelle des pools de liquidité et de la News préannoncée ; validation des bornes, supports d'import v7 précédents sans pool, sans inflation de ressources.
- `src/components/PrestigeScreen.vue` : sélecteur de vitesse, activation Frénésie et indication de recharge. `NewsPreview.vue` : Vision anticipée. `TradingScreen.vue` : radar classé selon les échantillons de volatilité réels. `AssetDialog.vue` : liquidité achat/vente et messages d'erreur. `src/style.css` : responsive et accessibilité du nouveau panneau.
- `src/ascension/market-effects.test.ts` et `src/components/market-upgrades-ui.test.ts` : nouveaux tests domaine/UI ; `src/trading/trades.test.ts` actualisé et scripts `npm test` / `npm run test:ui` étendus. **Exécution non attestée : ne pas déclarer la passe vérifiée tant qu'ils ne tournent pas.**

**Suite :** valider une exécution réelle de `npm test` + `npm run build` avant tout déploiement de fichiers compilés à la racine ; vérifier en particulier rattrapage ×5 et anciennes sauvegardes v7, puis démarrer le Staking en passe 5.


## 3sexies. Résultat de la passe 5 — moteur Staking et UI

**Portée :** branche main, ajouts métier, sauvegarde v7 compatible, trading, interface et tests ; pas de compilation ni de publication GitHub Pages effectuée.

### Contrats et économie

- `src/trading/staking.ts` : whitelist de **9 cryptos** classiques (ETH/BNB/TRX 0,02 %/h ; SOL/ADA/LINK 0,04 %/h ; AVAX/SUI/UNI 0,06 %/h) ; minage et récompenses au temps **réel**. Les taux sont **fictifs**, exprimés en pourcentages par heure réelle et distincts des rendements financiers réels.
- `src/trading/types.ts`, `src/trading/state.ts` : sous-ledger persistant `staking` par actif dans `TradingState` (jamais de portefeuille secondaire). Quantité bloquée, en déblocage, récompenses réservées à capitaliser, reliquats de sous-unités, récompenses tenues à coût nul, sous-lots de récompenses verrouillées/en déblocage, cumul d'émissions et horodatage réel. Validation des formats, quantités, précision, cohérence des coins détenus et champs de réservation.
- Dépôt valide seulement les unités **non verrouillées** du portefeuille ; retrait demandé = principal sorti de la rémunération, en attente **5 minutes réelles**, libéré automatiquement. Une seule demande par actif à la fois. Ni le dépôt ni le retrait ne créent du cash ou de l'XP.
- `settleStaking` règle au plus **24 heures réelles par reprise**, puis pose le curseur à l'heure présente ; opération idempotente, sans double-paiement. Les reliquats sous la précision du coin sont conservés. Le multiplicateur **Rendement de staking** (+10 %/niveau jusqu'à ×2) agit sur les rewards en coins ; le marché accéléré n'affecte jamais l'horloge staking.
- Auto-compound : après achat de l'upgrade, les récompenses sont réservées puis intégrées aux coins stakés à chaque borne de **10 minutes réelles** ; aucune seconde minuterie. Les unités auto-capitalisées restent bloquées.
- Chaque coin récompensé rejoint **une seule** entrée du portefeuille Trading `position.quantity`, sans créditer cash, XP, Fame ou fiscalité à ce stade. Sa quantité est bornée par `totalSupply`, et son coût d'acquisition supplémentaire est **zéro**. À la vente, les lots récompensés **liquides** passent en priorité avec base de coût nulle ; le coût de revient des coins achetés est préservé. Les mêmes frais, taxe différée et XP sur bénéfice réellement réalisé s'appliquent que pour les ventes normales. Les récompenses stakées ne sont jamais disponibles à la vente avant leur retrait.

### Intégration et migration

- `src/trading/runtime.ts` calcule la rémunération à **l'heure réelle** lors de chaque reprise et tick runtime, indépendamment des 256 secondes de replay des cours/dividendes, sans rallonger exponentiellement les absences.
- `src/trading/trades.ts` limite les ventes et MAX aux seuls coins liquides ; les coins en staking comptent toujours pour le portefeuille et Stats, sans double comptage. Les récompenses vendues sont retirées du ledger et leurs bénéfices prennent la voie fiscale existante.
- `src/save-transfer.ts` accepte les anciennes sauvegardes **v7 sans `staking`**, ajoute un ledger vide déterministe sans générer de coins, valide les droits Prestige et rejette les réservations incohérentes. Aucune version fiscale ou Fame n'est réinitialisée par le staking. Le Prestige existant réinitialise le Trading entier, donc toutes les positions, récompenses, stocks et locks staking disparaissent avec le run.
- `src/components/StakingPanel.vue`, `src/components/TradingScreen.vue`, `src/components/AssetDialog.vue`, `src/App.vue`, `src/style.css` : onglet Staking visible uniquement après le déblocage de 40 PP, liste des cryptos éligibles, soldes détenus/disponibles/bloqués, rendements, récompenses, dépôt, retrait, délai et capitalisation, responsive PC/mobile. Chaque action doit passer par une sauvegarde atomique réussie avant confirmation UI.

### Validation ajoutée / à confirmer

- Tests Node **`src/trading/staking.test.ts`** : whitelist, paliers, absence de gain en cash/Fame sur versement, blocage des ventes, valorisation unique, récompenses et vente à coût nul + taxe/XP, retrait 5 min, plafond 24h, idempotence, multiplication Prestige, capitalisation 10 min, validations/imports, reset du cycle.
- Tests Vue **`src/components/staking-ui.test.ts`** : absence de l'onglet avant achat, intégration au Trading, dépôt/retrait/solde, affichage mobile.
- Mise à jour de `package.json` ; aucun workflow payant déclenché. **`npm test`, `npm run test:ui` et `npm run build` NON exécutés ici** : ce commit ne constitue pas une preuve de compilation ou d'équilibrage final. Vérifier la suite et la performance du replay avant déploiement.

## 4. Definition of Done (obligatoire à chaque passe)

1. Fichiers et règles réellement audités au HEAD du moment ; ne pas modifier hors périmètre sans raison.
2. Fonctions pures, état serialisable, aucune duplication d'autorité monétaire, fiscale ou de Fame.
3. Tests nouveaux ou adaptés sur cas normaux, refus, migration, horloge et sauvegarde.
4. Exécuter **npm test** et **npm run build** lorsque l'environnement le permet ; signaler explicitement toute validation non exécutée. Ne pas dépendre de GitHub Actions payantes.
5. Cocher **uniquement la passe effectivement terminée**, avec commits, preuves de tests et limites.
6. **Commit sur main** du code, des tests et de ce document après validation ; aucun commit de code anticipé sur le simple mot « next ».

## 5. Journal des passes

| Passe | Statut | Commit | Notes |
| --- | --- | --- | --- |
| 1 — Architecture | ☑ Terminée | `ac0eb03` | P0 = 100 M$, contrats purs et tests ajoutés |
| 2 — Moteur | ☑ Implémentée | commit de passe 2 | Moteur, v7, Fame et tests ; exécution de la suite non vérifiée |
| 3 — UI Shop | ☑ Implémentée | commit de passe 3 | Page, achats PP, confirmation, tests ajoutés ; exécution non vérifiée |
| 4 — Marché | ☑ Implémentée | commit de passe 4 | Horloge virtuelle, news, liquidité et UI ; suite non exécutée |
| 5 — Staking | ☑ Implémentée | commit de passe 5 | Staking réel, reward lots, retraits, auto-compound et UI ; tests non exécutés |
| 6 — Automates | ☐ À faire | — | Exécution sûre |
| 7 — Finalisation | ☐ À faire | — | Tests / bilan / boost ultime |

**Suite immédiate :** au prochain « next », tenter en priorité l'exécution de `npm test` et `npm run build` dans un environnement disposant des dépendances ; puis commencer **la passe 6 seulement** (Auto Click, bots et ordres automatiques).
