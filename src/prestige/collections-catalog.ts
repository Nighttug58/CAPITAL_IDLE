import {
  COLLECTION_CATEGORIES, COLLECTION_SLOTS, CURRENT_COLLECTION_SLOTS, getCollectionSlot,
  type CollectionCategoryId, type CollectionPriceSlot,
} from './catalog.ts'

export interface CollectionItem extends CollectionPriceSlot {
  readonly name: string
  readonly description: string
  readonly visualTag: string
}

// Catalogue fictif d'objets prestigieux, inspiré de grandes traditions
// horlogères, automobiles, artistiques et muséales. Les noms ne désignent
// pas des lots authentifiés ou des œuvres réellement mises en vente.
interface ItemDescription {
  readonly name: string
  readonly description: string
}

const descriptions: Readonly<Record<CollectionCategoryId, readonly ItemDescription[]>> = {
  watches: [
    { name: 'Montre de poche Belle Époque', description: 'Un boîtier gravé et un cadran émaillé évoquant les garde-temps du tournant du XXe siècle.' },
    { name: 'Chronographe des Aviateurs', description: 'Un chronographe mécanique inspiré des instruments de navigation aérienne et de leurs compteurs précis.' },
    { name: 'Montre Art déco en or', description: 'Une montre aux lignes géométriques et aux aiguilles fines, hommage au design des années 1920.' },
    { name: 'Calendrier Triple Héritage', description: 'Une pièce de collection fictive réunissant date, jour et mois dans un mouvement traditionnel.' },
    { name: 'Chronomètre de Marine', description: 'Un garde-temps de précision inspiré des horloges embarquées à bord des navires d’exploration.' },
    { name: 'Tourbillon des Alpes', description: 'Une création horlogère imaginaire mettant à l’honneur le tourbillon et une finition artisanale.' },
    { name: 'Répétition Minutes Royale', description: 'Une grande complication fictive dont le mécanisme sonne les heures et les minutes sur demande.' },
    { name: 'Perpétuelle en Platine', description: 'Un calendrier perpétuel de prestige dans un boîtier en platine aux proportions classiques.' },
    { name: 'Grande Sonnerie Impériale', description: 'Une montre de haute horlogerie imaginaire conjuguant sonnerie automatique et architecture complexe.' },
    { name: 'Chef-d’œuvre Astronomique', description: 'Une pièce d’exception fictive intégrant indications célestes, calendrier et complications de collectionneur.' },
  ],
  autos: [
    { name: 'Roadster Héritage', description: 'Un petit roadster classique, léger et ouvert, inspiré des premières voitures de sport européennes.' },
    { name: 'Coupé Grand Tourisme', description: 'Une silhouette allongée et un intérieur en cuir évoquant les longues routes du milieu du XXe siècle.' },
    { name: 'Cabriolet Riviera', description: 'Un cabriolet de collection fictif au chrome brillant, conçu pour les voyages en bord de mer.' },
    { name: 'Berlinette de Rallye', description: 'Une sportive compacte inspirée des machines engagées dans les rallyes historiques.' },
    { name: 'Supercar des Années 1980', description: 'Un modèle imaginaire au profil en coin et aux prises d’air spectaculaires.' },
    { name: 'Prototype Endurance V12', description: 'Une voiture de course fictive inspirée des prototypes d’endurance à douze cylindres.' },
    { name: 'Hypercar Carbone', description: 'Une hypercar rare à carrosserie en fibre de carbone, pensée autour de l’aérodynamique.' },
    { name: 'Grand Tourisme de Concours', description: 'Une automobile d’exception restaurée dans l’esprit des concours d’élégance internationaux.' },
    { name: 'Monoplace Historique', description: 'Une monoplace de collection fictive évoquant l’âge d’or de la compétition automobile.' },
    { name: 'Hypercar Unique du Sultan', description: 'Un exemplaire imaginaire réalisé sur commande, associant mécanique extrême et finition sur mesure.' },
  ],
  paintings: [
    { name: 'Les Fleurs du Matin', description: 'Une nature morte fictive aux touches délicates, inspirée de la peinture de jardin.' },
    { name: 'Lumière sur le Lac', description: 'Un paysage imaginaire où les reflets du soleil jouent sur une eau calme.' },
    { name: 'Portrait de la Dame Bleue', description: 'Un portrait de salon fictif mettant en valeur les étoffes et les contrastes lumineux.' },
    { name: 'Jardin des Impressionnistes', description: 'Une scène peinte imaginaire inspirée des recherches sur la lumière et la couleur au XIXe siècle.' },
    { name: 'La Nuit de Venise', description: 'Une vue nocturne fictive mêlant palais, canaux et lumières sur l’eau.' },
    { name: 'Le Bal des Ombres', description: 'Une vaste composition imaginaire inspirée des salons européens et de la peinture de genre.' },
    { name: 'La Renaissance des Rois', description: 'Une toile monumentale fictive empruntant ses codes à la peinture historique classique.' },
    { name: 'L’Atelier des Maîtres', description: 'Une œuvre d’apparat imaginaire évoquant les ateliers de peintres et leurs héritages techniques.' },
    { name: 'Les Jardins de l’Éternité', description: 'Une composition de musée fictive associant architecture, végétation et perspective profonde.' },
    { name: 'Le Trésor des Lumières', description: 'Un chef-d’œuvre imaginaire extrêmement rare, symbole de prestige pour une collection privée.' },
  ],
  antiquities: [
    { name: 'Amphore de Méditerranée', description: 'Une amphore de collection fictive inspirée des céramiques antiques du monde méditerranéen.' },
    { name: 'Monnaie du Royaume Ancien', description: 'Une pièce frappée imaginaire rappelant les anciens échanges entre cités et royaumes.' },
    { name: 'Lampe à Huile Romaine', description: 'Une lampe ancienne fictive dont les décors rappellent l’artisanat de l’Antiquité romaine.' },
    { name: 'Mosaïque des Quatre Vents', description: 'Un panneau mosaïqué fictif composé de tesselles colorées et de motifs géométriques.' },
    { name: 'Statuette du Nil', description: 'Une petite figure imaginaire inspirée de l’iconographie des civilisations du Nil.' },
    { name: 'Heaume des Chevaliers', description: 'Un casque de prestige fictif évoquant l’armement de cérémonie médiéval.' },
    { name: 'Astrolabe du Savant', description: 'Un instrument astronomique imaginaire inspiré des astrolabes utilisés pour observer le ciel.' },
    { name: 'Codex des Royaumes', description: 'Un manuscrit enluminé fictif dont chaque page illustre une chronique de cour.' },
    { name: 'Sceptre de l’Empereur', description: 'Un insigne cérémoniel imaginaire associant métal précieux, gravure et pierres décoratives.' },
    { name: 'Trône de la Dynastie Perdue', description: 'Une pièce muséale fictive monumentale, conçue comme le joyau d’une collection d’antiquités.' },
  ],
  jewelry: [
    { name: 'Pendentif Étoile d’Argent', description: 'Un pendentif délicatement travaillé autour d’un motif étoilé et d’une monture en argent.' },
    { name: 'Bague Saphir Céleste', description: 'Une bague imaginaire dont le saphir bleu domine une monture classique.' },
    { name: 'Bracelet de Rubis', description: 'Un bracelet précieux fictif ponctué de rubis et d’une fine ornementation.' },
    { name: 'Collier de Perles Rares', description: 'Une parure de collection inspirée des rangs de perles traditionnels et de leurs fermoirs ouvragés.' },
    { name: 'Diadème des Orchidées', description: 'Un diadème fictif aux motifs floraux sertis de pierres lumineuses.' },
    { name: 'Émeraude de la Couronne', description: 'Un bijou d’apparat imaginaire centré sur une imposante émeraude taillée.' },
    { name: 'Parure des Mille Diamants', description: 'Un ensemble de haute joaillerie fictif dont le pavage de diamants crée une lumière continue.' },
    { name: 'Diamant de l’Aurore', description: 'Une gemme de prestige imaginaire montée en solitaire pour une collection privée.' },
    { name: 'Couronne des Étoiles', description: 'Une couronne cérémonielle fictive associant diamants, saphirs et travail d’orfèvrerie.' },
    { name: 'Diamant Impérial Unique', description: 'Une création de haute joaillerie imaginaire, pièce maîtresse d’un patrimoine d’exception.' },
  ],
}

