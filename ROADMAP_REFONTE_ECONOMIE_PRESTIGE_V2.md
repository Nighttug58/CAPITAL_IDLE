# CAPITAL_IDLE — Roadmap de refonte économique & Prestige V2 (7 passes)

**Dépôt :** Nighttug58/CAPITAL_IDLE · **branche :** main  
**Date de conception :** 16 novembre 2026  
**Statut :** PASSES 1 ET 2 VALIDÉES — 2/7 passes terminées. Les passes 3 à 7 sont à faire.
**Suivi 16/11 — passe 1 :** moteur actif V8 branché dans `src/App.vue` (cash, clic, trading, staking, entreprises, dividendes, fiscalité, XP/Fame, Prestige, collections et achievements) via `src/exact-*`. Sauvegarde canonique `capital-idle-save-v8`, valeurs monétaires et positions exactes sérialisées en chaînes décimales, import des versions v4–v7 et migration locale v1–v7 avec conservation des originaux et sauvegarde de secours v7. Le code v7 reste une projection UI en lecture seule et une compatibilité d'import ; jamais une source de paiement ou de sauvegarde. Suite métier Node, suite UI Vitest et build TypeScript/Vite exécutés avec succès. **Passe 2 désormais terminée (voir suivi ci-dessous).**
**Suivi 16/11 — passe 2 :** offre illimitée sur les 45 actifs, y compris depuis les saisies textuelles Trading, staking et ordres automatiques V8 ; le prix d’exécution reste le cours affiché (aucun slippage/impact) et les frais originaux demeurent. Les prix min/max déclenchent des événements persistés : contact exact de la borne, 5–10 minutes **réelles** de plateau, puis retournement de 1–3 minutes (actions 3–8 %, crypto 8–20 %, memecoins 20–50 %). Même délai réel à vitesse ×1 et ×5 et pendant le replay offline. Les contrôles V7 et les validations V8 acceptent les quantités au-delà de l’offre historique ; les métadonnées `totalSupply` restent uniquement informatives. Tests métier, UI et build validés. **Passe 3 non commencée.**
**Référence initiale :** main au commit 9f524b85dc8242d2e9815de8ffe0115e45acba05.  
**Usage :** chaque commande « next » lance exactement la passe suivante, avec audit du code à jour, changements, tests, commit et bilan. Ne pas considérer les anciennes roadmaps comme tâches en attente.

## A. Résultat de l'inspection du code

- Arbre Git complet vérifié, non tronqué : **aucun AGENTS.md** à la racine ou en sous-dossier.
- Stack actuelle : Vue 3, TypeScript, Vite, tests Node (node --experimental-strip-types --test) et Vitest/jsdom ; commandes dans package.json : npm run test, npm run test:ui, npm run build, npm run verify:release, npm run build:root.
- Sauvegarde version **7** : src/capital.ts, src/persistence.ts, src/save-transfer.ts ; exports JSON versionnés, validations strictes, remplacements atomiques ; compatibilité ancienne v4/v5/v6 et clés localStorage v1–v7.
- src/money.ts et la majeure partie du domaine utilisent Number / Number.MAX_SAFE_INTEGER et des centimes numériques ; les bonus, revenus, statistiques, impôts, XP, PP, contrôles d'achat et transferts se bloquent déjà à de grandes valeurs.
- Trading : src/trading/{types,catalog,trades,state,market,clock,news,dividends,staking,runtime,presentation,order-ui}.ts ; les contraintes totalSupply/getAvailableSupply, les conversions de quantités, le staking et les validateurs sont interdépendants. Le marché conserve les prix min/max, tick 5 s, seed déterministe, historique 1 h.
- News : src/trading/news.ts ; intervalles programmés **5–10 minutes**, durée **5–30 minutes**, maintien d'au moins une news directionnelle active ; pression cours et dividendes. Le code exclut actuellement certaines news globales baissières : ne pas en modifier la logique dans cette refonte.
- Entreprises : src/economy/{catalog,enterprises,state,clock,stats-overview,fiscal}.ts ; 20 entreprises, niveau max 20, ROI brut initial 8–64 h, revenu par microdollar/s, rattrapage offline et fiscalité à 72 h réelles.
- Accueil : src/App.vue + src/style.css ; conteneur home-progression, XP, amélioration clic, Boosts. Auto Click Prestige actuel dans src/ascension/automation-runtime.ts.
- Fame : src/prestige/{state,shop,catalog,bonuses,absolute,collections}.ts. Le « Prestige absolu » est un bonus Fame distinct des cycles Prestige. Fame Shop valide une comptabilité cumulative stricte ; l'attribution de Fame aux niveaux dépend du meilleur niveau historique.
- Cycles Prestige : src/ascension/{contracts,catalog,presentation,shop,state,engine,market-effects,automation-*}.ts et components/{PrestigeScreen,AutomationPanel}.vue. Le catalogue comporte 18 améliorations, 87 niveaux, coût théorique 1 637 PP. Deux bonus de liquidité sont déjà non achetables, mais restent inscrits dans le registre des niveaux et dépenses.
- UI News : src/components/{TradingScreen,NewsPreview,NewsDialog}.vue ; richesse effective dans src/economy/stats-overview.ts : cash + portefeuille au cours du marché + valeur comptable des entreprises + collections − dette fiscale.
- Documentation historique conservée, dont ROADMAP_PRESTIGE.md : elle décrit l'ancienne conception et **ne doit pas prévaloir sur les décisions V2**.

