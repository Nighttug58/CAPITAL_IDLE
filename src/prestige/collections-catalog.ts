import {
  COLLECTION_CATEGORIES, COLLECTION_SLOTS,
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
    const item = getCollectionItem(id)
    if (!item || !Number.isSafeInteger(total + item.priceCents)) return null
    total += item.priceCents
  }
  return total
}