const categoryVisuals: Readonly<Record<CollectionCategoryId, string>> = Object.freeze({
  watches: 'watch',
  autos: 'car',
  paintings: 'palette',
  antiquities: 'landmark',
  jewelry: 'gem',
})

export const COLLECTION_ITEMS: readonly CollectionItem[] = Object.freeze(COLLECTION_SLOTS.map((slot) => {
  const copy = descriptions[slot.category][slot.rank - 1]
  if (!copy) throw new Error(`Description de collection manquante : ${slot.id}`)
  return Object.freeze({
    ...slot, name: copy.name, description: copy.description,
    visualTag: categoryVisuals[slot.category],
  })
}))
const extraDescriptions = {
  watches: [
    {"name": "Montre de gare à double cadran", "description": "Deux cadrans opposés permettaient de lire l’heure depuis les deux quais."},
    {"name": "Chronographe de régate", "description": "Un compte à rebours coloré marque les minutes précédant le départ."},
    {"name": "Heure sautante en émail", "description": "Un disque chiffré saute à chaque heure sous un guichet en émail."},
    {"name": "Montre à disque lunaire", "description": "Une lune gravée tourne sous un ciel en aventurine."},
    {"name": "Pendule de bord en acajou", "description": "Son coffret suspendu sur cardan garde le cadran horizontal en mer."},
    {"name": "Tourbillon à cage inclinée", "description": "La cage ajourée tourne en biais sous un pont poli."},
    {"name": "Répétition à timbres cathédrale", "description": "Deux longs timbres enroulés autour du mouvement prolongent la sonnerie."},
    {"name": "Régulateur sidéral", "description": "Une aiguille indique le passage des étoiles au méridien."},
    {"name": "Horloge à équation du temps", "description": "Un cadran secondaire compare le temps solaire au temps moyen."},
    {"name": "Planétaire mécanique de Genève", "description": "Un train de roues miniature reproduit les orbites des planètes."},
  ],
  autos: [
    {"name": "Cyclecar à deux places", "description": "Une carrosserie étroite abrite deux sièges disposés en tandem."},
    {"name": "Coupé à carrosserie aluminium", "description": "Les panneaux martelés à la main conservent leurs rivets apparents."},
    {"name": "Speedster des lacs", "description": "Un pare-brise bas épouse le profil des deux baquets."},
    {"name": "Barquette de course de côte", "description": "Une carrosserie ouverte et légère recouvre le châssis court."},
    {"name": "Groupe B à moteur central", "description": "Le moteur se loge derrière les sièges sous un capot à persiennes."},
    {"name": "Prototype des 24 Heures", "description": "Ses phares additionnels et son réservoir à remplissage rapide témoignent des relais de nuit."},
    {"name": "GT à châssis titane", "description": "Les soudures du châssis restent visibles derrière les portes papillon."},
    {"name": "Flèche des records", "description": "La carrosserie fuselée enveloppe les roues pour les tentatives de vitesse."},
    {"name": "Monoplace à six roues", "description": "Quatre petites roues directrices se partagent le train avant."},
    {"name": "Collection des douze prototypes", "description": "Douze voitures d’essai retracent les étapes de développement d’une même lignée."},
  ],
  paintings: [
    {"name": "Étude au fusain sur papier bleu", "description": "Quelques traits de fusain et des rehauts blancs dessinent un visage de profil."},
    {"name": "Les Barques de l’aube", "description": "Des coques ocre se reflètent sur une eau encore grise."},
    {"name": "Portrait au miroir", "description": "Le modèle apparaît de face dans le miroir et de dos au premier plan."},
    {"name": "Les Serres sous la pluie", "description": "Des gouttes de pluie fractionnent les couleurs sous les verrières."},
    {"name": "Canal sous la neige", "description": "Une ligne de péniches sombres traverse la toile presque blanche."},
    {"name": "Le Théâtre désert", "description": "La lumière de service éclaire une scène vide et ses décors roulés."},
    {"name": "Fresque des navigateurs", "description": "Une carte maritime peinte relie les personnages d’un même équipage."},
    {"name": "Triptyque aux feuilles d’or", "description": "Trois panneaux sur bois composent un paysage continu sur fond doré."},
    {"name": "La Galerie des saisons", "description": "Quatre grandes huiles suivent le même jardin du gel à la récolte."},
    {"name": "Cycle des douze constellations", "description": "Douze toiles de nuit dessinent ensemble le ciel d’une année."},
  ],
  antiquities: [
    {"name": "Fibule en bronze", "description": "Une spirale de bronze forme le ressort de cette agrafe de vêtement."},
    {"name": "Sceau du marchand", "description": "La matrice gravée imprime une marque de cargaison dans la cire."},
    {"name": "Coupe aux dauphins", "description": "Deux dauphins modelés forment les anses de la coupe."},
    {"name": "Tablette des astronomes", "description": "Des colonnes de signes consignent une série d’observations lunaires."},
    {"name": "Masque funéraire doré", "description": "Une feuille d’or épouse les reliefs du visage sculpté."},
    {"name": "Reliquaire en cristal de roche", "description": "Une capsule de quartz taillé repose dans une monture ouvragée."},
    {"name": "Globe céleste damasquiné", "description": "Des fils d’argent incrustés dessinent les constellations sur la sphère."},
    {"name": "Atlas des routes de soie", "description": "Les feuillets aquarellés indiquent cols, oasis et étapes caravanières."},
    {"name": "Portail du palais de jade", "description": "Deux vantaux sculptés composent une scène de procession."},
    {"name": "Salle des mosaïques impériales", "description": "Des panneaux de tesselles assemblés restituent le sol complet d’une salle de réception."},
  ],
  jewelry: [
    {"name": "Broche feuille de ginkgo", "description": "Les nervures de la feuille sont gravées une à une dans le métal."},
    {"name": "Boucles d’oreilles en opale", "description": "Deux cabochons assortis renvoient des éclats bleus et verts."},
    {"name": "Bague à grenat étoilé", "description": "Une étoile à six branches apparaît sur la pierre sous une lumière directe."},
    {"name": "Collier de corail sculpté", "description": "Les perles sculptées alternent boutons de rose et feuilles."},
    {"name": "Peigne de jade impérial", "description": "Les dents et la poignée ajourée ont été taillées dans un seul bloc."},
    {"name": "Sautoir aux perles noires", "description": "Un fil de perles sombres se termine par un pompon articulé."},
    {"name": "Aigrette en diamants jaunes", "description": "Une monture souple fait vibrer les pierres au moindre mouvement."},
    {"name": "Diadème de spinelles", "description": "Des spinelles rouges dessinent une ligne de fleurs ouvertes."},
    {"name": "Pectoral aux sept émeraudes", "description": "Sept pierres étagées sont reliées par des charnières dissimulées."},
    {"name": "Parure du diamant boréal", "description": "Collier, broche et pendants reprennent la même taille autour d’un diamant bleu."},
  ],
} as const

