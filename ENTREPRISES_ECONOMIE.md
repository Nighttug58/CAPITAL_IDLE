# CAPITAL_IDLE — Rééquilibrage des 20 entreprises (prix à échelle réelle)

**Source de vérité :** `src/economy/catalog.ts` · **Devise : USD fictifs du jeu** · **Révision : 13/11/2026**

## Principe

Les 20 entreprises sont désormais acquises à un **prix d'ordre de grandeur réel** : commerce individuel à partir de 75 000 $, grands ensembles immobiliers/industriels à plusieurs centaines de millions, grands groupes à plusieurs dizaines ou centaines de milliards. Les valeurs sont des **estimations de design et de taille d'entreprise**, pas des devis de rachat ni des valorisations en temps réel. Les prix peuvent varier de façon considérable selon la localisation, les locaux, la trésorerie, les murs, l'endettement, le chiffre d'affaires et les actifs détenus.

- **Prix et améliorations** : réalisme d'**ordre de grandeur**. Les montants ci-dessous supposent des entreprises de taille croissante : kiosque indépendant, commerces rentables, salle de sport structurée, multiplexe, grand hôtel, réseau de concessions, plateforme logistique, complexe industriel, très grand laboratoire, campus data center, compagnie aérienne importante et groupes cotés.
- **Revenus fixes et délais de retour** : équilibrage **accéléré de jeu**, **non représentatif des bénéfices IRL**. Les retours bruts restent de **8 à 64 heures** pour maintenir la voie idle. Les gains et les coûts des 19 améliorations évoluent proportionnellement aux prix réévalués.
- **Aucune revente, aucune franchise, aucune rétrofacturation.** Les sauvegardes v5 conservent les établissements et leurs montants historiquement investis (valeur comptable du joueur). Les entreprises existantes gagnent désormais le taux recalculé depuis le catalogue ; elles ne paient pas rétroactivement la différence de prix. Les **futures améliorations** utilisent les nouveaux coûts.
- Les revenus fixes restent **bruts avant fiscalité** (taux provisoire actuellement 15 %, dette prélevée toutes les 72 h réelles). Les dividendes et événements Trading restent séparés.

## Références de marché

- **BizBuySell, transactions 2025 par secteur (États-Unis)** — médianes observées de vente : cafés environ **176 500 $**, boulangeries **200 000 $**, laveries automatiques **287 000 $**, restaurants **225 000 $**, supérettes **228 000 $**, garages **399 000 $**, stations de lavage **700 000 $**, concessions automobiles **690 000 $**. Plusieurs prix du jeu sont **supérieurs** à ces médianes : ils représentent une implantation, une taille ou un parc d'actifs plus important, et la progression doit rester croissante. Données : https://www.bizbuysell.com/insight-report-data-tables/
- **BizBuySell, récapitulatif 2025** — médiane nationale de petites entreprises vendues : **350 000 $** ; les ventes restent hétérogènes selon l'activité. https://www.bizbuysell.com/blog/2025-year-in-review/
- **JLL, Global Data Center Outlook 2026** — coût estimé de construction du cœur/bâtiment d'un centre de données : **11,3 M$ par MW** en 2026 (hors terrain et équipements informatiques), ce qui justifie des campus dépassant le milliard. https://www.jll.com/en-us/insights/market-outlook/global-data-centers
- Les estimations des très grands ensembles (centre commercial, laboratoire, compagnie aérienne, groupe énergétique et technologique) sont des **échelons indicatifs d'acquisition**, pas des prix vérifiés d'une société particulière. Il n'existe pas de prix unique comparable pour ces catégories.

## Catalogue complet — nouvelle échelle

