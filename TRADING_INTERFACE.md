# Trading V1 — Interface de consultation (passe 8)

Navigation mobile **Accueil / Trading**, puis **Portfolio / Actions / Crypto / News**.

- **Portfolio** : patrimoine total, valeur investie, dividendes estimés par seconde, positions, coûts moyens et performances nettes des frais de sortie.
- **Actions** : 20 entreprises fictives, ticker, cours simulé, variation depuis la première donnée de l'heure, sparklines réduites à 40 points et préservant leurs extrêmes.
- **Crypto** : 15 cryptomonnaies et 10 memecoins, dont les petits cours sont affichés avec suffisamment de décimales.
- **News** : titres, descriptions, premières entreprises concernées, statut actif/terminé et temps restant basé sur l'horloge simulée.
- Les listes défilent **à l'intérieur de la page Trading** ; la page conserve son conteneur mobile de 100dvh et les safe areas.
- Les composants sont isolés dans `src/components` et les calculs d'affichage dans `src/trading/presentation.ts`. Aucun deuxième solde, moteur de marché ni timer n'a été créé.
- Les boutons de navigation sont réels et accessibles au clavier ; les sous-onglets indiquent leur état avec `aria-pressed`.
- **Limite volontaire passe 8 :** pas de modal ni d'achat/vente dans l'interface ; la passe 9 réalisera les formulaires, l'interaction sur les actifs, les modales News et le catalogue de 300 récits.
