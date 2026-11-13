# Dividendes dynamiques — CAPITAL_IDLE (passe 7)

## Rendements

- Les **20 entreprises fictives** ont chacune un rendement **annuel indépendant du cours**, borné strictement entre **1 % et 30 %**.
- Il fluctue légèrement à chaque tick de marché (**5 secondes**) grâce à une inertie, du bruit lent et une tendance individuelle ; une pression News positive ou négative modifie **progressivement la pente**. Variation plafonnée à **0,024 point de pourcentage par tick**. La fin d'une annonce ne produit **aucune remise à zéro**, le rendement repart de sa valeur actuelle.
- Les cryptomonnaies et memecoins **n'ont aucun dividende**. Le prix courant d'une action ne change pas le montant directement : le revenu dépend de **quantité × prix de référence fixe × taux annuel courant**.

## Versement, même hors ligne

- **24 heures réelles = 1 année de jeu** ; montant **par seconde** = quantité × prix de référence × taux / 86 400.
- Un seul scheduler traite les **secondes des dividendes** ; le marché/les News continuent d'avancer toutes les **5 secondes**. Les fenêtres de 256 secondes sont rejouées en tranches non bloquantes. Une horloge de versement `dividendLastPaidAt` est sauvegardée afin de ne jamais payer deux fois la même seconde, même en cours de rattrapage.
- Le flux est crédité au **solde unique** et à `game.lifetimeEarned` (progression des niveaux), au centime entier sans arrondi artificiel. Les **fractions de centime** sont conservées dans `dividendCarry` et créditées dès qu'elles atteignent un centime. Les centimes non payables au plafond monétaire sont conservés dans `dividendPendingCents`.
- Les achats/ventes n'altèrent ni le cumul de dividendes déjà encaissés ni la trajectoire des taux. Une fois une position vendue, elle ne génère plus de dividendes. Aucune allocation rétroactive n'est prévue pour les vieux états v4 (leur compteur de versements est initialisé au dernier tick connu).
- Le clicker demeure visuellement inchangé. Le runtime évite les écritures localStorage une par seconde lors d'un rattrapage ; les écritures sont regroupées. Des tests comparent une réouverture **24 h après** à un rejeu intégral seconde par seconde, avec News et cours identiques.

## Fichiers

- `src/trading/yield.ts` : rendement annuel propre à chaque entreprise.
- `src/trading/dividends.ts` : calcul, accumulation au centime et versement par seconde.
- `src/trading/market.ts`, `src/trading/clock.ts`, `src/trading/runtime.ts` : synchronisation unique.
- `src/trading/types.ts`, `src/trading/state.ts` : compatibilité des sauvegardes.
- `src/trading/dividends.test.ts` : tests d'intégration et hors ligne.

L'interface Trading/Portfolio et l'affichage des taux arrivent aux passes 8 et 9.