## B. Contrat produit à respecter — décisions consolidées

### B1. Richesse et trading
1. **Pas de plafond économique arbitraire** pour cash, sommes investies, valorisation, revenus, taxes, XP, Fame, PP et quantités détenues. Les limites physiques du navigateur demeurent ; les opérations normales doivent éviter Number.MAX_SAFE_INTEGER, Infinity, NaN, arrondis destructifs, doubles paiements et gels de sauvegardes.
2. Abréviations FR choisies pour le jeu : K (10³), M (10⁶), B (10⁹), T (10¹²), Q (10¹⁵), QQ (10¹⁸), AA (10²¹), AB (10²⁴), AC (10²⁷), etc. Après AZ → BA, … ZZ → AAA, AAB… ; séquence sans suffixe final codé en dur. Affichage compact seulement ; aucune perte de précision en stockage.
3. Trading **inchangé sur sa philosophie** : même prix affiché pour une opération, frais actuels (actions 0,5 %, cryptos 1 %, memecoins 1,5 % par côté), quantité limitée uniquement par cash positif disponible ou titres réellement possédés/libres ; **aucun slippage, impact de marché, profondeur de carnet, plafond de volume, offre totale, throttling des gros ordres ou frais additionnels**.
4. Conserver les min/max de prix de chaque actif. Une montée/descente qui approche sa borne dans sa direction doit **atteindre exactement la borne** ; y rester **au moins 5 minutes réelles** (cible variable 5–10 min), même en accélération ×5 et après rechargement ; puis partir dans un **retournement rapide opposé** sur environ 1–3 min, paramétré par classe (stocks 3–8 %, cryptos 8–20 %, memecoins 20–50 %) sans franchir les bornes. Les prix restent exacts pendant le palier ; les achats et ventes restent libres à la borne. Le comportement crée volontairement des opportunités très profitables : **ne pas inventer de contre-mesure anti-arbitrage**.
5. Trading news normal, frais, dividendes volatils 1–30 %, staking, taxe 15 % et calendrier fiscal 72 h réelles conservés, sauf adaptations de représentation numérique et des nouveaux pouvoirs explicites.

