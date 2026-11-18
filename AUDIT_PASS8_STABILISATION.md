# CAPITAL_IDLE — Rapport de stabilisation, passe 8

**Date :** 18 novembre 2026  
**Périmètre :** `ROADMAP_PRESTIGE_TRANSCENDANT_COLLECTIONS_V3.md`, passe 8 exclusivement.  
**Source de vérité :** branche `main` / V8 (`BigInt`, chaînes décimales canoniques), sans modification de formule économique.  
**Branche de vérification :** `pass8-stabilization-validation`. Le workflow temporaire de validation est **exclu de `main`**.

## 1. Audit transversal

Vérification en tests de la chaîne suivante, sur transactions V8 :
1. Achat MAX des améliorations de clic en un débit atomique, borné par le niveau de joueur, sans crédit malgré un solde négatif.
2. Achat/amélioration MAX d'entreprises en valorisation comptable, progression et rattrapage fiscal inchangés.
3. Trading au comptant, achat/vente et prise en compte des gains nets ; la restitution du principal et les pertes ne deviennent pas une source de bonus XP/PP.
4. News directionnelles automatiquement présentes si le dernier événement rouge/vert disparaît ; commandes manuelles au Prestige 3 et taux de News inchangés.
5. Achats définitifs de collections, identifiants historiques normalisés, rareté déterministe, ensembles 20/20 et Musée à 100/100. Le Musée bonifie les revenus admissibles et uniquement les **PP futurs**.
6. Fame Shop et Prestige absolu à facteur plafonné `×(100 + cycles achevés)`, calcul exact pour très grands nombres.
7. Prestige : règlement des impôts, conservation du calendrier fiscal, calcul du patrimoine net éligible sans collections ni principal du Capital de départ, reçu V3 immuable, restauration de Fame disponible à zéro sans effacement de Fame permanente/collections/PP/succès.
8. Après sept arbres principaux Transcendant 1000/1000, réserve PP : `1 + PP / (2 × (PP + 1e9))` bornée strictement sous ×1,5, appliquée uniquement aux cinq branches de revenus/XP/Fame ; sans double effet sur l'Héritage PP, le capital initial ni les News.

**Stabilisation de code :** correction du formatage du multiplicateur Fame quand une fraction arrondie doit franchir une borne entière (ex. `1.999999999999999` → `2`). Le test Chromium identifie les éventuelles requêtes de favicon facultatif et distingue leurs 404 des véritables erreurs HTTP du jeu ; aucun changement HTML n’a été retenu. Le script de recette démarre désormais Vite directement avec Node et tue ce processus à la fin : l'ancien lancement via `npm run dev` pouvait laisser un serveur enfant actif après un parcours réussi, immobilisant le runner malgré cinq vues passées. Aucun rééquilibrage introduit.

## 2. Matrice des sauvegardes et comptabilité

| Scénario | Garantie testée |
| --- | --- |
| Nouvelle partie V8 | Export/import V8 inchangé, champs décimaux canoniques |
| Ancienne V8 sans `transcendentV1` | Migration compatible avec les rangs absents à zéro |
| Import historique V7 | Conversion V8 validée, sauvegarde d'origine conservée |
| V8 à très grandes fortunes (`10^100`) | Aucun arrondi monétaire en `Number` ; conservation des montants |
| Cycle Prestige proche et au-delà de `Number.MAX_SAFE_INTEGER` | Compteur canonique `prestigeCountExact`, reçu `cycleExact`, index historique glissant |
| Historique PP V2/V3, Héritage, Musée | Bonification et preuve du cycle versionnées ; aucun réexamen rétroactif des reçus |
| Données falsifiées (cycle, reçus, montant, cours) | Import refusé sans mutation de la partie courante |
| Stockage saturé ou écriture non confirmée | L'opération échoue sans déclarer le succès ni remplacer volontairement les données antérieures |
| Sauvegarde V8 invalide et présence d'une V7 ancienne | Blocage de chargement, aucune « résurrection » de la V7 |
| Impôts provoquant un cash négatif | Pas d'achat à crédit : MAX clic, MAX entreprise, Trading et collections refusés |

