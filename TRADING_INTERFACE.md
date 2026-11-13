# Trading V1 — Interface jouable (passes 8 et 9)

Navigation mobile **Accueil / Trading**, puis **Portfolio / Actions / Crypto / News**.

- **Portfolio** : patrimoine total, valeur investie, dividendes estimés par seconde, positions, coûts moyens et performances nettes des frais de sortie.
- **Actions** : 20 entreprises fictives, ticker, cours simulé, variation depuis la première donnée de l'heure, sparklines réduites à 40 points et préservant leurs extrêmes.
- **Crypto** : 15 cryptomonnaies et 10 memecoins, dont les petits cours sont affichés avec suffisamment de décimales.
- **News** : titres, descriptions, premières entreprises concernées, statut actif/terminé et temps restant basé sur l'horloge simulée.
- Les listes défilent **à l'intérieur de la page Trading** ; la page conserve son conteneur mobile de 100dvh et les safe areas.
- Les composants sont isolés dans `src/components` et les calculs d'affichage dans `src/trading/presentation.ts`. Aucun deuxième solde, moteur de marché ni timer n'a été créé.
- Les boutons de navigation sont réels et accessibles au clavier ; les sous-onglets indiquent leur état avec `aria-pressed`.
- **Passe 9 livrée :** fiches modales interactives pour chaque actif, graphiques des cours et rendements (historique d'une heure), informations de quantités et bornes, News associées, achats et ventes avec quantités libres et raccourcis 25/50/MAX. Les ordres utilisent directement `buyAsset`/`sellAsset` via un unique callback dans `App.vue` ; les succès, frais et erreurs sont présentés sans créer de solde parallèle.
- Les News sont cliquables, expliquées dans une fenêtre dédiée et reliées à la fiche de chaque actif ciblé. Rumeurs, confirmations et démentis sont identifiés comme simulations.
- Fermeture par bouton, clic sur fond, touche Échap ou retour navigateur ; le focus revient au déclencheur et reste contenu dans la modale au clavier.
- **300 actualités distinctes** sont activées (voir `TRADING_NEWS.md`).
- **Tests :** `npm test` couvre le moteur et `npm run test:ui` monte les vrais composants Vue dans jsdom pour tester navigation, achats/ventes, MAX, erreurs et News.