### B2. Entreprises, XP, Fame
6. Tous les niveaux d'une entreprise doivent rester achetables sans plafond fixe (une entreprise enregistrée une fois par ID, puis **améliorations illimitées**). Coût et rendement calculés à la demande, sans tableau pré-généré infini ni explosion exponentielle fatale.
7. ROI brut d'acquisition cible : petits commerces 10–20 min ; locaux 20–35 min ; services 35–60 min ; industrie 1–2 h ; majeures 2–4 h. Revaloriser les rendements et milestones, garder la fiscalité et le revenu offline. Les upgrades doivent conserver un intérêt économique aux niveaux très élevés.
8. XP de base **1 XP par dollar éligible** avant bonus, avec courbe de seuils nettement plus dure : cible environ ×5 niveaux 1–50, ×10 niveaux 51–100, ×25 niveaux 101–200, puis progression soutenue au-delà. Construire une **courbe monotone continue**, sans multiplier arbitrairement un même seuil à plusieurs reprises ; préserver niveau/fraction des anciennes parties via migration versionnée et testée.
9. Boutique Fame : 6 branches de 20 niveaux et effets historiques maintenus sauf arbitrage ultérieur ; prix global nettement plus élevé (cible 150–200 k Fame pour 120 niveaux contre 24 650 actuellement), premières tranches environ ×5 et fin de progression plus coûteuse ; achats existants non refacturés.
10. Chaque Prestige remet à **zéro** la Fame disponible ET la Fame gagnée/cumulée du cycle affichée ; XP revient au niveau 1. **Les niveaux des boosts Fame Shop achetés et collections acquises restent permanents.** Reprendre la Fame lors des nouveaux niveaux **à chaque cycle** (pas seulement un nouveau record historique) ; empêcher les collections déjà achetées de créditer leur Fame une seconde fois. Le record absolu des niveaux reste conservé uniquement pour historique/achievements, pas pour bloquer la Fame de cycle.
11. Séparer impérativement le **ledger permanent Fame déjà dépensée** et les compteurs Fame du cycle. Conserver l'équation comptable sans exiger que le compteur de cycle réinitialisé égale les achats réalisés dans tous les cycles. Le multiplicateur « Prestige absolu » suit la Fame **actuellement disponible** : après le reset, il retombe à son facteur de base tant que la Fame n'est pas regagnée ; aucun débordement.

### B3. Prestige et Auto Click
12. Auto Click Prestige disparaît. Remplacer par une **amélioration en dollars** sur Accueil, dans **le même conteneur compact** que barre XP, Boosts et revenu/clic. Cible initiale 20 niveaux, +1 clic réel/s/niveau actif en premier plan ; prix en dollars progressifs, réinitialisation au Prestige ; pas d'auto-clic hors ligne.
13. Supprimer complètement des nouveaux catalogues/UI/runtime : auto-investor, auto-trader, auto-enterprise, automatic-orders, market-liquidity et liquidity-recovery. En comptant Auto Click transféré, **7 suppressions du catalogue Prestige** ; supprimer également la configuration bots et le panneau AutomationPanel, sans conserver des services orphelins.
14. Garder **11 améliorations Prestige** : news-duration, news-impact, news-frequency, news-preview, news-propagation, volatility-radar, market-frenzy, time-accelerator, crypto-staking, staking-yield, auto-compound. Prix en PP beaucoup plus élevés (cible boutique complète **environ 6 530 PP**, à calibrer), prix par rang croissants, **verrouillage par nombre de cycles Prestige terminés** côté moteur ET UI.
15. Déblocages initiaux proposés : Fréquence médiatique Prestige 1 (20 PP premier achat), Événements prolongés Prestige 2 (45), Radar Prestige 2 (75), Vision anticipée Prestige 3 (50), Marché extrême Prestige 5 (65), Propagation Prestige 5 (160), Staking Prestige 5 (175), Frénésie Prestige 7 (250), Accélérateur Prestige 10 (100), Rendement staking Prestige 12 (45), Staking composé Prestige 15 (200). Niveaux supérieurs plus chers. Les achats déjà possédés sont **grandfathered**, même sans atteindre le nouveau seuil.
16. Conditions Prestige proposées : **niveau de cycle 150** et **patrimoine Prestige éligible ≥ 10 B$ (10¹⁰ USD fictifs)** ; formule PP = floor[10 × (patrimoine éligible / 10¹⁰) ^ 0,35]. Le patrimoine éligible **exclut les collections permanentes** et retranche les impôts dus. Aucun reset fiscal abusif. Implémentation déterministe et robuste aux grands nombres (ne pas convertir un énorme BigInt en Number pour calculer les PP).
17. Au passage de Prestige : réinitialiser cash, titres, entreprises, click et Auto Click, XP/Fame du cycle, news et staking liés au cycle ; conserver collections, bonus Fame achetés, PP, niveaux Prestige, nombre de cycles, achievements acquis et historique pertinent. Taxes réellement soldées avant le calcul final, calendrier 72 h inchangé ; écriture de sauvegarde atomique.

