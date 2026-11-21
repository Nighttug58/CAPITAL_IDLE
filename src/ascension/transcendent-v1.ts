/**
 * Transcendent PP Shop V2. Seven main branches and three News branches
 * can be purchased regardless of Prestige cycle count. Capital is granted only by actual Prestige.
 * All prices and balances use exact BigInt PP; saves store integer ranks only.
 */
import type { V8CapitalState } from '../exact-state-v8.ts'
import { startingCapitalCents } from './starting-capital-v1.ts'

export const TRANSCENDENT_NEWS_IDS = [
  'news-power', 'news-intensity', 'news-duration',
] as const
export const TRANSCENDENT_IDS = [
  ...TRANSCENDENT_NEWS_IDS,
  'empire', 'trading', 'rentier', 'xp', 'fame', 'heritage', 'starting-capital',
] as const
export type TranscendentId = typeof TRANSCENDENT_IDS[number]
export type TranscendentNewsId = typeof TRANSCENDENT_NEWS_IDS[number]
export const TRANSCENDENT_MAX_LEVEL = 100
export const LEGACY_TRANSCENDENT_MAX_LEVEL = 1_000
export const TRANSCENDENT_MAIN_IDS = [
  'empire', 'trading', 'rentier', 'xp', 'fame', 'heritage', 'starting-capital',
] as const
export const TRANSCENDENT_ECONOMIC_IDS = [
  'empire', 'trading', 'rentier', 'xp', 'fame',
] as const
export type TranscendentMainId = typeof TRANSCENDENT_MAIN_IDS[number]
export type TranscendentEconomicId = typeof TRANSCENDENT_ECONOMIC_IDS[number]
export const TRANSCENDENT_MAIN_PRESENTATION: ReadonlyArray<{
  id:TranscendentMainId; name:string; description:string; effect:string
}> = [
  {id:'empire', name:'Empire financier',description:'Augmente le revenu brut des entreprises sans modifier les prix d’achat.',effect:'+3 points % par rang · max +300 %'},
  {id:'trading',name:'Maître du trading',description:'Amplifie uniquement les profits nets positifs réellement encaissés, jamais le capital ni les pertes.',effect:'+2 points % par rang · max +200 %'},
  {id:'rentier',name:'Rentier',description:'Améliore les dividendes et la création de récompenses de staking en coins.',effect:'+2 points % par rang · max +200 %'},
  {id:'xp',name:'Savoir absolu',description:'Augmente l’XP gagnée lors des revenus éligibles, sans créer de cash.',effect:'+2 points % par rang · max +200 %'},
  {id:'fame',name:'Influence mondiale',description:'Augmente uniquement la Fame nouvellement obtenue en franchissant des niveaux.',effect:'+2 points % par rang · max +200 %'},
  {id:'heritage',name:'Héritage Prestige',description:'Bonifie les PP des prochains cycles. Chaque reçu mémorise le rang appliqué.',effect:'+1 point % par rang · max +100 %'},
  {id:'starting-capital',name:'Capital de départ',description:'Commence chaque nouveau cycle Prestige avec du cash non taxable, sans XP, Fame ou PP gratuits.',effect:'Dotation permanente après Prestige · jusqu’à 1 Qa $'},
]

export type TranscendentShopV1 =
  | { readonly version: 1; readonly levels: Readonly<Record<TranscendentId, number>> }
  | { readonly version: 2; readonly levels: Readonly<Record<TranscendentId, number>> }

export const TRANSCENDENT_NEWS_PRESENTATION: ReadonlyArray<{
  id:TranscendentNewsId; name:string; description:string; effect:string
}> = [
  {id:'news-power',name:'Puissance médiatique',description:'Augmente les pressions haussières et baissières sur les cours et dividendes.',effect:'+2 points % de force par niveau ; jusqu’à ×6 avec Frénésie'},
  {id:'news-intensity',name:'Intensité médiatique',description:'Accélère la montée et la descente de l’effet des news actives.',effect:'Rampe de 20 % à 5 % de la durée de chaque news'},
  {id:'news-duration',name:'Durée médiatique',description:'Prolonge les futures annonces positives et négatives.',effect:'+1 point % de durée par niveau ; jusqu’à ×3 au total'},
]
function emptyLevels(): Record<TranscendentId,number> {
  return Object.fromEntries(TRANSCENDENT_IDS.map(id=>[id,0])) as Record<TranscendentId,number>
}
/** Export name preserved to avoid changing existing imports. Fresh saves are V2. */
export function zeroTranscendentV1(): TranscendentShopV1 {
  return {version:2,levels:emptyLevels()}
}

