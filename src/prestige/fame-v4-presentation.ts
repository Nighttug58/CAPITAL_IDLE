/** Player-facing V4 effects. These levels are paid now but do not change
 * game economics through their dedicated implementation passes (3-8). */
import { type FameV4Id } from './fame-v4-catalog.ts'
export interface FameV4Presentation {
  readonly description:string
  readonly effect:string
}
export const FAME_V4_PRESENTATION: Readonly<Record<FameV4Id,FameV4Presentation>> = Object.freeze({
  'fame-v4-01': {description:"Analyse des variations récentes, sans prédiction garantie.", effect:"30 s d'analyse par niveau (max 300 s)."},
  'fame-v4-02': {description:"Configure une vente si le cours recule depuis son sommet.", effect:"Seuil minimum : 25, 20, 15, 10 ou 5 % selon le niveau."},
  'fame-v4-03': {description:"Renforce les versements de dividendes sans changer le cours.", effect:"+1 % de dividendes encaissés par niveau (max +15 %)."},
  'fame-v4-04': {description:"Surveille news actives, expirations et pression de marché.", effect:"1 nouvelle fonction d'analyse par niveau, max 5."},
  'fame-v4-05': {description:"Récompense la détention d'actions réellement diversifiées.", effect:"+1 % de plafond dividendes par niveau (max +10 %)."},
  'fame-v4-06': {description:"Débloque le journal analytique des news enregistrées.", effect:"Historique détaillé de 100 news si disponibles."},
  'fame-v4-07': {description:"Programme des sorties partielles sur objectifs de plus-value.", effect:"Pourcentages 25/50/75/100 et 3 objectifs au rang 5."},
  'fame-v4-08': {description:"Associe deux entreprises pour profiter d'une synergie.", effect:"+1 % de revenu par niveau pour chacune des deux entreprises."},
  'fame-v4-09': {description:"Réduit le coût futur des améliorations d'entreprises.", effect:"−0,8 % de coût par niveau (max −8 %)."},
  'fame-v4-10': {description:"Débloque des contrats à capital bloqué, gains et risques.", effect:"1 contrat simultané par niveau, max 5."},
  'fame-v4-11': {description:"Finance de très grandes infrastructures en dollars.", effect:"1 projet géant débloqué par niveau, max 5."},
  'fame-v4-12': {description:"Spécialise une entreprise choisie en franchise.", effect:"+1 % des revenus de la franchise par niveau."},
  'fame-v4-13': {description:"Désigne une entreprise principale à renforcer.", effect:"+3 % de revenus de l'entreprise choisie par niveau."},
  'fame-v4-14': {description:"Organise des expositions de collections temporaires.", effect:"+1 % sur entreprises et dividendes par niveau durant 30 min."},
  'fame-v4-15': {description:"Restaure des objets acquis, contre une dépense en dollars.", effect:"2 restaurations supplémentaires possibles par niveau."},
  'fame-v4-16': {description:"Affiche les objets manquants et les objectifs du musée.", effect:"Tableau d'analyse des collections."},
  'fame-v4-17': {description:"Débloque des ventes privées temporaires sur objets manquants.", effect:"1 offre par jour et −1 % de prix par niveau."},
  'fame-v4-18': {description:"Finance des ailes permanentes du Musée impérial.", effect:"1 aile débloquée par niveau, +0,5 % revenus par aile."},
  'fame-v4-19': {description:"Entre en frénésie grâce aux clics manuels rapides.", effect:"+2,5 % aux clics manuels en frénésie par niveau."},
  'fame-v4-20': {description:"Fait apparaître un billet rare à récupérer manuellement.", effect:"Fréquence et récompense augmentent de 1 à 5."},
  'fame-v4-21': {description:"Accélère temporairement l'Auto Click acheté en dollars.", effect:"4 s de surcharge par niveau (max 20 s), cooldown 15 min."},
  'fame-v4-22': {description:"Charge une grosse frappe après une pause de clics.", effect:"Multiplicateur de clic chargé ×2 par niveau (max ×20)."},
  'fame-v4-23': {description:"Peut déclencher des clics bonus non récursifs.", effect:"+0,5 point de probabilité par niveau (max 5 %)."},
  'fame-v4-24': {description:"Bloque volontairement du cash pour les taxes futures.", effect:"20 % de la dette réservés par niveau (max 100 %)."},
  'fame-v4-25': {description:"Récompense certains paiements anticipés d'impôts.", effect:"−1 % de la prochaine échéance par niveau (max −5 %)."},
  'fame-v4-26': {description:"Permet de fractionner une dette fiscale avec des frais.", effect:"2 à 6 versements autorisés selon le niveau."},
  'fame-v4-27': {description:"Analyse patrimoine, charges, frais et bénéfices réels.", effect:"Bilan patrimonial avancé."},
  'fame-v4-28': {description:"Ajoute un bonus temporaire au début d'un Prestige.", effect:"+1 minute de bonus clics et entreprises par niveau."},
  'fame-v4-29': {description:"Débloque des défis ponctuels à chaque cycle de Prestige.", effect:"1 défi supplémentaire par niveau, maximum 10."},
  'fame-v4-30': {description:"Choisit une spécialisation au début du cycle.", effect:"Trader −2 % frais, Industrie +2 %, Collections +1 % par niveau."},
})
export const FAME_V4_GROUP_TABS = Object.freeze([
  {id:'classic',label:'Classique',hint:'Les 6 bonus historiques',pass:0},
  {id:'trading',label:'Trading',hint:'Marchés et automatisations',pass:3},
  {id:'enterprises',label:'Entreprises',hint:'Industrie et investissements',pass:4},
  {id:'collections',label:'Collections',hint:'Luxe et musée',pass:5},
  {id:'clicks',label:'Clics',hint:'Production active',pass:6},
  {id:'tax',label:'Fiscalité',hint:'Impôts et patrimoine',pass:7},
  {id:'prestige',label:'Prestige',hint:'Renaissance et spécialisations',pass:8},
] as const)
export type FameV4Tab=typeof FAME_V4_GROUP_TABS[number]['id']

