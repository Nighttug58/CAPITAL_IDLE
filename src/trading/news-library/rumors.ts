import { buildStories } from './builder.ts'
export const RUMOR_STORIES = buildStories({
  prefix:'rumor',category:'rumor',kind:'stock',target:'single',direction:1,priceWeight:.88,dividendWeight:.22,rumored:true
}, `
{asset} serait prêt à racheter un concurrent|Des conversations non attribuées évoquent une acquisition imminente, mais aucun dirigeant n'a confirmé l'existence de négociations.|Une confirmation renforcerait le cours, un démenti pourrait renverser le mouvement.
{asset} envisagerait de changer de direction|Une publication anonyme prétend qu'un nouveau dirigeant serait présenté bientôt, sans document officiel à l'appui.|L'incertitude managériale peut créer des variations de prix.|-
{asset} préparerait un dividende exceptionnel|Des messages évoquent une redistribution importante de trésorerie qui n'apparaît dans aucun calendrier officiel connu.|Le rendement pourrait réagir si la décision se matérialise.
{asset} cacherait un retard industriel majeur|Un document non authentifié circule au sujet de livraisons qui seraient reportées de plusieurs mois.|Un démenti documenté pourrait calmer la spéculation.|-
{asset} disposerait d'un contrat stratégique secret|Des forums affirment qu'un grand client aurait signé un accord inédit, mais aucune annonce n'en confirme le périmètre.|L'effet positif pourrait s'inverser rapidement.
{asset} aurait perdu un partenaire important|Un message attribué à un ancien fournisseur évoque une rupture commerciale, sans preuve vérifiable à ce stade.|La clarification des faits pourrait changer la tendance.|-
{asset} préparerait une technologie inattendue|Une photographie floue est interprétée comme le prototype d'un produit révolutionnaire, mais son origine reste inconnue.|Une annonce officielle pourrait modifier les attentes.
{asset} serait visé par une lourde sanction|Des publications non sourcées évoquent une procédure réglementaire qui n'apparaît pas dans les communications publiques.|Une confirmation pèserait sur la confiance.|-
{asset} intéresserait un nouveau fonds industriel|Des observateurs prétendent que plusieurs gestionnaires examinent une entrée importante au capital de l'entreprise.|Le cours pourrait réagir à une participation réellement annoncée.
{asset} devrait suspendre une distribution future|Des analystes anonymes évoquent un manque de trésorerie qui pourrait imposer de revoir le calendrier des actionnaires.|La confirmation éventuelle serait défavorable au rendement.|-
{asset} préparerait un lancement surprise|Une invitation mystérieuse relayée sur les réseaux est présentée comme le signe d'une nouvelle gamme commerciale.|Le marché attend des informations concrètes.
{asset} pourrait fermer plusieurs sites|Une liste anonyme de bâtiments circule en ligne et laisse penser à une restructuration plus large que prévu.|Le sentiment pourrait rester prudent jusqu'à clarification.|-
{asset} aurait trouvé un nouveau financement|Des échanges entre investisseurs évoquent un accord bancaire favorable qui n'a pas encore été publié.|Un financement confirmé pourrait soutenir les projets.
{asset} connaîtrait des difficultés chez un sous-traitant|Une alerte sans signature évoque des ruptures de composants et des retards de production imminents.|Un éventuel démenti pourrait réduire la pression vendeuse.|-
{asset} serait invité dans un grand indice boursier|Des spéculations font état d'un changement de composition qui pourrait attirer des fonds suivant automatiquement cet indice.|L'effet resterait théorique tant qu'aucune décision n'est publiée.
{asset} risquerait un rappel de produits inédit|Des images isolées sont présentées comme des preuves de défauts qui n'ont fait l'objet d'aucune notification officielle.|Le marché pourrait corriger violemment en cas de confirmation.|-
{asset} négocierait une licence lucrative|Des discussions informelles évoquent une technologie que plusieurs partenaires voudraient exploiter contre des redevances.|Les recettes anticipées pourraient être surévaluées sans annonce officielle.
`);