### B4. Deux pouvoirs News en dollars
18. **News instantanée :** débloquée à partir du **7e Prestige terminé**, achat récurrent dans l'onglet News ; génère immédiatement une news aléatoire selon les règles existantes, sans décaler le calendrier automatique. **Coût par activation = 5 % du patrimoine net** avant transaction, pas du cash.
19. **Terminer une News :** débloqué au **10e Prestige terminé**, bouton dans la modale d'une news active choisie ; arrête immédiatement sa pression sur cours et dividendes, sans inverser les variations passées ; archive « Terminée manuellement », confirmation explicite. **Coût = 10 % du patrimoine net** avant transaction.
20. Pour les deux, base de prix = **cash + portefeuille valorisé + investissements comptables entreprises + collections valorisées à l'achat − dette fiscale**, cohérente avec Stats. La facturation se fait **uniquement sur le cash libre**, sans crédit, vente forcée, réduction liée au cash faible, plafond de prix, cool-down supplémentaire ou frais cachés ; arrondi exact au centime (vers le haut) et rejet propre si valeur nette non positive ou cash insuffisant. Chaque achat est atomique, ne donne ni XP ni Fame, et est journalisé comme dépense non récupérable, y compris après rechargement.
21. Si la dernière news rouge/verte est terminée, maintenir la règle existante « toujours au moins une news directionnelle active » par génération déterministe de remplacement ; garder intégralement la durée/pression des autres news. Neutraliser d'éventuels doublons de clic/achat.

## C. Programme de travail — exactement 7 passes

### Passe 1 — Moteur de très grands nombres & socle de migration
**Objectif :** rendre toutes les valeurs économiques représentables et sérialisables avant d'accélérer l'économie.