/** Static preview for purchased V4 rank; the active effect is computed by V8. */
export function fameV4RankPreview(id:FameV4Id,level:number):string {
 if(!Number.isSafeInteger(level)||level<0)return '—'
 if(level===0)return 'Non acquis'
 switch(id){
  case 'fame-v4-01':return `${level*30} s analysées`
  case 'fame-v4-02':return `Stop dès −${[25,20,15,10,5][level-1]} % (réglable)`
  case 'fame-v4-03':return `+${level} % de dividendes`
  case 'fame-v4-04':return `${level}/5 outils de news`
  case 'fame-v4-05':return `Plafond +${level} % de dividendes`
  case 'fame-v4-06':return 'Historique débloqué'
  case 'fame-v4-07':return level===5?'3 objectifs de vente':'Sortie '+[25,50,75,100][level-1]+' %'
  case 'fame-v4-08':return `+${level} % sur la paire`
  case 'fame-v4-09':return `−${(level*.8).toFixed(1).replace('.',',')} % coûts`
  case 'fame-v4-10':return `${level} contrat(s) simultané(s)`
  case 'fame-v4-11':return `${level} projet(s) disponibles`
  case 'fame-v4-12':return `+${level} % sur une franchise`
  case 'fame-v4-13':return `+${level*3} % entreprise principale`
  case 'fame-v4-14':return `+${level} % pendant une exposition`
  case 'fame-v4-15':return `${level*2} restaurations possibles`
  case 'fame-v4-16':return 'Tableau musée débloqué'
  case 'fame-v4-17':return `${level} offre(s)/jour · −${level} %`
  case 'fame-v4-18':return `${level} aile(s) déblocables`
  case 'fame-v4-19':return `+${(level*2.5).toString().replace('.',',')} % en frénésie`
  case 'fame-v4-20':return `Billet rare niveau ${level}/5`
  case 'fame-v4-21':return `${level*4} s de surcharge`
  case 'fame-v4-22':return `Clic chargé ×${level*2}`
  case 'fame-v4-23':return `${(level*.5).toString().replace('.',',')} % de déclenchement`
  case 'fame-v4-24':return `${level*20} % des taxes réservés`
  case 'fame-v4-25':return `−${level} % taxe admissible`
  case 'fame-v4-26':return `${level+1} versements possibles`
  case 'fame-v4-27':return 'Bilan détaillé débloqué'
  case 'fame-v4-28':return `${level} min de boost initial`
  case 'fame-v4-29':return `${level} défi(s) par cycle`
  case 'fame-v4-30':return `Trader −${level*2} % / Industrie +${level*2} % / Luxe +${level} %`
 }
}
