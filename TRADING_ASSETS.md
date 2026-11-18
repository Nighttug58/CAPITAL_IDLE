# CAPITAL_IDLE — Références des actifs du Trading V1

**Photo de marché indicative : 13 novembre 2026.** Le catalogue `src/trading/catalog.ts` est **figé** et sert seulement de départ au marché individuel simulé. Il ne constitue pas un service de cotations réelles.

## Cotations utilisées

- **20 entreprises parodiées** : références aux entreprises réelles, cotations USD arrondies provenant de [Stock Market Watch, séance du 13/11](https://stockmarketwatch.com/indices/sp500/today) et de [News Paper Joint, clôtures du 12/11](https://newspaperjoint.com/markets/stocks/). Pour **Mike/Nike** : [NKE au 12/11](https://stockanalysis.com/stocks/nke/history/) ; pour **Starbocks/Starbucks** : [SBUX au 12/11](https://stockanalysis.com/stocks/sbux/history/).
- **Simsung/Samsung** : [206 000 KRW/action au 13/11](https://stockanalysis.com/quote/krx/005930/history/) et [taux de conversion USD/KRW proche de 1 336,42](https://www.investing.com/currencies/usd-krw-historical-data), soit environ **154,14 USD/action**. Un prix en dollars pour une action coréenne reste une conversion indicative, non un titre coté aux États-Unis.
- **15 cryptomonnaies** : [cours USD CoinGecko relayés par Cryptured, 13/11/2026 à 14:05 UTC](https://www.cryptured.com/crypto-prices/). Les stablecoins sont volontairement exclus du marché chaotique.
- **10 memecoins** : [CoinGecko — catégorie Meme](https://www.coingecko.com/en/categories/meme-token), prix observés le 13/11/2026, arrondis à quelques chiffres significatifs.

Les références ne sont pas identiques à la seconde près : il s'agit de **prix approximatifs de départ**, non de données synchronisées. Le taux de dividende initial de chaque entreprise est une valeur **100 % ludique** entre 1 % et 30 %, distincte des vrais dividendes.

## Marché sans bornes de cours (18 novembre 2026)

- **Actions, cryptos et memecoins** : aucun prix minimum ou maximum lié au prix de référence initial. Les cours peuvent descendre sous l'ancien seuil de 10 % / 5 % ou dépasser les anciens plafonds ×6 / ×5.
- **Aucune pause à la limite** : le blocage de 5–10 minutes et le rebond automatique de 1–3 minutes ont été retirés. Les tendances, bruits, chocs et News continuent de déterminer les mouvements à chaque tick.
- La vitesse maximale d'un mouvement isolé reste bornée à **±0,25 en log-rendement par tick**, afin d'éviter des sauts instantanés absurdes. Les seules autres protections sont la positivité et la finitude numérique des cours.
- La fiche de chaque actif affiche les **plus bas et plus hauts réellement observés sur l'historique glissant d'une heure**. Ces extrêmes ne sont pas des limites ni des prédictions.
- La donnée `referenceHighPrice` du catalogue est un repère documentaire de la photo de marché, **pas un plafond**, et ne prétend pas être un record historique (ATH).
- Les sauvegardes V7/V8 contenant un ancien événement de limite sont vérifiées puis débarrassées de ce seul événement à la restauration. Aucun prix, historique, quantité ni état économique n'est remis à zéro.

## Offre maximale / quantité accessible

- **20 actions** : émission **fictive** fixée pour chaque entreprise, représentant un ordre de grandeur de grandes sociétés. Aucune reconstitution d'actions réelles détenues ou flottantes.
- **Cryptos** : utiliser **l'offre théorique du protocole** lorsqu'elle existe, sinon **l'offre de lancement** (pas la circulation actuelle), sinon un **plafond de jeu** documenté.
- **Ethereum** : environ 72 millions à la création, le protocole n'a pas de max fixe.
- **BNB, Solana, TRON, Stellar, UNI** : quantités de lancement, sans retirer burns ni tenir compte des émissions ultérieures.
- **Monero** : pas de plafond réel ; quantité **18,4 millions** pour le jeu, correspondant environ à la phase d'émission principale (hors émission résiduelle).
- **Dogecoin** : pas de plafond réel ; **100 milliards** utilisés comme plafond de jeu initial, avant l'émission permanente.
- **SHIB, PEPE, BONK, FLOKI** : offre initiale, sans déduction des burns.
- Pour chaque crypto, la propriété `supplyNote` précise la convention. Il ne faut pas confondre ces valeurs avec le **circulating supply** affiché par une plateforme en temps réel.
- **Tout le stock** peut théoriquement être acheté puis revendu. L'offre disponible sur un marché individuel est la totalité moins les unités possédées par ce joueur.
- `quantityDecimals` définit la précision de négociation de jeu. Les offres immenses (plusieurs billions/quadrillion) sont négociées par unités entières afin de rester dans la précision des nombres JavaScript ; les tokens plus rares sont fractionnables.

## Contrôles de cohérence

Le fichier `src/trading/catalog.test.ts` protège le total **20 / 15 / 10**, les identifiants/tickers uniques, les bornes, taux de dividende, types d'offre, dates/sources, précision d'achat et l'achat de la totalité du stock.

## Suite

La **passe 3** fournira le simulateur qui consomme `ASSETS` / `createInitialQuotes`. La **passe 5** définira l'arithmétique des transactions et les arrondis financiers. La **passe 7** fera fluctuer les rendements. Jusqu'à ces passes, aucune cotation ni trading n'est affiché dans l'interface.