/** 5 to 202 PP per rank; 8,693 PP per tree, 86,930 PP for all ten. */
export function transcendentNextCost(level:number):bigint|null {
  if(!Number.isSafeInteger(level)||level<0||level>=TRANSCENDENT_MAX_LEVEL)return null
  const n=BigInt(level)
  return 5n+n+n*n/100n
}
/** Exact cumulative cost; max 100 iterations and no floating-point errors. */
export function transcendentSpentThrough(level:number):bigint|null {
  if(!Number.isSafeInteger(level)||level<0||level>TRANSCENDENT_MAX_LEVEL)return null
  let spent=0n
  for(let i=0;i<level;i++)spent+=transcendentNextCost(i)!
  return spent
}
/** The old purchase ledger is immutable so historic save imports can be checked. */
export function transcendentLegacySpentThrough(level:number):bigint|null {
  if(!Number.isSafeInteger(level)||level<0||level>LEGACY_TRANSCENDENT_MAX_LEVEL)return null
  const n=BigInt(level)
  return 1_000n*n + 250n*n*(n-1n)/2n + 10n*n*(n-1n)*(2n*n-1n)/6n
}
export function transcendentSpent(section:unknown):bigint|null {
  if(!section||typeof section!=='object'||Array.isArray(section))return null
  const entry=section as Record<string,unknown>
  if((entry.version!==1&&entry.version!==2)||!entry.levels||
      typeof entry.levels!=='object'||Array.isArray(entry.levels))return null
  const ranks=entry.levels as Record<string,unknown>
  if(Object.keys(ranks).length!==TRANSCENDENT_IDS.length)return null
  let total=0n
  for(const id of TRANSCENDENT_IDS){
    const rank=ranks[id]
    if(typeof rank!=='number'||!Number.isSafeInteger(rank)||rank<0||
       rank>(entry.version===1?LEGACY_TRANSCENDENT_MAX_LEVEL:TRANSCENDENT_MAX_LEVEL))return null
    const spent=entry.version===1?transcendentLegacySpentThrough(rank):transcendentSpentThrough(rank)
    if(spent===null)return null
    total+=spent
  }
  return total
}
export function transcendentLevel(
  progress:{readonly transcendentV1?:TranscendentShopV1},id:TranscendentId,
):number {
  return progress.transcendentV1?.levels[id]??0
}

/** Convert legacy ranks by ceiling(old/10) to avoid losing purchased power.
 * Refund old cost minus the cheaper V2 cost, once, without minting lifetime PP.
 * Historical Prestige receipts and past starting-capital grants are untouched.
 */
export function migrateTranscendentV1(state:V8CapitalState):V8CapitalState {
  const progress=state.ascension.progress
  const previous=progress.transcendentV1
  if(previous?.version===2)return state
  if(previous===undefined)
    return {...state,ascension:{...state.ascension,progress:{
      ...progress,transcendentV1:zeroTranscendentV1()}}}
  const oldSpent=transcendentSpent(previous)
  if(oldSpent===null||previous.version!==1)throw new RangeError('Invalid legacy Transcendent shop')
  const levels=Object.fromEntries(TRANSCENDENT_IDS.map(id=>
    [id,Math.ceil(previous.levels[id]/10)])) as Record<TranscendentId,number>
  const updated:TranscendentShopV1={version:2,levels}
  const newSpent=transcendentSpent(updated)
  if(newSpent===null||newSpent>oldSpent)throw new RangeError('Invalid Transcendent refund')
  const refund=oldSpent-newSpent
  return {...state,ascension:{...state.ascension,progress:{
    ...progress,transcendentV1:updated,
    availablePoints:(BigInt(progress.availablePoints)+refund).toString(),
  }}}
}