L'import/export V8 est **local et non authentifié** : le contrôle est structurel et comptable, pas une preuve cryptographique anti-triche.

## 3. Validation du code et performances

Commande indépendante : `npm run verify:release` (tests domaine, JSDOM, `vue-tsc --noEmit`, build Vite), puis **`npm run build:root`** (vérification répétée et synchronisation des fichiers statiques `index.html`, `assets/` et `.nojekyll`).

**Résultats sur runner GitHub Actions Ubuntu / Node 22 :**
- **427/427 tests métier et 107/107 tests Vue** réussis, sans échec.
- Compilation TypeScript et Vite réussie, puis `build:root` réussi.
- Mesures indicatives : 200 recalculs/mises à disposition de la collection 100 pièces et des bonus exacts en **1,2–3 ms** ; 200 devis MAX clic en **151–186 ms** ; 50 devis MAX entreprise en **53–76 ms** ; 40 clics V8 avec `10^100` PP en **41–52 ms**. Elles décrivent le runner CI, **pas une garantie de latence sur les appareils des joueurs**. Le prix de MAX entreprise et le devis MAX clic évitent l'itération de tous les niveaux ; les collections sont mémoïsées par identité du tableau de possessions.

## 4. Navigation réelle dans Chromium

Scénario **Playwright pilotant un Google Chrome réel** sur runner GitHub : cinq tailles de viewport **360 × 780, 390 × 844, 768 × 1024, 1280 × 800 et paysage 832 × 384**. Fixture locale V8 fabriquée par **100 vrais achats d'objets** et 7/7 arbres Transcendant à 1000 niveaux, sans accès aux sauvegardes de production.

Éléments couverts : absence de défilement horizontal du document, navigation sept commandes (six onglets + plein écran), animation autonome du billet sans clic sur environ 270 ms, ouverture/fermeture Échap de la fenêtre des boosts, d'une fiche d'actif et d'une News, présence d'une News directionnelle, liste Entreprises et MAX, vingt objets par catégorie et fiche Collection, Succès, Fame Shop, navigation vers Prestige puis bonus PP ultime, zone Stats et impossibilité de confirmer RESET sans saisie exacte. Captures de l'interface enregistrées par viewport via GitHub Actions.

**Portée :** ces tests automatisés en Chrome réel ne sont pas une validation manuelle sur téléphone physique, iOS/Safari ou toutes les tailles d'écran ; performances du rendu visuel en longues sessions hors champ.

## 5. Documentation et risques résiduels

Le `README.md` décrit les règles **actives** : XP V4, 11 upgrades ordinaires (Prestiges 1–3), News manuelles au Prestige 3, Trading sans limite d'offre, 100 collections avec raretés, Musée, Fame cap progressif, sept arbres principaux plus trois News, PP ultime, Capital de départ et sauvegardes V8. Les chiffres d'équilibrage des **50 objets d'origine** ont été étiquetés comme **archive historique**, pas comme références actives.

Risques résiduels connus : croissance des sauvegardes locales et des grands historiques, plafond de taille de fichier importé, limitations de `localStorage` et de stockage du navigateur, absence de synchronisation cloud, rejeu Trading/News par tranches bornées pour longues absences, manque de vérification physique multi-navigateurs. Aucun de ces points ne doit conduire à déclarer une nouvelle passe implicite ou à modifier le gameplay sans nouvel arbitrage.

**État de clôture :** tests de recette et build indépendants validés sur branche isolée, puis intégration du seul périmètre Pass 8 sur `main` et publication GitHub Pages à vérifier via leurs propres workflows. Voir liens de preuve dans le suivi de la roadmap.