Travaux :
- Introduire une autorité monétaire et de quantités exactes : BigInt en centimes, unités de quantité minimales par actif et calculs décimaux/fixes pour les microprix. Éviter toute conversion de montant significatif en Number ; utiliser Number uniquement pour cours/graphes ou ratios visualisés et bornés.
- Généraliser les opérations (somme, soustraction, multiplication par taux rationnel, comparaison, règle d'arrondi, fractions de centime), y compris impôts, réserves, XP, Fame, PP, dividendes, revenus et staking ; prévoir protections contre gel CPU/mémoire plutôt qu'un plafond monétaire de gameplay.
- Ajouter formatteur centralisé FR K/M/B/T/Q/QQ/AA/AB… et au-delà, y compris valeurs négatives, pour-cent et valeurs qui changent de suffixe ; aucune notation ambiguë sur PP/Fame.
- Préparer une **nouvelle version de sauvegarde (v8 ou prochaine version disponible)** ; sérialiser BigInt en **chaînes décimales canoniques**, parse/validate strict, export/import manuel versionné, migration des v4–v7 vers valeurs exactes, essais sur parties existantes extrêmes. Garder un backup logique de l'ancien format et ne jamais écraser une sauvegarde si sa migration est invalidée.
- Adapter progressivement les contrats communs pour que npm run test et npm run build passent, sans modifier encore l'équilibrage, les règles de trading ou le cycle Prestige.

**Tests / critères de validation :**
- Débits/crédits, fiscalité négative, arrondis au centime, zéro, petits memecoins, très grands prix × quantités, gains > 10¹⁰⁰, séparation cash/patrimoine ; aucune écriture Infinity/NaN.
- Sauvegarde → reload → export → import → reload **identique** sur montants immenses, migration v4/v5/v6/v7 valide et import malformé refusé sans perte.
- Affichages suffixes AA, AZ, BA, ZZ, AAA conformes ; npm run test et npm run build verts.

### Passe 2 — Trading illimité + staking + bornes de prix actives
**Objectif :** ôter les limites de quantités et rendre les cycles aux bornes perceptibles.

Travaux :
- Retirer totalSupply de **toutes les conditions exécutables**, notamment trades, recherche de quantité maximale, ordres/UI, staking (mint et compound), validateurs de sauvegarde. Les métadonnées historiques d'offre peuvent rester purement informatives si souhaité ; aucune limite cachée.
- Permettre achats/ventes de quantités très grandes et fractionnaires au **prix affiché**, mêmes frais actuels, aucune variation causée par l'ordre. Vente limitée aux titres détenus et non verrouillés en staking.
- Modéliser dans MarketQuote un état explicite : borne touchée, début réel, durée tirée déterministiquement ≥ 300 000 ms, direction du retournement, durée/amplitude de sortie ; « snap to min/max » à proximité en direction de la borne.
- Pendant le plateau, **prix égal min ou max à chaque tick**, même news opposée ; après délai réel, forte sortie opposée, sans dépassement ; compatible marchés accélérés, pause, replay offline, historique 1 h, PRNG, dividendes et reset de cycle.
- Préserver le calendrier news naturel et la présence permanente d'une news directionnelle. Aucun mécanisme anti-profit ajouté.

**Tests / critères de validation :**
- Achat et vente de > anciens totalSupply, et de quantités contenant jusqu'aux décimales autorisées, staking et recompense au-delà d'ancienne offre ; coûts et profits exacts à grande échelle.
- Borne min et max **atteintes exactement**, maintien ≥ 5 min réelles à vitesse 1× et 5×, save/reload au milieu du plateau, grosses corrections, pas de franchissement, mêmes résultats à replay déterministe, pas d'impact achat/vente sur cours.
- Tests trading/market/news/clock/staking + UI trading + build verts.

### Passe 3 — Entreprises ultra-rentables et niveaux sans maximum fixe
**Objectif :** rentabilité passive concurrentielle du trading et progression très longue.

Travaux :
- Recalculer le catalogue des 20 entreprises vers les cinq fenêtres ROI du contrat B2, sans revaloriser rétroactivement la valeur comptable payée des anciennes entreprises.
- Retirer MAX_ENTERPRISE_LEVEL=20 et les tableaux de niveaux pré-calculés ; générer prix et revenu du niveau demandé de façon sûre et efficace (pas de boucle de taille proportionnelle au niveau, pas de Math.pow infini).
- Conserver milestones aux niveaux 5/10/15/20 ; prévoir milestones périodiques ou échelles de croissance à très haut niveau, rendement marginal intéressant sans fabriquer de valeurs infinies.
- Mettre à niveau tous les calculs passifs (bonus Fame, offline, XP, taxes, stats, Auto UI entreprise, achat unique et upgrades répétés) en précision élevée.

**Tests / critères de validation :**
- ROI initial par catégorie dans la fenêtre annoncée ; passage niveaux 20→21, 100, 1000, très hauts niveaux, calcul rapide et prix/revenus strictement cohérents.
- Rattrapage offline = calcul en direct pour un même temps ; taxe et XP exactement une fois ; pas de cadeau rétroactif aux anciennes entreprises possédées.
- npm run test, tests UI Entreprises/Stats, build verts.

### Passe 4 — Accueil compact + Auto Click en dollars
**Objectif :** réunir toute la progression active dans un composant simple et lisible.

Travaux :
- Refonte du conteneur home-progression dans src/App.vue/src/style.css : barre XP, niveau, bouton Boosts, ligne revenu/clic, ligne Auto Click, coût et prochain effet, boutons lisibles, pas de valeur dupliquée.
- Implémenter Auto Click **en dollars** comme état de cycle (20 rangs proposés, 1 clic/s/rang en session active), coûts progressifs, sans PP ; utiliser earnCapitalClick pour XP, impôt, stats et autres effets exactement comme les clics manuels.
- Débrancher ancien moteur Auto Click Prestige sans retirer encore ses entrées du registre de migration historique : la passe 6 migrera/retirera le catalogue.
- Décorréler les animations visuelles du débit Auto Click pour éviter le bug de GIF à haute vitesse et éviter DOM/timers massifs ; respecter reduced-motion.

**Tests / critères de validation :**
- Achat cash, refus si dette/cash insuffisant, 1–20/s maximum, pas de double crédit, aucun auto clic offline, reset de cycle et sauvegarde/reload.
- Vue PC/mobile/écrans bas, focus, clavier, nombres compactés, pas de scroll horizontal ; tests UI accueil + test économie + build.

### Passe 5 — Nouveaux XP/Fame, compteurs de cycle et comptabilité
**Objectif :** ralentir la progression tout en préparant la réinitialisation complète de Fame du cycle.

Travaux :
- Implémenter courbe XP fortement durcie et monotone par tranches, calcul efficace pour niveaux très élevés, sans boucle non bornée ; faire migration individuelle de l'XP existante en préservant niveau/fraction de progression sans verser de Fame en plus.
- Recalculer le catalogue Fame Shop vers cible ~150–200k Fame pour les 120 rangs, sans changer les effets acquis ; stocker prix historiques validés des achats conservés.
- Séparer Fame **du cycle** (disponible, gagnée, de niveaux, collections durant cycle), Fame **dépensée de façon permanente**, boosts conservés, possessions de collection et record historique. Définir validateurs/migrations de manière à pouvoir mettre tout compteur Fame du cycle à zéro tout en conservant les achats.
- Modifier les récompenses de niveaux pour autoriser à chaque cycle les mêmes niveaux à redonner de la Fame, sans double attribution au cours d'un même cycle ; ne pas recréditer la Fame d'objets de collection permanents.
- Préparer les compteurs utilisés par Prestige absolu : bonus shop conservés mais facteur dépend du solde Fame courant (0 immédiatement après Prestige).

**Tests / critères de validation :**
- Courbe continue et strictement croissante, aucun niveau perdu au chargement, aucune Fame offerte au moment de la migration.
- Ledger Fame valide avant/après Fame Shop, collections et reset simulé ; Fame d'un même niveau créditée une fois par cycle, de nouveau au cycle suivant ; Prestige absolu cohérent.
- Imports anciens Fame élevés, 120/120, achats historiques et validations anti-fraude préservés ; npm run test + build verts.

### Passe 6 — Refonte des cycles, boutique Prestige et remboursements
**Objectif :** une boutique à 11 récompenses, forte difficulté et paliers de cycles.

Travaux :
- Changer seuils à **niveau 150 et 10 B$ éligibles** et formule de PP puissance 0,35, avec arithmétique fiable pour grandes valeurs ; distinguer patrimoine Stats et assiette Prestige qui exclut les collections permanentes.
- Créer nouveau catalogue des **11** pouvoirs du contrat B3, prix progressifs menant à ~6 530 PP, paliers Prestige requis vérifiés côté métier (pas seulement disabled UI), vues « verrouillé jusqu'au Prestige N », achats permanents conservés.
- Supprimer Auto Investisseur/Trader/Entreprise, Ordres automatiques, deux liquidités et l'Auto Click de l'offre PP, retirer AutomationPanel et moteurs/timers/validations/configs morts, en gardant les fonctions de staking et les pouvoirs de news actifs.
- Migration atomique : **rembourser UNE SEULE FOIS** les PP historiquement payés dans les 7 branches sorties, au prix historiquement payé (pas au nouveau prix) ; conserver les autres niveaux achetés gratuitement vis-à-vis de la hausse actuelle de prix ; reconstruire le ledger PP exact et versionner les anciens coûts/historiques.
- Historique PP : ne jamais recalculer les anciens cycles avec la **nouvelle** formule pour valider des récompenses obtenues sur la vieille formule ; stocker version de formule pour cycles nouveaux et autoriser historiques légitimes déjà présents.
- Appliquer réinitialisation Fame complète **du cycle** lors du Prestige : Fame disponible/gagnée/accumulée = 0, sans enlever boosts/collections ; conserver calendrier fiscal, achievements et PP. Confirmer clairement ce qui est perdu/conservé.

**Tests / critères de validation :**
- Impossible d'acheter avant le Prestige requis (même via l'appel métier), achat préexistant toujours actif, remboursement exact et idempotent après plusieurs chargements, aucun PP négatif.
- Plusieurs cycles consécutifs : Fame regagnable aux niveaux rejoués, resets complets, collections non payées à nouveau, taxe payée exactement une fois, records conservés, Prestige absolu reset correctement.
- Historiques vieux PP non invalidés, exports/imports des anciennes sauvegardes, tests ascension/Fame/UI + npm run verify:release verts.