export const CURRENT_COLLECTION_ITEMS = CURRENT_COLLECTION_SLOTS.map(slot => {
  const index = Math.floor((slot.rank - 1) / 2)
  const copy = slot.rank % 2 ? descriptions[slot.category][index]! :
    extraDescriptions[slot.category][index]!
  return { ...slot, ...copy, visualTag: categoryVisuals[slot.category] }
})
const itemById = new Map<string, CollectionItem>(COLLECTION_ITEMS.map((item) => [item.id, item]))
const itemsByCategory = Object.freeze(Object.fromEntries(COLLECTION_CATEGORIES.map(({ id }) => [
  id, Object.freeze(COLLECTION_ITEMS.filter((item) => item.category === id)),
])) as Record<CollectionCategoryId, readonly CollectionItem[]>)

export function getCollectionItem(id: string): CollectionItem | undefined {
  return itemById.get(id)
}

export function getCollectionItemsByCategory(category: string): readonly CollectionItem[] {
  return itemsByCategory[category as CollectionCategoryId] ?? []
}

/** Valeur comptable : coût d'acquisition, sans variation de cours ni revente. */
export function getCollectionBookValueCents(ownedIds: readonly string[]): number | null {
  let total = 0
  for (const id of ownedIds) {
    const item = getCollectionSlot(id)
    if (!item || !Number.isSafeInteger(total + item.priceCents)) return null
    total += item.priceCents
  }
  return total
}
