# Trading — Moteur News, passe 6

Les événements sont **fictifs** et tirés par le PRNG déjà sauvegardé du marché individuel. Aucun appel réseau, aucune actualité réellement publiée.

- **Cadence** : nouvelles annonces tous les **2–8 minutes**, par multiples de 5 secondes. La durée de chaque annonce est tirée une seule fois entre **2–30 minutes** ; le prochain horaire et les deux timestamps persistent en sauvegarde v4.
- **Portée** : un actif, un secteur, toutes les actions/cryptos/memecoins d'une catégorie, ou **45 actifs** pour les événements macroéconomiques. Les influences simultanées sont additionnées et bornées avant application, sans modifier les prix directement.
- **Courbes** : chaque pression monte puis s'estompe progressivement ; l'expiration ne force aucun retour en arrière. Le bruit, le momentum et les chocs continuent à agir.
- **Rumeurs** : date de résolution et résultat confirmé/démenti déterminés dès la génération ; ensuite conservés pendant la reprise hors ligne, sans tirage supplémentaire.
- **Historique** : les **10 derniers événements expirés** et **tous les événements actifs** sont conservés. Les champs du récit (titre, texte, scénario, actifs) sont dérivés par `getNewsPresentation`, et le temps restant par `getNewsRemainingMs`.
- **Textes** : **300 histoires originales** sont intégrées (26 premières fiches et 274 nouvelles, réparties en 47 innovations, 33 finances, 37 scandales, 37 nouvelles macro, 38 crypto, 29 hacks, 36 memecoins/sociaux et 17 rumeurs). Les textes ont des titres, descriptions et scénarios distincts. Les huit groupes sont dans `src/trading/news-library/`.
- **Dividendes** : une pression indépendante est déjà calculée sur les actions. La courbe des taux de 1–30 % est déjà influencée graduellement par les News, avec versement chaque seconde et hors ligne.
- **Interface** : l'onglet News et les modales sont jouables ; chaque annonce ouvre ses détails, son scénario, son état et ses actifs concernés.

Fichiers : `src/trading/news.ts`, `src/trading/market.ts`, `src/trading/types.ts`, `src/trading/state.ts`, `src/trading/news.test.ts`.