### Passe 7 — Pouvoirs News payants + intégration et validation finale
**Objectif :** livrer les deux pouvoirs sans laisser de regressions économiques ou de migration.

Travaux :
- Ajouter services métiers purs et UI compacte à l'onglet News : **Générer une news** à Prestige 7 (5 % patrimoine net), **Terminer cette news** dans sa modale à Prestige 10 (10 %) avec confirmation et détail du prix.
- Calculer le coût sur un unique snapshot de patrimoine net avant débit : cash + positions au marché + entreprises valeur comptable + collections valeur comptable − taxes dues. Achat uniquement cash ; opérations atomiques, interdiction cash négatif, prix exact pour 1T/1Q/1AA/1AB… ; facture dynamique sans cache.
- Génération aléatoire déterministe depuis le PRNG et bibliothèque existants, ajout immédiat **sans décaler** la prochaine news prévue et sans cloner d'ID ; arrêt de l'effet d'une news choisie, persistance de la fin manuelle, historique affiché et maintien du « au moins une directionnelle active » ; préserver vision, bonus d'intensité/durée, dividendes et cadence réelle.
- Éliminer références aux anciens bots, aux anciennes contraintes de liquidité, aux anciennes validations Number et aux affichages dépassés ; mettre à jour README et documentation utilisateur **après** conformité du code.
- Simulations déterministes économiques multi-cycles/plusieurs profils (trading massif, entreprise passive, mixte), test de gains à 10^100+, time multiplier, limites de cours et news coûteuses ; tests de non double-crédit et cohérence fiscale/statistique.