/** Single-level, exact and atomic; old saves must migrate before a purchase. */
export function v8BuyTranscendent(
  state:V8CapitalState,id:TranscendentId,expectedRank:number,
):V8CapitalState|null {
  if(!TRANSCENDENT_IDS.includes(id)||
    state.ascension.progress.shopVersion!==2)return null
  const progress=state.ascension.progress
  const section=progress.transcendentV1??zeroTranscendentV1()
  if(section.version!==2||section.levels[id]!==expectedRank||transcendentSpent(section)===null)return null
  const price=transcendentNextCost(expectedRank)
  if(price===null||BigInt(progress.availablePoints)<price)return null
  return {...state,ascension:{...state.ascension,progress:{
    ...progress,availablePoints:(BigInt(progress.availablePoints)-price).toString(),
    transcendentV1:{version:2,levels:{...section.levels,[id]:expectedRank+1}},
  }}}
}
/** Exact MAX purchase through rank 100, never modifying cash, XP or Fame. */
export function v8BuyTranscendentMax(
  state:V8CapitalState,id:TranscendentId,expectedRank:number,
):V8CapitalState|null {
  const first=v8BuyTranscendent(state,id,expectedRank)
  if(!first)return null
  const wallet=BigInt(state.ascension.progress.availablePoints)
  const baseline=transcendentSpentThrough(expectedRank)!
  let lower=expectedRank+1
  let upper=TRANSCENDENT_MAX_LEVEL
  while(lower<upper){
    const middle=Math.floor((lower+upper+1)/2)
    const total=transcendentSpentThrough(middle)!-baseline
    if(total<=wallet)lower=middle
    else upper=middle-1
  }
  const spent=transcendentSpentThrough(lower)!-baseline
  return {...first,ascension:{...first.ascension,progress:{
    ...first.ascension.progress,availablePoints:(wallet-spent).toString(),
    transcendentV1:{version:2,levels:{...first.ascension.progress.transcendentV1!.levels,[id]:lower}},
  }}}
}
/** Retain pass-3 entrypoint and its purchase semantics. */
export function v8BuyTranscendentNews(
  state:V8CapitalState,id:TranscendentNewsId,expectedRank:number,
):V8CapitalState|null {
  if(!TRANSCENDENT_NEWS_IDS.includes(id))return null
  return v8BuyTranscendent(state,id,expectedRank)
}
/** Integer basis points for the five unamplified economic ranks.
 * The reserve-powered ultimate is applied separately by exact V8 reward paths.
 */
export function transcendentEconomicBps(
  progress:{readonly transcendentV1?:TranscendentShopV1},
  id:TranscendentEconomicId,
):number {
  return transcendentLevel(progress,id)*(progress.transcendentV1?.version===1
    ? (id==='empire'?30:20) : (id==='empire'?300:200))
}
/** The seven MAIN trees alone unlock the ultimate reserve; news ranks are irrelevant. */
export function transcendentUltimateUnlocked(
  progress:{readonly transcendentV1?:TranscendentShopV1},
):boolean {
  return TRANSCENDENT_MAIN_IDS.every(id => transcendentLevel(progress,id)===
    (progress.transcendentV1?.version===1?LEGACY_TRANSCENDENT_MAX_LEVEL:TRANSCENDENT_MAX_LEVEL))
}
export interface TranscendentReserveRatio {
  readonly unlocked: boolean
  readonly numerator: bigint
  readonly denominator: bigint
}
/**
 * Exact reserve multiplier: 1 + PP/(2*(PP+1,000,000,000)).
 * The numerator is always smaller than 3/2 of the denominator for
 * every finite nonnegative wallet. No reserve cash or state is stored.
 */
export function transcendentReserveRatio(progress:{
  readonly transcendentV1?:TranscendentShopV1
  readonly availablePoints:string
}):TranscendentReserveRatio {
  const unlocked=transcendentUltimateUnlocked(progress)
  if(!unlocked)return {unlocked:false,numerator:1n,denominator:1n}
  const available=BigInt(progress.availablePoints)
  if(available<0n)throw new RangeError('Negative reserve')
  const denominator=2n*(available+1_000_000_000n)
  return {unlocked:true,numerator:denominator+available,denominator}
}
/** Prestige PP bonus in exact bps: Heritage and completed Museum only.
 * Never apply the ultimate reserve here; each V3 receipt freezes this rate.
 */
export function transcendentHeritageBps(
  progress:{readonly transcendentV1?:TranscendentShopV1},
  museumComplete=false,
):number {
  return 10_000+transcendentLevel(progress,'heritage')*(progress.transcendentV1?.version===1?10:100)+
    (museumComplete?2_500:0)
}
/** Preview only; purchase, import and reload never mint cash. */
export function pendingStartingCapitalCents(
  progress:{readonly transcendentV1?:TranscendentShopV1},
):bigint {
  return startingCapitalCents(transcendentLevel(progress,'starting-capital'),
    progress.transcendentV1?.version===1)??0n
}
/** Deterministic force, envelope and duration multipliers, safe up to rank 100. */
export function transcendentNewsModifiers(
  progress:{readonly transcendentV1?:TranscendentShopV1},
){
  const power=transcendentLevel(progress,'news-power')
  const intensity=transcendentLevel(progress,'news-intensity')
  const duration=transcendentLevel(progress,'news-duration')
  const scale=progress.transcendentV1?.version===1?1:10
  return {
    powerAdditional:power*0.002*scale,
    rampFraction:Math.max(0.05,0.2-intensity*0.00015*scale),
    durationAdditional:duration*0.001*scale,
  }
}
