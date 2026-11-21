/** Fame V4 deterministic catalogue. No new gameplay effects in pass 1. */
export type FameV4Id = 'fame-v4-01' | 'fame-v4-02' | 'fame-v4-03' | 'fame-v4-04' | 'fame-v4-05' | 'fame-v4-06' | 'fame-v4-07' | 'fame-v4-08' | 'fame-v4-09' | 'fame-v4-10' | 'fame-v4-11' | 'fame-v4-12' | 'fame-v4-13' | 'fame-v4-14' | 'fame-v4-15' | 'fame-v4-16' | 'fame-v4-17' | 'fame-v4-18' | 'fame-v4-19' | 'fame-v4-20' | 'fame-v4-21' | 'fame-v4-22' | 'fame-v4-23' | 'fame-v4-24' | 'fame-v4-25' | 'fame-v4-26' | 'fame-v4-27' | 'fame-v4-28' | 'fame-v4-29' | 'fame-v4-30'
export type FameV4Group = 'trading'|'enterprises'|'collections'|'clicks'|'tax'|'prestige'
export interface FameV4Definition {
 readonly id:FameV4Id; readonly group:FameV4Group; readonly label:string
 readonly maxLevel:number; readonly firstCost:bigint; readonly stepCost:bigint; readonly totalCost:bigint
}
const rows: readonly (readonly [FameV4Id,FameV4Group,string,number,bigint,bigint])[] = [
 ['fame-v4-01','trading','Instinct du trader',10,180n,80n],
 ['fame-v4-02','trading','Stop suiveur',5,600n,300n],
 ['fame-v4-03','trading','Empire des dividendes',15,250n,90n],
 ['fame-v4-04','trading','Radar des news',5,600n,250n],
 ['fame-v4-05','trading','Diversification royale',10,180n,80n],
 ['fame-v4-06','trading','Réseau d\'informateurs',1,2800n,0n],
 ['fame-v4-07','trading','Sortie stratégique',5,600n,200n],
 ['fame-v4-08','enterprises','Synergies industrielles',10,300n,120n],
 ['fame-v4-09','enterprises','Recherche et développement',10,350n,150n],
 ['fame-v4-10','enterprises','Contrats gouvernementaux',5,950n,650n],
 ['fame-v4-11','enterprises','Méga-infrastructures',5,1200n,700n],
 ['fame-v4-12','enterprises','Franchise internationale',10,250n,110n],
 ['fame-v4-13','enterprises','Conseil d\'administration',5,500n,300n],
 ['fame-v4-14','collections','Expositions temporaires',5,400n,160n],
 ['fame-v4-15','collections','Restauration de prestige',10,180n,90n],
 ['fame-v4-16','collections','Expert en antiquités',1,1500n,0n],
 ['fame-v4-17','collections','Ventes privées',5,220n,125n],
 ['fame-v4-18','collections','Mécène impérial',5,600n,400n],
 ['fame-v4-19','clicks','Frénésie capitaliste',10,150n,80n],
 ['fame-v4-20','clicks','Billet légendaire',5,400n,200n],
 ['fame-v4-21','clicks','Surcharge automatique',5,500n,250n],
 ['fame-v4-22','clicks','Clic chargé',10,130n,60n],
 ['fame-v4-23','clicks','Réaction en chaîne',10,220n,90n],
 ['fame-v4-24','tax','Réserve fiscale',5,120n,60n],
 ['fame-v4-25','tax','Fidélité fiscale',5,450n,200n],
 ['fame-v4-26','tax','Échelonnement fiscal',5,350n,180n],
 ['fame-v4-27','tax','Optimisation patrimoniale',1,1500n,0n],
 ['fame-v4-28','prestige','Renaissance fulgurante',5,650n,260n],
 ['fame-v4-29','prestige','Défis de milliardaire',10,250n,110n],
 ['fame-v4-30','prestige','Destin du magnat',3,2200n,1300n],
] as const
export const FAME_V4_CATALOG:readonly FameV4Definition[]=Object.freeze(rows.map(([id,group,label,maxLevel,firstCost,stepCost])=>
 Object.freeze({id,group,label,maxLevel,firstCost,stepCost,
 totalCost:BigInt(maxLevel)*firstCost+BigInt(maxLevel)*BigInt(maxLevel-1)/2n*stepCost})))
export const FAME_V4_IDS:readonly FameV4Id[]=Object.freeze(FAME_V4_CATALOG.map(x=>x.id))
const index=new Map(FAME_V4_CATALOG.map(x=>[x.id,x]))
export const FAME_V4_TOTAL_LEVELS=FAME_V4_CATALOG.reduce((s,x)=>s+x.maxLevel,0)
export const FAME_V4_TOTAL_COST=FAME_V4_CATALOG.reduce((s,x)=>s+x.totalCost,0n)
export type FameV4Levels=Record<FameV4Id,number>
export interface FameV4ShopState {
 readonly version:1
 readonly levels:FameV4Levels
 /** Exact V4 purchase subset of prestige.fameSpentMicros. */
 readonly spentMicros:string
}
export function createEmptyFameV4Levels():FameV4Levels {
 return Object.fromEntries(FAME_V4_IDS.map(id=>[id,0])) as FameV4Levels
}
export function createEmptyFameV4Shop():FameV4ShopState {
 return {version:1,levels:createEmptyFameV4Levels(),spentMicros:'0'}
}
export function getFameV4Definition(id:string):FameV4Definition|undefined {
 return index.get(id as FameV4Id)
}
export function fameV4NextCost(id:string,currentLevel:number):bigint|null {
 const x=getFameV4Definition(id)
 return !x||!Number.isSafeInteger(currentLevel)||currentLevel<0||currentLevel>=x.maxLevel
  ? null : x.firstCost+BigInt(currentLevel)*x.stepCost
}
/** Exact strict 30-key ledger, rejecting extras and impossible ranks. */
export function fameV4PurchasedCost(raw:unknown):bigint|null {
 if(raw===null||typeof raw!=='object'||Array.isArray(raw))return null
 const levels=raw as Record<string,unknown>
 if(Object.keys(levels).length!==FAME_V4_CATALOG.length)return null
 let total=0n
 for(const x of FAME_V4_CATALOG){
  if(!Object.hasOwn(levels,x.id))return null
  const rank=levels[x.id]
  if(typeof rank!=='number'||!Number.isSafeInteger(rank)||rank<0||rank>x.maxLevel)return null
  const n=BigInt(rank)
  total+=n*x.firstCost+n*(n-1n)/2n*x.stepCost
 }
 return total
}
