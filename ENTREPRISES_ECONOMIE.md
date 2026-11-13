# CAPITAL_IDLE — Catalogue et équilibrage des entreprises (passe 2)

**Statut : catalogue de gameplay implémenté (20 entreprises), pas encore achetable.**
Source de vérité : `src/economy/catalog.ts`. Les tableaux ci-dessous documentent les mêmes données, sans créer une seconde autorité de prix. Dernière définition : 13/11/2026.

## Règles immuables

- 20 entreprises différentes, exactement **une seule acquisition par type**, **aucune revente/franchise**.
- Achat au **niveau 1** ; puis **19 améliorations** de niveau 2 à **20 MAX**.
- Déblocage lié au **niveau joueur** (1–50). Atteindre le niveau requis n'offre pas l'entreprise : il faut encore payer le prix d'achat.
- Revenus **bruts, fixes et indépendants** des prix, dividendes, News et événements du Trading. Le versement par seconde et la reprise hors ligne seront implémentés à la passe 3 puis 5, **pas à cette passe**.
- Les coûts de la suite d'améliorations n'entraînent pas de charges d'exploitation, de revente ou de prestige infini.
- La fiscalité de 72 h est développée plus tard ; le taux reste **non validé**, donc toutes les valeurs ci-dessous sont **brutes avant impôt éventuel**.

## Catalogue complet — chiffres de jeu fictifs

Les revenus affichés ci-dessous sont arrondis pour lecture. Le moteur conserve une précision au **microdollar par seconde** (1 microdollar = 0,000001 $) pour qu'aucun revenu faible ne disparaisse.

| Entreprise | Déblocage niv. | Achat | Brut niv. 1 /s | Retour niv. 1 | Brut niv. 20 /s |
| --- | ---: | ---: | ---: | ---: | ---: |
| Kiosque | 3 | 150 $ | 0,0052 $ | 8 h | 0,12 $ |
| Café | 5 | 350 $ | 0,0108 $ | 9 h | 0,25 $ |
| Laverie automatique | 7 | 750 $ | 0,0208 $ | 10 h | 0,49 $ |
| Boulangerie | 9 | 1 500 $ | 0,0379 $ | 11 h | 0,89 $ |
| Supérette | 12 | 3 500 $ | 0,0810 $ | 12 h | 1,90 $ |
| Restaurant | 14 | 7 500 $ | 0,1603 $ | 13 h | 3,77 $ |
| Station de lavage | 16 | 16 000 $ | 0,3175 $ | 14 h | 7,46 $ |
| Garage automobile | 18 | 35 000 $ | 0,6481 $ | 15 h | 15,24 $ |
| Salle de sport | 21 | 75 000 $ | 1,3021 $ | 16 h | 30,62 $ |
| Cinéma | 23 | 150 000 $ | 2,3148 $ | 18 h | 54,43 $ |
| Hôtel | 25 | 300 000 $ | 4,1667 $ | 20 h | 97,97 $ |
| Concession automobile | 27 | 650 000 $ | 8,2071 $ | 22 h | 192,97 $ |
| Entrepôt logistique | 30 | 1 400 000 $ | 16,2037 $ | 24 h | 381,00 $ |
| Usine de production | 32 | 3 000 000 $ | 30,8642 $ | 27 h | 725,70 $ |
| Centre commercial | 34 | 6 500 000 $ | 60,1852 $ | 30 h | 1 415,12 $ |
| Laboratoire | 36 | 14 000 000 $ | 114,3791 $ | 34 h | 2 689,38 $ |
| Data center | 40 | 30 000 000 $ | 213,6752 $ | 39 h | 5 024,11 $ |
| Compagnie aérienne | 43 | 65 000 000 $ | 401,2346 $ | 45 h | 9 434,16 $ |
| Entreprise énergétique | 46 | 140 000 000 $ | 720,1646 $ | 54 h | 16 933,11 $ |
| Groupe technologique | 50 | 300 000 000 $ | 1 302,0833 $ | 64 h | 30 615,68 $ |

Chaque entreprise possède des **coûts d'amélioration propres**, déterminés par son prix de base. Le tableau ne remplace pas les tableaux intégraux à 19 coûts / 20 revenus générés et figés dans le module.

## Courbes de niveau

Les revenus fixes au niveau `n` sont calculés une fois à la création du catalogue :