**Tests / critères de validation :**
- Coût d'un pouvoir identique pour 100 % cash vs presque tout investi, si patrimoine net identique ; cash insuffisant bloque sans modifier aucun état ; 2 clics simultanés ne facturent pas deux fois la même activation logique ; achats répétés au nouveau patrimoine recalculé.
- Dernière news directionnelle interrompue → nouvelle directionnelle selon règle existante ; aucun effet résiduel de la news arrêtée, aucune réécriture rétroactive des anciens cours, présence historique après import.
- Parcours UI mobile/PC, sauvegardes v4–v7→nouveau, import/export et reset, npm run test, npm run build, npm run verify:release **confirmés exécutés** avant toute publication. Ne lancer npm run build:root / sync Pages qu'au moment d'une publication explicitement validée. Ne pas dépendre des GitHub Actions payantes/bloquées.

## D. Politique de migration et invariants de sécurité

1. **Jalon avant passe 1 :** exporter et conserver plusieurs sauvegardes réelles v7 (départ, holdings fractionnaires, entreprises 20, Fame achetée, collections 50/50, Prestige multiples, soldes fiscaux négatifs, PP déjà dépensés, grande fortune) comme fixtures **anonymisées**. Ne pas commiter de données personnelles.
2. Migration **pure, versionnée, idempotente, testée**, avec comparaison avant/après des invariants (cash, holdings, cost basis, taxes, XP/niveau, prix des titres, historiques, objets, points et achats). Sauvegarde invalide : ne jamais la remettre à zéro silencieusement ou écraser l'original.
3. PP et Fame : expliciter **gains de cycle vs coûts historiques permanents**, et version de tarif ayant justifié les achats ; ne pas perdre les capacités acquises dans les sauvegardes valides, même si les tarifs actuels changent.
4. État marché : conserver horloges réelles pour plateaux de 5–10 minutes, news et staking ; accélération temporelle ne multiplie que les ticks de cours, jamais durée réelle, taxes, dividendes ou cooldowns.
5. Fiscalité : mêmes taux et fréquence d'échéance ; solde cash peut être négatif après taxe, mais **aucun achat à crédit** ; revenu/trading/News jamais crédité deux fois après rattrapage.
6. Achat actions/crypto : les frais de chaque côté restent inchangés ; **pas de slippage ni de limitation globale** via API manuelle, bots supprimés, stock disponible, staking, quick buttons ou import.
7. Chaque passe doit être **atomique côté Git** : examiner main, coder et tester, commiter seulement après validations effectivement exécutées ; si les tests ne peuvent pas tourner, l'indiquer explicitement, ne pas publier automatiquement, documenter le statut exact.

## E. Suivi par « next »

| Passe | Livrable principal | Statut |
|---|---|---|
| 1 | Grands nombres + migration de sauvegarde | **Terminée — V8 actif, tests et build verts** |
| 2 | Trading/quantités illimités + paliers min/max | **Terminée — staging V8, bornes réelles et tests verts** |
| 3 | Entreprises rentables et sans niveau fixe | À faire |
| 4 | Accueil compact + Auto Click dollars | À faire |
| 5 | XP/Fame exigeants + ledgers de cycle | À faire |
| 6 | Prestige V2 : 11 bonus, gates, PP et Fame reset | À faire |
| 7 | Pouvoirs News 5 %/10 % + tests finaux | À faire |

**État d'exécution :** l'historique du fichier a commencé par un commit documentaire ; les travaux de la passe 1 ont depuis rendu V8 actif. La prochaine commande « next » doit démarrer **uniquement la passe 3** et préserver les moteurs V8, le trading illimité et les événements de bornes persistés.