| Entreprise | Déblocage niv. | Achat | Revenu brut niv. 1 | Retour brut initial | Revenu brut niv. 20 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Kiosque | 3 | 75 000 $ | 2,60 $/s | 8 h | 61,23 $/s |
| Café | 5 | 180 000 $ | 5,56 $/s | 9 h | 130,63 $/s |
| Laverie automatique | 7 | 300 000 $ | 8,33 $/s | 10 h | 195,94 $/s |
| Boulangerie | 9 | 420 000 $ | 10,61 $/s | 11 h | 249,38 $/s |
| Supérette | 12 | 600 000 $ | 13,89 $/s | 12 h | 326,57 $/s |
| Restaurant | 14 | 800 000 $ | 17,09 $/s | 13 h | 401,93 $/s |
| Station de lavage | 16 | 1 200 000 $ | 23,81 $/s | 14 h | 559,83 $/s |
| Garage automobile | 18 | 1 800 000 $ | 33,33 $/s | 15 h | 783,76 $/s |
| Salle de sport | 21 | 2 500 000 $ | 43,40 $/s | 16 h | 1 020,52 $/s |
| Cinéma | 23 | 8 000 000 $ | 123,46 $/s | 18 h | 2 902,82 $/s |
| Hôtel | 25 | 16 000 000 $ | 222,22 $/s | 20 h | 5 225,08 $/s |
| Concession automobile | 27 | 35 000 000 $ | 441,92 $/s | 22 h | 10 390,77 $/s |
| Entrepôt logistique | 30 | 80 000 000 $ | 925,93 $/s | 24 h | 21 771,15 $/s |
| Usine de production | 32 | 220 000 000 $ | 2 263,37 $/s | 27 h | 53 218,36 $/s |
| Centre commercial | 34 | 500 000 000 $ | 4 629,63 $/s | 30 h | 108 855,74 $/s |
| Laboratoire | 36 | 1 200 000 000 $ | 9 803,92 $/s | 34 h | 230 518,03 $/s |
| Data center | 40 | 3 000 000 000 $ | 21 367,52 $/s | 39 h | 502 411,10 $/s |
| Compagnie aérienne | 43 | 20 000 000 000 $ | 123 456,79 $/s | 45 h | 2 902 819,68 $/s |
| Entreprise énergétique | 46 | 85 000 000 000 $ | 437 242,80 $/s | 54 h | 10 280 819,70 $/s |
| Groupe technologique | 50 | 300 000 000 000 $ | 1 302 083,33 $/s | 64 h | 30 615 676,32 $/s |

## Améliorations et garde-fous

- **20 niveaux** (achat niveau 1 + 19 améliorations), **4 paliers** de bonus fixes aux niveaux **5 (+20 %), 10 (+25 %), 15 (+30 %) et 20 (+40 %)**, en plus des **+12 %** ordinaires par niveau.
- Coût 1 → 2 = **20 % du prix d'achat**. Chaque amélioration suivante est **18 % plus coûteuse** (arrondi au centime). Exemple : le kiosque coûte maintenant **75 000 $** à acquérir, puis **15 000 $** pour le niveau 2.
- Revenus fixes recalculés au **microdollar/s** (un entier) : `round(prixAchatUSD × 1_000_000 / (retourHeures × 3600))`. Chaque niveau est calculé une seule fois par le catalogue figé, indépendamment des actualités du marché.
- Les coûts et rendements restent des entiers sûrs en centimes / microdollars, y compris pour les groupes à plusieurs centaines de milliards. Le moteur conserve la fraction de centime lors du rattrapage.
- Les déblocages restent aux niveaux joueur **3–50**. Le niveau requis ne suffit jamais : il faut disposer du **cash**. Cette hausse rend l'accès à la première entreprise sensiblement plus exigeant avec un départ à 0 $ et des clics initialement à 1 $.
- **Après l'achat**, les entreprises ne peuvent ni être revendues ni être acquises en double. Les entreprises détenues en ancienne sauvegarde ne sont jamais rachetées.

## Lecture de l'équilibrage

À l'ouverture d'un commerce, le délai de rentabilité en heures reste volontairement celui de l'ancien jeu ; **seule la taille économique change**, avec des dollars, des revenus et des coûts d'amélioration proportionnellement plus importants. Les valeurs de retour ne sont pas des taux de rendement réels d'entreprise : un taux de retour de 8 heures est un **accélérateur d'idle clicker**.

Le premier investissement demande beaucoup plus d'efforts qu'avant ; c'est un choix de difficulté lié à la hausse des prix. Les autres mécaniques (progression XP, sauvegarde v5, revenus hors ligne, fiscalité 72 h, Trading, Stats et import/export/reset) restent inchangées.
