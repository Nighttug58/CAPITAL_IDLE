# Trading — économie des transactions (passe 5)

Le **moteur financier** est dans `src/trading/trades.ts`. L'écran Acheter/Vendre et le Portfolio graphique arriveront dans les passes UI suivantes ; cette passe n'ajoute pas de nouvel écran.

## Règles

- **Un seul solde** : `CapitalState.game.balance`. Les unités des titres sont stockées dans `trading.positions`, **jamais un second portefeuille monétaire**.
- Toutes les sommes persistées restent en **dollars** pour préserver les sauvegardes v1–v4, mais les transferts sont calculés en **centimes entiers**. Les anciens entiers et les nouveaux nombres à deux décimales restent rechargeables.
- Frais appliqués **aux deux sens** : actions **0,5 %**, cryptos **1 %**, memecoins **1,5 %**. Le montant brut à l'achat est arrondi **vers le haut** au centime et le montant brut à la vente **vers le bas**. Chaque commission est arrondie **au centime supérieur** avec un minimum de **0,01 $** par ordre. Les micro-ordres invendables au même cours sont refusés.
- Achats fractionnaires selon `quantityDecimals` du catalogue ; quantité positive, fonds et stock restant contrôlés ; **25 % / 50 % / MAX** des quantités disponibles ou détenues. MAX achat est déterminé frais et arrondis compris, par recherche bornée. MAX vente correspond à 100 % des titres.
- Prix d'exécution = dernière cotation simulée, ou prix du catalogue si le premier tick n'a pas encore eu lieu. Aucun ordre ne peut utiliser un prix non fini ou hors borne.
- `Position.costBasis` inclut **prix d'achat + frais**, tous au centime. À la vente partielle, les frais d'achat sont répartis dans le coût moyen ; à la dernière vente, **tous les centimes restants du coût** sont soldés.
- `trading.realizedNetProfit` peut être négatif. `trading.creditedTradingProfit` est le **plus haut total net positif déjà reconnu pour les niveaux**. Ainsi le cumul gagné n'augmente que lorsque le résultat net réalisé dépasse son précédent maximum : perte puis récupération du même profit ne le comptent jamais deux fois. Les niveaux existants ne baissent jamais. Le capital restitué et les gains latents ne comptent jamais.
- `getPortfolio` fournit quantités, coût moyen frais inclus, valeur actuelle, P&L latent **après frais de vente hypothétiques**, P&L réalisé et valeur totale. Les dividendes annuels sont **estimés** mais pas encore versés (passe 7).
- L'argent reste exprimé en dollars dans les sauvegardes. Afin de garantir les opérations en centimes sans débordement IEEE-754, une transaction dont la conversion monétaire dépasse `Number.MAX_SAFE_INTEGER` centimes est refusée explicitement.
- Le moteur est une série de **fonctions pures** : ordre refusé = **même état inchangé** ; ordre réussi = nouvel état et reçu transactionnel. Les tests couvrent frais, fractions, arbitrage par aller-retour, niveaux, pertes, revente partielle, 100 % de Bitcoin, garde-fous et restauration.

## Fichiers

- `src/trading/trades.ts` : achat, vente, calcul de MAX, Portfolio, reçus, erreurs.
- `src/trading/types.ts` : compteur de profit net reconnu dans l'état du Trading.
- `src/trading/state.ts` : persistance v4 rétrocompatible (ancien v4 sans compteur reconnu à 0).
- `src/game.ts` : restauration du clicker accepte maintenant les montants à deux décimales.
- `src/trading/trades.test.ts` : tests financiers automatisés.

La suite : passe 6 = News, passe 7 = dividendes dynamiques avec revenus réels, passes 8–9 = interface de Trading.