- Niveau 1 : revenu de base `round((prix en $ × 1 000 000) / (retour en heures × 3600))` **microdollars/s**.
- Niveau normal suivant : **+12 %** du revenu du niveau précédent (arrondi au microdollar).
- Au niveau **5** : +12 % ordinaire **puis bonus permanent +20 %** (Expansion).
- Au niveau **10** : +12 % puis **+25 %** (Automatisation).
- Au niveau **15** : +12 % puis **+30 %** (Modernisation).
- Au niveau **20** : +12 % puis **+40 %** (Prestige). Fin des améliorations.
- Les bonus de palier **se cumulent** en multiplicateurs avec les niveaux et les bonus précédents ; ce ne sont **pas** des gains ponctuels.
- Coût de passage **1 → 2** : **20 %** du prix d'achat (centimes arrondis). Chaque coût suivant est **18 % plus cher** que le précédent selon la formule exponentielle ancrée sur le coût initial et arrondie au centime : `round(prixAchatCents × 0,20 × 1,18^(niveauCible−2))`.
- Il n'y a pas d'achat groupé ou `MAX` décidé : chaque amélioration est une action séparée.

**Exemples déterministes (hors fiscalité) :**

| Entreprise | Amélioration 1→2 | Amélioration 19→20 | Investissement total niv. 20 | Revenu niv. 20 /s | Retour total niv. 20 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Kiosque | 30 $ | 590,20 $ | 3 852,41 $ | 0,12246 $ | 8,74 h |
| Restaurant | 1 500 $ | 29 509,88 $ | 192 620,31 $ | 3,76808 $ | 14,20 h |
| Groupe technologique | 60 M$ | 1 180,40 M$ | 7 704,81 M$ | 30 615,68 $ | 69,91 h |

Le **retour total niv. 20** tient compte de l'achat de base **et** des 19 améliorations. On ne confond pas `retour de l'investissement` avec une capacité de revente : les entreprises restent non revendables.

## Arbitrage par rapport au jeu existant

- Le clicker existant a **50 niveaux** et atteint son maximum à **37 002 $ réellement gagnés** ; les améliorations du clic montent jusqu'à **50 $/clic**. Les entreprises d'entrée de gamme sont accessibles relativement tôt, mais les entreprises à plusieurs millions requièrent la constitution d'un gros capital, typiquement avec le Trading.
- Les dividendes des actions existantes sont variables, entre **1 et 30 %** sur une **année de jeu équivalente à 24 h réelles** : revenu calculé à partir des actions détenues. Les entreprises gagnent de façon **fixe**, sans multiplier leur revenu lors d'une fluctuation de marché.
- Les rendements passifs des petites entreprises sont volontairement **plus généreux** que de petits portefeuilles d'actions à dividendes : cela crée une vraie voie idle. Mais elles immobilisent définitivement l'investissement et leurs gros paliers deviennent très coûteux ; au contraire, les positions de Trading restent revendables, avec des cours très volatils, qui peuvent permettre des gains rapides (ou des pertes).
- Pour éviter l'effet « tout acheter dès le niveau 50 », le niveau ne suffit pas : le prix passe de **150 $** à **300 M$**, et le délai de retour initial de **8 h** à **64 h** (brut). L'équilibrage peut être recalibré au besoin sans changer le contrat fonctionnel des 20 niveaux et paliers.
- Les taxes (dont le taux définitif est encore ouvert) réduiront le retour net après prélèvement. Ne pas annoncer une rentabilité nette précise avec un taux non validé.
- Le moteur emploie **centimes entiers pour les coûts** et **microdollars entiers pour les revenus par seconde**. La conversion des revenus en crédits monétaires, la conservation des fractions de centime et les revenus hors ligne sans plafond seront branchés dans les passes suivantes.

## Contrôle automatique

`npm test` exécute désormais `src/economy/catalog.test.ts` : 20 identifiants uniques, quatre entreprises dans chaque palier, niveaux d'accès croissants jusqu'à 50, 19 upgrades, valeurs monétaires sûres et croissantes, paliers exacts 5/10/15/20, ratios de rentabilité, plafond de niveau et immuabilité du catalogue.

**Cette passe ne modifie pas le solde, les achats Trading ni l'interface.** La future page Entreprises est prévue dans la passe 3.
