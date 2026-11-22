import { prestigeSpent, prestigePoints, prestigePointsV4 } from './ascension/v2.ts'
import { transcendentSpent } from './ascension/transcendent-v1.ts'
import { TRANSCENDENT_MAX_LEVEL } from './ascension/transcendent-v1.ts'
import { startingCapitalCents } from './ascension/starting-capital-v1.ts'
import { validLegacyBoundary } from './trading/legacy-boundary.ts'
/**
 * Strict V8 serialization contract. No BigInt is ever written to JSON; all
 * economic amounts are canonical decimal strings. This validator is applied on active V8 writes, imports and migrations.
 * Invalid saves are rejected before being accepted as the authoritative state.
 */
import { decodeExactInteger } from './large-numbers.ts'
import type { AssetDecimals } from './exact-save-v8.ts'
import { getPurchasedFameBoostCost, getVersionedPurchasedFameCost } from './prestige/catalog.ts'
import { fameV4PurchasedCost } from './prestige/fame-v4-catalog.ts'
import { ascensionSpentPoints } from './ascension/catalog.ts'
import { getAsset, ASSETS } from './trading/catalog.ts'
import { getNewsTemplate } from './trading/news.ts'
import { getExactLevel, getExactV3Level, rebaseV3ExperienceCents } from './exact-levels.ts'
import { CURRENT_COLLECTION_SLOTS, currentCollectionId, getCollectionSlot } from './prestige/catalog.ts'
import { collectionV3Snapshot } from './prestige/collections-v3.ts'
import { V4_WING_COSTS_CENTS,v4RestoreCostCents,V4_EXHIBITION_DURATION_MS,
  V4_EXHIBITION_COOLDOWN_MS,V4_PRIVATE_OFFER_MS } from './prestige/collections-v4.ts'
import { MAX_SAFE_CYCLE, projectedPrestigeCycle } from './ascension/prestige-count-v8.ts'
import { ENTERPRISES } from './economy/catalog.ts'
import { previewPrestigePoints } from './ascension/contracts.ts'
import {V4_TAX_INSTALLMENT_MS} from './prestige/fame-v4-tax.ts'

export interface ExactSaveValidation {
  readonly valid: boolean
  readonly reason?: string
}

type Dict = Record<string, unknown>
function object(value: unknown): value is Dict {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function amount(value: unknown, signed = false): bigint | null {
  return decodeExactInteger(value, signed)
}
const TAX_SOURCES = ['enterprises', 'stocks', 'crypto', 'memecoins'] as const
const INCOME_SOURCES = ['clicks', 'dividends', 'enterprises', 'stocks', 'crypto', 'memecoins', 'unclassified'] as const
const LOSS_SOURCES = ['stocks', 'crypto', 'memecoins'] as const

const safe=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0
const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)
const map=(x:unknown):x is Dict=>object(x)
const validPercent=(n:unknown,min:number,max:number):boolean=>finite(n)&&n>=min&&n<=max
const allowedAssets=new Set(ASSETS.map(x=>x.id))
const companies=new Set(ENTERPRISES.map(x=>x.id))
function validMarketQuote(value:unknown,id:string):boolean {
  const asset=getAsset(id)
  if(!asset||!object(value))return false
  return finite(value.price)&&value.price>0&&
    finite(value.momentum)&&safe(value.updatedAt)&&
    (value.dividendYield===null||validPercent(value.dividendYield,0.01,0.30))&&
    (value.dividendMomentum===undefined||validPercent(value.dividendMomentum,-0.00024,0.00024))&&
    (value.fundamentalLog===undefined||validPercent(value.fundamentalLog,-1.6,1.6))&&
    (value.regime===undefined||['steady','bull','bear','frenzy'].includes(value.regime as string))&&
    (value.regimeTicksLeft===undefined||(safe(value.regimeTicksLeft)&&value.regimeTicksLeft<=115))&&
    (value.shockDrift===undefined||validPercent(value.shockDrift,-0.25,0.25))&&
    (value.shockTicksLeft===undefined||(safe(value.shockTicksLeft)&&value.shockTicksLeft<=40))&&
    (value.boundary===undefined||validLegacyBoundary(value.boundary,asset,
      value.price as number,value.updatedAt as number))
}
function validMarketEvent(value:unknown):boolean {
  if(!object(value))return false
  const id=value.id, template=value.templateId
  if(typeof id!=='string'||!/^[a-z0-9-]{1,48}$/.test(id)||
    typeof template!=='string'||!getNewsTemplate(template)||
    !safe(value.startedAt)||!safe(value.endsAt)||(value.endsAt<value.startedAt || (value.endsAt===value.startedAt && value.manuallyEnded!==true))||
    value.endsAt-value.startedAt>120*60_000||
    !Array.isArray(value.affectedAssetIds)||value.affectedAssetIds.length>45||
    !value.affectedAssetIds.every(id=>typeof id==='string'&&allowedAssets.has(id))||
    !validPercent(value.impact,-1,1)||
    !['rumor','active','confirmed','denied'].includes(value.phase as string))return false
  if(value.resolution!==undefined&&!['confirmed','denied'].includes(value.resolution as string))return false
  if(value.resolutionAt!==undefined&&(!safe(value.resolutionAt)||value.resolutionAt<=value.startedAt||
      value.resolutionAt>=value.endsAt))return false
  return (value.resolution===undefined)===(value.resolutionAt===undefined)
}
function validTradingStateShape(t:Dict):boolean {
  if(!safe(t.dividendLastPaidAt))return false
  if(t.autoSellHistory!==undefined){
    if(!Array.isArray(t.autoSellHistory)||t.autoSellHistory.length>96)return false
    let last=-1
    for(const raw of t.autoSellHistory){
      if(!object(raw)||!safe(raw.at)||raw.at<last||raw.at>t.dividendLastPaidAt||
        typeof raw.assetId!=='string'||!allowedAssets.has(raw.assetId)||
        !['greenEnd','redStart','trailingStop','profitTarget'].includes(raw.trigger as string)||
        amount(raw.quantity)===null||(amount(raw.quantity)??0n)<=0n||
        amount(raw.proceedsCents)===null||
        amount(raw.realizedNetProfitCents,true)===null||
        amount(raw.feeCents)===null)return false
      last=raw.at
    }
  }
  if(t.autoSellRules!==undefined){
    if(!map(t.autoSellRules)||Object.keys(t.autoSellRules).length>allowedAssets.size)return false
    for(const [id,rule] of Object.entries(t.autoSellRules)){
      if(!allowedAssets.has(id)||!object(rule)||typeof rule.greenEnd!=='boolean'||
        typeof rule.redStart!=='boolean')return false
    }
  }
  if(t.schemaVersion!==1||!safe(t.seed)||t.seed<1||t.seed>0xffffffff||
    !safe(t.lastTickAt)||!(t.nextNewsAt===null||safe(t.nextNewsAt))||
    !safe(t.dividendLastPaidAt)||t.dividendLastPaidAt<t.lastTickAt||
    !validPercent(t.dividendCarry,0,0.9999999999999999)||
    !map(t.quotes)||!map(t.history)||Object.keys(t.quotes).length>45||
    Object.keys(t.history).length>45||!Array.isArray(t.news)||
    t.news.some(e=>!validMarketEvent(e))||
    (t.upcomingNews!==undefined && (!validMarketEvent(t.upcomingNews)||
      !object(t.upcomingNews)||t.upcomingNews.startedAt!==t.nextNewsAt)))return false
  for(const [id,quote] of Object.entries(t.quotes))if(!validMarketQuote(quote,id))return false
  for(const [id,raw] of Object.entries(t.history)){
    if(!allowedAssets.has(id)||!Array.isArray(raw)||raw.length>720)return false
    let prev=-1
    for(const row of raw){
      if(!object(row)||!safe(row.at)||row.at<=prev||!validPercent(row.price,0,Number.MAX_VALUE)||
        (row.price as number)<=0||(row.dividendYield!==undefined&&!validPercent(row.dividendYield,0.01,0.30)))return false
      prev=row.at
    }
  }
  return true
}
/** Strict optional Fame V4 trading controls; reject forged unlocks, targets or history. */
function validFameTradingV4(t:Dict,p:Dict):boolean {
  if(t.fameV4Trading===undefined)return true
  const data=t.fameV4Trading
  const recordedThrough=t.dividendLastPaidAt
  if(!safe(recordedThrough))return false
  if(!object(data)||data.version!==1||!object(data.stops)||!object(data.targets)||
    !Array.isArray(data.newsLog)||data.newsLog.length>100)return false
  const levels=object(p.fameV4)&&object(p.fameV4.levels)?p.fameV4.levels:null
  const rank=(n:string):number=>levels&&typeof levels['fame-v4-'+n]==='number'
    ? levels['fame-v4-'+n] as number : 0
  const stopLevel=rank('02'),targetLevel=rank('07')
  const minStop=[25,20,15,10,5][stopLevel-1]
  if(Object.keys(data.stops).length>45||Object.keys(data.targets).length>45)return false
  for(const [id,raw] of Object.entries(data.stops)){
    if(!allowedAssets.has(id)||!object(raw)||stopLevel<1||
      typeof raw.enabled!=='boolean'||!safe(raw.drawdownPct)||
      ![25,20,15,10,5].includes(raw.drawdownPct as number)||
      (minStop!==undefined&&raw.drawdownPct<minStop)||
      !(raw.peakPrice===null||(finite(raw.peakPrice)&&raw.peakPrice>0)))return false
  }
  for(const [id,raw] of Object.entries(data.targets)){
    if(!allowedAssets.has(id)||targetLevel<1||!Array.isArray(raw)||
      raw.length> (targetLevel===5?3:1)||raw.length===0)return false
    const seen=new Set<number>()
    for(const item of raw){
      if(!object(item)||!safe(item.slot)||item.slot>=(targetLevel===5?3:1)||
        seen.has(item.slot)||!safe(item.gainPct)||item.gainPct<1||item.gainPct>10000||
        !safe(item.portionPct)||![25,50,75,100].includes(item.portionPct as number)||
        (targetLevel<4&&(item.portionPct as number)>targetLevel*25))return false
      seen.add(item.slot as number)
    }
  }
  if(data.newsLog.length && rank('06')<1)return false
  let last=-1
  const seenNews=new Set<string>()
  for(const raw of data.newsLog){
    if(!object(raw)||typeof raw.id!=='string'||raw.id.length>64||seenNews.has(raw.id)||
      typeof raw.templateId!=='string'||!getNewsTemplate(raw.templateId)||
      !safe(raw.startedAt)||!safe(raw.endsAt)||raw.endsAt<raw.startedAt||
      !safe(raw.recordedAt)||raw.recordedAt<raw.startedAt||raw.recordedAt<last||
      raw.recordedAt>recordedThrough||
      !['bullish','bearish','neutral'].includes(raw.direction as string)||
      !object(raw.startPrices)||Object.keys(raw.startPrices).length>45 ||
      Object.keys(raw.startPrices).length===0)return false
    if(raw.closedAt!==undefined){
      if(!safe(raw.closedAt)||raw.closedAt<raw.recordedAt||
        raw.endsAt>raw.closedAt||raw.closedAt>recordedThrough||
        !object(raw.endPrices))return false
    }else if(raw.endPrices!==undefined)return false
    const prices=(p:Dict)=>Object.entries(p).every(([id,price])=>
      allowedAssets.has(id)&&finite(price)&&price>0)
    if(!prices(raw.startPrices))return false
    if(raw.endPrices!==undefined){
      if(!object(raw.endPrices)||Object.keys(raw.endPrices).length!==Object.keys(raw.startPrices).length||
        !Object.keys(raw.endPrices).every(id=>Object.hasOwn(raw.startPrices as object,id))||
        !prices(raw.endPrices))return false
    }
    seenNews.add(raw.id)
    last=raw.recordedAt as number
  }
  return true
}

/** Optional enterprise V4 state, strict even when imported from an old V8.
 * All principal, payout, tax bases and project tiers remain canonical cents. */
function validFameEnterpriseV4(e:Dict,p:Dict,g:Dict,a:Dict,gifts:Dict):boolean{
  if(e.fameV4Enterprise===undefined)return true
  const data=e.fameV4Enterprise
  if(!object(data)||data.version!==1||
    !object(data) || !Array.isArray(data.projects)||!Array.isArray(data.contracts)||
    !Array.isArray(data.usedProjectTiers)||!Array.isArray(data.contractHistory)||
    !safe(data.nextContractId)||data.nextContractId<1||
    data.projects.length>5||data.contracts.length>5||
    data.usedProjectTiers.length>5||data.contractHistory.length>20)return false
  const levels=object(p.fameV4)&&object(p.fameV4.levels)?p.fameV4.levels:null
  const rank=(n:string)=>levels&&typeof levels['fame-v4-'+n]==='number'
    ? levels['fame-v4-'+n] as number : 0
  const owned=object(e.owned)?e.owned:null
  const ownedId=(id:unknown):id is string=>typeof id==='string'&&
    !!owned&&Object.hasOwn(owned,id)&&!!ENTERPRISES.find(x=>x.id===id)
  const at=e.lastAccruedAt
  if(!safe(at))return false
  if(data.synergy!==null){
    if(rank('08')<1||!Array.isArray(data.synergy)||data.synergy.length!==2||
      !ownedId(data.synergy[0])||!ownedId(data.synergy[1])||
      data.synergy[0]===data.synergy[1])return false
  }
  for(const [key,level] of [['franchise','12'],['board','13']] as const){
    const choice=data[key]
    if(choice===null)continue
    if(rank(level)<1||!object(choice)||!ownedId(choice.id)||
      !safe(choice.chosenAt)||choice.chosenAt>at)return false
  }
  const used=new Set<number>()
  let previous=-1
  for(const tier of data.usedProjectTiers){
    if(!safe(tier)||tier>4||tier>=rank('11')||tier<=previous)return false
    used.add(tier);previous=tier
  }
  const activeTier=new Set<number>(),counts=new Map<string,number>()
  for(const item of data.projects){
    if(!object(item)||!safe(item.tier)||!used.has(item.tier)||activeTier.has(item.tier)||
      !['small','local','services','industry','major'].includes(item.category as string)||
      !safe(item.startedAt)||!safe(item.endsAt)||item.startedAt>at||
      item.endsAt<=at||item.endsAt-item.startedAt!==1_800_000 ||
      !ENTERPRISES.some(x=>x.category===item.category&&ownedId(x.id)))return false
    activeTier.add(item.tier as number)
    counts.set(item.category as string,(counts.get(item.category as string)??0)+1)
  }
  if([...counts.values()].some(n=>n>3))return false
  if(data.contracts.length>rank('10'))return false
  const ids=new Set<number>()
  for(const item of data.contracts){
    if(!object(item)||!safe(item.id)||item.id<1||item.id>=data.nextContractId||
      ids.has(item.id)||!safe(item.startedAt)||item.startedAt>at||
      !safe(item.endsAt)||item.endsAt<=at||
      ![30,60,90,120].includes((item.endsAt-item.startedAt)/60_000)||
      (amount(item.principalCents)??0n)<100_000_000n||
      !safe(item.seedAtStart)||item.seedAtStart<1||item.seedAtStart>0xffffffff||
      typeof item.success!=='boolean'||
      item.success!==((BigInt(item.seedAtStart)*1_103_515_245n+
        BigInt(item.id)*2_654_435_761n+BigInt(item.startedAt)+
        (amount(item.principalCents)??0n))%10_000n<7500n)||
      !safe(item.successBps)||
      item.successBps!==({30:0,60:200,90:300,120:500} as Record<number,number>)[(item.endsAt-item.startedAt)/60_000])return false
    ids.add(item.id as number)
  }
  // The locked principal cannot exceed all legitimate sources of cash, even
  // if an imported snapshot fabricates a very large contract principal.
  const gifted=amount(gifts.cycleGiftCents)
  const starting=object(a.run)?(a.run.startingCapitalGrantedCents===undefined?0n:amount(a.run.startingCapitalGrantedCents)):null
  const lifetime=amount(g.lifetimeEarned)
  if(gifted===null||lifetime===null||starting===null)return false
  const locked=data.contracts.reduce((sum:bigint,item:Dict)=>
    sum+(amount(item.principalCents)??0n),0n)
  if(locked>lifetime+gifted+starting)return false
  previous=-1
  for(const item of data.contractHistory){
    if(!object(item)||!safe(item.id)||item.id<1||!safe(item.at)||item.at>at||
      item.at<previous||typeof item.forced!=='boolean')return false
    const principal=amount(item.principalCents),payout=amount(item.payoutCents),
      profit=amount(item.profitCents,true)
    if(principal===null||principal<100_000_000n||payout===null||profit===null||
      payout-principal!==profit||profit < -(principal*15n+99n)/100n||
      profit>principal*5n/100n||
      (item.forced&&payout!==principal*85n/100n))return false
    previous=item.at as number
  }
  return true
}

/** Optional V4 collection registry; provenance and costs derive from the
 * immutable 100-item catalog, not from any client-supplied amount. */
function validFameCollectionV4(p:Dict,e:Dict):boolean{
  if(p.fameV4Collections===undefined)return true
  const data=p.fameV4Collections
  if(!object(data)||data.version!==1||!Array.isArray(data.restoredIds)||
    !Array.isArray(data.wingTiers)||data.restoredIds.length>20||data.wingTiers.length>5||
    !object(p.fameV4)||!object(p.fameV4.levels))return false
  const levels=p.fameV4.levels
  const rank=(n:string):number=>typeof levels['fame-v4-'+n]==='number'?
    levels['fame-v4-'+n] as number:0
  const owned=new Set((p.ownedCollectionIds as string[]).map(currentCollectionId))
  if(data.restoredIds.length>rank('15')*2||data.wingTiers.length>rank('18'))return false
  let permanent=0n
  const restored=new Set<string>()
  for(const raw of data.restoredIds){
    if(typeof raw!=='string'||!getCollectionSlot(raw)||!owned.has(currentCollectionId(raw))||
      restored.has(currentCollectionId(raw)))return false
    restored.add(currentCollectionId(raw))
    const cost=v4RestoreCostCents(raw)
    if(cost===null)return false
    permanent+=cost
  }
  let previous=-1
  for(const tier of data.wingTiers){
    if(!safe(tier)||tier>=5||tier>=rank('18')||tier<=previous)return false
    permanent+=V4_WING_COSTS_CENTS[tier]!
    previous=tier
  }
  if(amount(data.permanentSpentCents)!==permanent)return false
  const spending=amount(data.exhibitionSpentCents)
  if(spending===null)return false
  const at=e.lastAccruedAt
  if(!safe(at))return false
  if(data.exhibition!==null){
    const show=data.exhibition
    if(rank('14')<1||!object(show)||!safe(show.startedAt)||
      !safe(show.endsAt)||!safe(show.cooldownUntil)||
      show.startedAt>at||
      show.endsAt-show.startedAt!==V4_EXHIBITION_DURATION_MS||
      show.cooldownUntil-show.startedAt!==V4_EXHIBITION_COOLDOWN_MS||
      (amount(show.costCents)??0n)<100_000_000n||
      (amount(show.costCents)??0n)>spending||
      owned.size<3)return false
  }
  if(data.offers!==null){
    const offers=data.offers
    if(rank('17')<1||!object(offers)||!safe(offers.generatedAt)||
      !safe(offers.expiresAt)||offers.expiresAt-offers.generatedAt!==V4_PRIVATE_OFFER_MS||
      offers.generatedAt>at||!Array.isArray(offers.items)||
      offers.items.length>rank('17'))return false
    const ids=new Set<string>()
    for(const item of offers.items){
      if(!object(item)||typeof item.itemId!=='string'||!getCollectionSlot(item.itemId)||
        ids.has(currentCollectionId(item.itemId))||typeof item.used!=='boolean')return false
      ids.add(currentCollectionId(item.itemId))
    }
  }
  return true
}

/** Optional, cycle-limited manual click and Auto Click V4 state.
 * Strict shape, chronological bounds and entitlement checks. */
function validFameClicksV4(p:Dict,a:Dict,e:Dict,st:Dict,t:Dict):boolean{
  if(!object(a.run))return false
  const run=a.run
  if(run.fameV4Clicks===undefined)return true
  const data=run.fameV4Clicks
  if(!object(data)||data.version!==1||!Array.isArray(data.manualTimestamps)||
    data.manualTimestamps.length>10||!safe(data.frenzyUntil)||
    !safe(data.chainSeed)||data.chainSeed>0xffffffff||!safe(data.chainRolls)||
    !object(p.fameV4)||!object(p.fameV4.levels))return false
  const levels=p.fameV4.levels
  const rank=(n:number):number=>{
    const r=levels['fame-v4-'+String(n).padStart(2,'0')]
    return typeof r==='number'&&Number.isSafeInteger(r)&&r>=0?r:0
  }
  const clock=e.lastAccruedAt,started=run.startedAtRealMs
  if(!safe(clock)||!safe(started)||!safe(st.activePlayMs)||!safe(st.clickCount))return false
  const manual=data.lastManualAt,active=data.lastManualActiveMs
  if((manual!==null&&(!safe(manual)||manual<started||manual>clock))||
    (active!==null&&(!safe(active)||active>st.activePlayMs))||
    (manual===null)!==(active===null))return false
  if(data.manualTimestamps.length>0&&(manual===null||rank(19)<1))return false
  let last=started
  for(const x of data.manualTimestamps){
    if(!safe(x)||x<last||manual===null||x>manual||
      x<manual-3000)return false
    last=x
  }
  if(data.frenzyUntil!==0&&(rank(19)<1||manual===null||
      data.frenzyUntil!==manual+3000))return false
  if(data.manualTimestamps.length===10&&data.frenzyUntil===0)return false
  if(data.chainRolls>st.clickCount||rank(23)===0&&data.chainRolls>0)return false
  const legendary=data.legendaryAnchorAt
  if(legendary!==null&&(rank(20)<1||!safe(legendary)||legendary<started||
      legendary>clock))return false
  const boost=data.overcharge
  if(boost!==null){
    if(rank(21)<1||!object(boost)||!safe(boost.startedAt)||
      !safe(boost.endsAt)||!safe(boost.readyAt)||
      boost.startedAt<started||boost.startedAt>clock||
      boost.readyAt-boost.startedAt!==900_000||
      boost.endsAt-boost.startedAt<4000||
      boost.endsAt-boost.startedAt>4000*rank(21)||
      (boost.endsAt-boost.startedAt)%4000!==0||
      !safe(run.autoClickLevel)||run.autoClickLevel<1)return false
  }
  // A claim cannot advance a market or tax clock.
  if(!safe(t.dividendLastPaidAt))return false
  return true
}

/** Strict optional fiscal Fame V4 state: one liability, one ledger, one plan.
 * All historical saves without this field remain valid.
 */
function validFameTaxV4(f:Dict,p:Dict,e:Dict):boolean {
  if(f.fameV4Tax===undefined)return true
  const data=f.fameV4Tax
  if(!object(data)||data.version!==1||
    !object(p.fameV4)||!object(p.fameV4.levels)||
    amount(data.discountsGrantedCents)===null||
    amount(data.managementFeesPaidCents)===null)return false
  const levels=p.fameV4.levels
  const rank=(id:string)=>typeof levels['fame-v4-'+id]==='number'?levels['fame-v4-'+id] as number:0
  if(data.lastQualifiedAt!==null&&(!safe(data.lastQualifiedAt)||rank('25')===0||
    data.lastQualifiedAt>e.lastAccruedAt))return false
  if(data.eligiblePeriodAt!==null&&
    (!safe(data.eligiblePeriodAt)||data.eligiblePeriodAt!==f.periodStartedAt||
    data.lastQualifiedAt===null||rank('25')===0))return false
  const plan=data.plan
  if(plan===null)return true
  if(!object(plan)||rank('26')<1||data.eligiblePeriodAt!==null||
    !safe(plan.startedAt)||!safe(plan.installments)||!safe(plan.paidCount)||
    plan.installments<2||plan.installments>Math.min(6,rank('26')+1)||
    plan.paidCount>=plan.installments||
    plan.startedAt<f.periodStartedAt||plan.startedAt>e.lastAccruedAt||
    plan.startedAt+plan.installments*V4_TAX_INSTALLMENT_MS>Number(f.periodStartedAt)+72*60*60*1000||
    !object(plan.remainingBySourceCents)||Object.keys(plan.remainingBySourceCents).length!==4)return false
  const initial=amount(plan.initialCents)
  if(initial===null||initial===0n)return false
  let remaining=0n
  for(const key of TAX_SOURCES){
    const part=amount(plan.remainingBySourceCents[key])
    const available=object(f.dueBySourceCents)?amount(f.dueBySourceCents[key]):null
    if(part===null||available===null||part>available)return false
    remaining+=part
  }
  return remaining===initial-initial*BigInt(plan.paidCount)/BigInt(plan.installments)&&remaining>0n
}

function validLedgerShape(g:Dict, e:Dict, f:Dict,p:Dict,a:Dict,s:Dict):boolean {
  const progress=object(a.progress)?a.progress:null
  const run=object(a.run)?a.run:null
  if(!progress||!run)return false
  if(!safe(g.purchasedUpgrades)||g.purchasedUpgrades>999||
    !safe(s.startedAt)||!safe(s.activePlayMs)||!safe(s.clickCount)||s.sourceTrackingVersion!==1||
    !safe(e.lastAccruedAt)||!validPercent(e.revenueCarryCents,0,0.9999999999999999)||
    !safe(f.periodStartedAt)||!safe(f.enterpriseTaxRemainderBps)||f.enterpriseTaxRemainderBps>9999||
    !safe(p.lastAwardedLevel)||p.lastAwardedLevel<1||
    !safe(progress.prestigeCount)||!safe(progress.highestFameAwardedLevel)||
    !safe(run.startedAtRealMs))return false
  if (![3,4].includes(p.xpCurveVersion as number)) return false
  if(p.lastAwardedLevel !== (p.xpCurveVersion === 4 ? getExactLevel : getExactV3Level)(amount(p.experienceCents)??0n))return false
  if(progress.highestFameAwardedLevel<p.lastAwardedLevel)return false
  if(progress.prestigeCount>0&&progress.highestFameAwardedLevel<100)return false
  if(!safe(run.startedAtRealMs)||!object(run.marketClock)||
    !safe(run.marketClock.simulatedAtMs)||!safe(run.marketClock.realAnchorMs)||
    run.marketClock.realAnchorMs<run.startedAtRealMs||
    run.marketClock.simulatedAtMs<run.startedAtRealMs||
    ![1,1.5,2,3,4,5].includes(run.marketClock.selectedSpeed as number))return false
  if(progress.shopVersion===2){
    if(run.automation!==undefined || run.marketOrders!==undefined || run.nextOrderId!==undefined || run.lastStrategyAtRealMs!==undefined)return false
  } else if(
    !object(run.automation)||!Array.isArray(run.automation.allowedAssetIds)||
    run.automation.allowedAssetIds.some((id:unknown)=>typeof id!=='string'||!allowedAssets.has(id))||
    !['autoClickEnabled','investorEnabled','traderEnabled','enterpriseEnabled'].every(
      key=>typeof (run.automation as Dict)[key]==='boolean'))return false
  // Missing means an old, still-valid V8 save: treat as level 0.
  if(run.autoClickLevel!==undefined && (!safe(run.autoClickLevel)||run.autoClickLevel>20))return false
  if(run.startingCapitalGrantedCents!==undefined && amount(run.startingCapitalGrantedCents)===null)return false
  if(run.lastAutomationAtRealMs!==undefined && !safe(run.lastAutomationAtRealMs))return false
  if(run.marketOrders!==undefined){
    if(!Array.isArray(run.marketOrders)||run.marketOrders.length>24||
      !safe(run.nextOrderId)||run.nextOrderId<1)return false
    const seen=new Set<number>()
    for(const order of run.marketOrders){
      if(!object(order)||!safe(order.id)||order.id<1||order.id>=run.nextOrderId||
        seen.has(order.id)||typeof order.assetId!=='string'||!allowedAssets.has(order.assetId)||
        (order.side!=='buy'&&order.side!=='sell')||
        !['limit','stop-loss','take-profit'].includes(order.kind as string)||
        (order.kind!=='limit'&&order.side!=='sell')||!finite(order.triggerPrice)||
        !safe(order.createdAtRealMs)||order.createdAtRealMs<run.startedAtRealMs||
        amount(order.quantity)===null)return false
      const units=amount(order.quantity)!
      if(units<=0n||order.triggerPrice<=0)return false
      seen.add(order.id)
    }
  }
  if(!object(p.boosts)||!Array.isArray(p.ownedCollectionIds)||p.ownedCollectionIds.length>CURRENT_COLLECTION_SLOTS.length||
    new Set(p.ownedCollectionIds.map(x=>typeof x === 'string' ? currentCollectionId(x) : x)).size!==p.ownedCollectionIds.length||
    !p.ownedCollectionIds.every(x=>typeof x==='string'&&getCollectionSlot(x)))return false
  if(!safe(p.experienceCarryBps)||p.experienceCarryBps>=10_000||
    !safe(p.clickCarryBps)||p.clickCarryBps>=10_000||
    !safe(p.tradingCarryBps)||p.tradingCarryBps>=10_000)return false
  return true
}

/** Inspects cross-ledger invariants as exact BigInts, without Number coercion. */
export function validateExactV8State(value: unknown, decimalsFor: AssetDecimals): ExactSaveValidation {
  const fail = (reason: string): ExactSaveValidation => ({ valid: false, reason })
  if (!object(value) || value.version !== 8) return fail('Expected exact V8 snapshot')
  const { game, fiscal, trading, enterprises, prestige, ascension, achievements, stats } = value
  if (![game, fiscal, trading, enterprises, prestige, ascension, achievements, stats].every(object))
    return fail('Missing V8 domain section')
  const g = game as Dict, f = fiscal as Dict, t = trading as Dict,
    e = enterprises as Dict, p = prestige as Dict, a = ascension as Dict,
    gifts = achievements as Dict, s = stats as Dict
  if(!validTradingStateShape(t)||!validLedgerShape(g,e,f,p,a,s)||!validFameTradingV4(t,p)||!validFameEnterpriseV4(e,p,g,a,gifts)||!validFameCollectionV4(p,e)||!validFameClicksV4(p,a,e,s,t)||!validFameTaxV4(f,p,e))
    return fail('Invalid V8 market, timestamps, account or XP shape')
  if(value.newsPowers!==undefined && (!object(value.newsPowers) || !safe(value.newsPowers.count) || amount(value.newsPowers.spentCents)===null ||
    !Array.isArray(value.newsPowers.recent) || value.newsPowers.recent.length!==Math.min(50,value.newsPowers.count) ||
    value.newsPowers.recent.some(entry=>!object(entry)||typeof entry.eventId!=='string'||!safe(entry.at)||
      !['end','generate'].includes(entry.action as string)||(amount(entry.costCents)??0n)<=0n)))
    return fail('Invalid News power spending')
  const cash = amount(g.balance, true), earned = amount(g.lifetimeEarned)
  const giftCents = amount(gifts.cycleGiftCents)
  const grantField=(a.run as Dict).startingCapitalGrantedCents
  const grantCents=grantField===undefined?0n:amount(grantField)
  if (cash === null || earned === null || giftCents === null || grantCents === null ||
      cash > earned + giftCents + grantCents)
    return fail('Cash / lifetime earnings / gifts / starting capital inconsistent')
  if (!object(f.dueBySourceCents) || !object(f.paidBySourceCents)) return fail('Missing tax ledgers')
  for (const [totalKey, bySourceKey] of [
    ['taxesDueCents','dueBySourceCents'], ['taxesPaidCents','paidBySourceCents'],
  ] as const) {
    const total = amount(f[totalKey]), source = f[bySourceKey] as Dict
    if (total === null || Object.keys(source).length !== TAX_SOURCES.length) return fail('Invalid tax totals')
    let sum = 0n
    for (const key of TAX_SOURCES) {
      const part = amount(source[key])
      if (part === null) return fail('Invalid tax source')
      sum += part
    }
    if (sum !== total) return fail('Tax ledger balance mismatch')
  }
  if (!object(s.earnedBySource) || !object(s.realizedLossesBySource)) return fail('Missing income ledgers')
  for (const [ledger, keys] of [
    [s.earnedBySource as Dict, INCOME_SOURCES],
    [s.realizedLossesBySource as Dict, LOSS_SOURCES],
  ] as const) {
    if (Object.keys(ledger).length !== keys.length) return fail('Incorrect source count')
    for (const key of keys) if (amount(ledger[key]) === null) return fail('Malformed source entry')
  }
  if (amount(p.experienceCents) === null) return fail('Invalid XP ledger')
  const fame = amount(p.fameMicros), lifetimeFame = amount(p.lifetimeFameMicros)
  const levelsFame = amount(p.levelFameMicros), collectionsFame = amount(p.collectionFameMicros)
  if (fame === null || lifetimeFame === null || levelsFame === null || collectionsFame === null ||
    fame > lifetimeFame || lifetimeFame !== levelsFame + collectionsFame) return fail('Incoherent Fame')
  if(levelsFame < BigInt(p.lastAwardedLevel as number)*
    BigInt((p.lastAwardedLevel as number)+1)/2n*1_000_000n)
    return fail('Fame is below previous awarded levels')
  const baseCollections=(p.ownedCollectionIds as string[]).reduce((sum,id)=>
    sum+BigInt(getCollectionSlot(id)?.fame??0)*1_000_000n,0n)
  if(collectionsFame < baseCollections)return fail('Collection Fame ledger too small')
  if (!object(p.boosts)) return fail('Missing Fame boost ledger')
  if (p.xpCurveVersion === 4) {
    if (p.fameShopLedgerVersion !== 2 || !object(p.fameLegacyLevels))
      return fail('Missing versioned Fame purchase ledger')
    const legacyLevels = p.fameLegacyLevels as Parameters<typeof getVersionedPurchasedFameCost>[1]
    const expectedSpent = getVersionedPurchasedFameCost(
      p.boosts as Parameters<typeof getVersionedPurchasedFameCost>[0], legacyLevels)
    let v4Purchased=0n
    if(p.fameV4!==undefined){
      if(!object(p.fameV4)||p.fameV4.version!==1||!object(p.fameV4.levels))
        return fail('Malformed Fame V4 section')
      const cost=fameV4PurchasedCost(p.fameV4.levels)
      const receipt=amount(p.fameV4.spentMicros)
      if(cost===null||receipt===null||receipt!==cost*1_000_000n)
        return fail('Fame V4 purchase ledger does not balance')
      v4Purchased=cost
    }
    const spent = amount(p.fameSpentMicros), forfeited = amount(p.fameForfeitedMicros)
    const cycleEarned = amount(p.cycleEarnedFameMicros)
    const cycleLevels = amount(p.cycleLevelFameMicros)
    const cycleCollections = amount(p.cycleCollectionFameMicros)
    if (expectedSpent === null || spent === null || forfeited === null ||
        cycleEarned === null || cycleLevels === null || cycleCollections === null ||
        spent !== (BigInt(expectedSpent) + v4Purchased) * 1_000_000n ||
        lifetimeFame !== fame + spent + forfeited ||
        cycleEarned !== cycleLevels + cycleCollections ||
        cycleEarned > lifetimeFame || cycleLevels > levelsFame || cycleCollections > collectionsFame)
      return fail('Permanent / cycle Fame ledgers do not balance')
    if (p.xpRebaseV4 !== undefined) {
      if (!object(p.xpRebaseV4)) return fail('Malformed XP V4 migration evidence')
      const from = amount(p.xpRebaseV4.fromCents), to = amount(p.xpRebaseV4.toCents)
      if (from === null || to === null || to > amount(p.experienceCents)! ||
          rebaseV3ExperienceCents(from) !== to)
        return fail('Invalid XP V4 migration evidence')
    }
  } else {
    if (p.fameV4 !== undefined || p.fameShopLedgerVersion !== undefined || p.fameLegacyLevels !== undefined ||
        p.fameSpentMicros !== undefined || p.xpRebaseV4 !== undefined)
      return fail('Ambiguous legacy Fame schema')
    const spent = getPurchasedFameBoostCost(
      p.boosts as Parameters<typeof getPurchasedFameBoostCost>[0])
    if (spent === null || lifetimeFame - fame !== BigInt(spent) * 1_000_000n)
      return fail('Legacy Fame shop ledger does not balance')
  }
  if (!object(a.progress)) return fail('Missing Prestige progress')
  const progress = a.progress as Dict
  const availablePP = amount(progress.availablePoints), lifetimePP = amount(progress.lifetimePoints)
  if (availablePP === null || lifetimePP === null || availablePP > lifetimePP ||
      !object(progress.upgradeLevels)) return fail('Invalid PP ledger')
  if(progress.shopVersion!==undefined && progress.shopVersion!==2)return fail('Unknown Prestige tariff')
  const shopPP = progress.shopVersion===2 ? prestigeSpent(progress.upgradeLevels,progress.legacyRanks) : ascensionSpentPoints(progress.upgradeLevels as Record<string, number>)
  // Classic historical ranks and advanced V1 ranks debit the same PP wallet.
  // An absent V1 section is a valid pre-pass-3 save and costs exactly zero.
  const advancedPP = progress.transcendentV1===undefined?0n:transcendentSpent(progress.transcendentV1)
  if (shopPP === null || advancedPP === null ||
      lifetimePP - availablePP !== BigInt(shopPP) + advancedPP)
    return fail('PP shop ledger does not balance')
  if(progress.history && Array.isArray(progress.history) && progress.history.length > 100)
    return fail('Prestige history exceeds 100 cycles')
  if (!Array.isArray(progress.history) || typeof progress.prestigeCount !== 'number' ||
      !Number.isSafeInteger(progress.prestigeCount) || progress.prestigeCount < 0)
    return fail('Missing prestige history')
  // The numeric counter remains a bounded V8 projection; after 2^53-1
  // its optional canonical decimal string and each new receipt are exact.
  const preciseCycles=progress.prestigeCountExact===undefined
    ? BigInt(progress.prestigeCount) : amount(progress.prestigeCountExact)
  if(preciseCycles===null ||
    (progress.prestigeCountExact!==undefined &&
      (preciseCycles<=MAX_SAFE_CYCLE || progress.prestigeCount!==Number.MAX_SAFE_INTEGER)))
    return fail('Invalid exact Prestige cycle counter')
  if(grantCents>0n && preciseCycles===0n)
    return fail('Starting capital granted without Prestige cycle')
  let pointsInHistory=0n
  for (const [index, item] of progress.history.entries()) {
    const expectedCycle=preciseCycles-BigInt(progress.history.length)+BigInt(index)+1n
    if (!object(item) || expectedCycle<1n || amount(item.eligibleWorthCents) === null ||
      amount(item.earnedPoints) === null || !Number.isSafeInteger(item.cycle) ||
      item.cycle !== projectedPrestigeCycle(expectedCycle) ||
      (expectedCycle>MAX_SAFE_CYCLE
        ? amount(item.cycleExact)!==expectedCycle
        : item.cycleExact!==undefined))
      return fail('Invalid prestige history')
    const total=amount(item.earnedPoints)!
    const worth=amount(item.eligibleWorthCents)!
    // New receipts attest the purchased rank and its exact grant. Older V3
    // receipts have neither field and always represent a zero grant.
    const hasRank=Object.hasOwn(item,'startingCapitalLevelAtCycle')
    const hasAmount=Object.hasOwn(item,'startingCapitalGrantedCents')
    let historicalGrant=0n
    if(hasRank!==hasAmount)return fail('Incomplete starting capital receipt')
    if(hasRank){
      const rank=item.startingCapitalLevelAtCycle
      const granted=amount(item.startingCapitalGrantedCents)
      if(![3,4,5].includes(item.formulaVersion as number) || !safe(rank)||
          rank>(item.formulaVersion===5?TRANSCENDENT_MAX_LEVEL:1000)||
         granted===null||startingCapitalCents(rank,item.formulaVersion!==5)!==granted||
         !object(progress.transcendentV1)||!object(progress.transcendentV1.levels)||
         !safe(progress.transcendentV1.levels['starting-capital'])||
         ((progress.transcendentV1 as {version?:number}|undefined)?.version===2 && item.formulaVersion!==5
            ? Math.ceil(rank/10):rank)>progress.transcendentV1.levels['starting-capital'])
        return fail('Invalid starting capital receipt')
      historicalGrant=granted
    }
    if(index===progress.history.length-1 && historicalGrant!==grantCents)
      return fail('Starting capital witness disagrees with last cycle')
    if(item.formulaVersion===3 || item.formulaVersion===4 || item.formulaVersion===5){
      const base=amount(item.basePoints)
      const heritage=item.heritageLevelAtCycle
      const museum=item.museumCompleteAtCycle
      const bonusBps=item.bonusBps
      if(progress.shopVersion!==2 || !safe(item.completedAtRealMs)||
        !safe(item.levelAtCompletion)||item.levelAtCompletion<150 ||
        base===null || base===0n || base!==(item.formulaVersion===4 || item.formulaVersion===5
           ? prestigePointsV4(worth,item.levelAtCompletion) : prestigePoints(worth,item.levelAtCompletion))||
        !safe(heritage)||heritage>(item.formulaVersion===5?TRANSCENDENT_MAX_LEVEL:1000) ||
         (item.formulaVersion===5 && (progress.transcendentV1 as {version?:number}|undefined)?.version===1) ||
        (progress.transcendentV1!==undefined &&
          ((progress.transcendentV1 as {version?:number}|undefined)?.version===2 && item.formulaVersion!==5
             ? Math.ceil(heritage/10) : heritage)>(progress.transcendentV1 as {levels:{heritage:number}}).levels.heritage) ||
        (typeof museum!=='boolean') ||
        (museum && !collectionV3Snapshot(p.ownedCollectionIds as string[]).museumComplete) ||
        !safe(bonusBps) ||
        bonusBps!==10_000+heritage*(item.formulaVersion===5?100:10)+(museum?2_500:0) ||
        total!==base*BigInt(bonusBps)/10_000n)
        return fail('Invalid Prestige V3/V4/V5 reward')
    } else if(item.formulaVersion===2){
      if(progress.shopVersion!==2 || !safe(item.completedAtRealMs) || !safe(item.levelAtCompletion) || total===0n || prestigePoints(worth,item.levelAtCompletion)!==total)return fail('Invalid Prestige V2 reward')
    } else if(item.formulaVersion!==undefined || !safe(item.levelAtCompletion)||item.levelAtCompletion<100||
      !safe(item.completedAtRealMs)||worth<10_000_000_000n||
      (worth<=BigInt(Number.MAX_SAFE_INTEGER) &&
        BigInt(previewPrestigePoints(Number(worth)/100,item.levelAtCompletion))!==total))
      return fail('Invalid historical Prestige reward')
    pointsInHistory+=total
  }
  if(progress.history.length===0 && grantCents!==0n)
    return fail('Starting capital without historical receipt')
  if(pointsInHistory>lifetimePP||
    (preciseCycles<=100n && pointsInHistory!==lifetimePP))
    return fail('Prestige lifetime reward ledger mismatch')
  const dividendCarry = amount(t.dividendCarryPicoCents)
  if (dividendCarry === null || dividendCarry >= 1_000_000_000_000n)
    return fail('Invalid dividend carry')
  const enterpriseCarry = amount(e.revenueCarryNanoCents)
  if (enterpriseCarry === null || enterpriseCarry >= 10_000_000n)
    return fail('Invalid enterprise carry')
  if (!object(t.positions) || !object(t.staking)) return fail('Invalid trading positions')
  const stake = t.staking as Dict
  if (!object(stake.positions)) return fail('Invalid staking positions')
  const positions = t.positions as Dict
  for (const [id, raw] of Object.entries(positions)) {
    const precision = decimalsFor(id)
    if (precision === null || !Number.isSafeInteger(precision) || !object(raw)) return fail('Unknown trading asset')
    const qty = amount(raw.quantity), basis = amount(raw.costBasis)
    if (qty === null || qty <= 0n || basis === null || !getAsset(id))
      return fail('Invalid position quantity/cost')
  }
  for (const [id, raw] of Object.entries(stake.positions as Dict)) {
    if (decimalsFor(id) === null || !object(raw)) return fail('Invalid staked asset')
    const stakeCarry = amount(raw.carryPicoUnits)
    if (stakeCarry === null || stakeCarry >= 1_000_000_000_000n) return fail('Invalid stake carry')
    const fields = ['locked','unlocking','awaitingCompound','rewardHeld','rewardLocked',
      'rewardUnlocking','lifetimeRewards'] as const
    const values = fields.map(x => amount(raw[x]))
    if (values.some(x => x === null)) return fail('Invalid staked quantity')
    const [locked, unlocking, compounding, held, rewardLocked, rewardUnlocking] = values as bigint[]
    const position = positions[id]
    const owned = object(position) ? amount(position.quantity) : null
    if (owned === null || locked! + unlocking! + compounding! > owned || held! > owned ||
      rewardLocked! > locked! || rewardUnlocking! > unlocking!) return fail('Staked holdings mismatch')
  }
  if(!object(t.positions) || Object.keys(t.positions).length>45 ||
    !object(stake.positions) || Object.keys(stake.positions).length>45)
    return fail('Excess market positions')
  const ownedEnterprises = e.owned
  if (!object(ownedEnterprises)) return fail('Invalid company holdings')
  if(Object.keys(ownedEnterprises).length>20)return fail('Too many enterprises')
  for (const [id,raw] of Object.entries(ownedEnterprises)) {
    if (!companies.has(id)||!object(raw) || amount(raw.investedCents) === null ||
      !Number.isSafeInteger(raw.level) || (raw.level as number) < 1 ||
      (raw.level as number)>=Number.MAX_SAFE_INTEGER) return fail('Invalid enterprise balance')
  }
  for (const key of ['realizedNetProfit','creditedTradingProfit','dividendPendingCents'] as const) {
    if (amount(t[key], key === 'realizedNetProfit') === null) return fail('Invalid trading ledger')
  }
  if(progress.shopVersion===2)return {valid:true}
  if (!object(a.run) || !object((a.run as Dict).automation)) return fail('Missing run state')
  const automation = (a.run as Dict).automation as Dict
  for (const key of ['maxOrderCents','cashReserveCents'] as const)
    if (amount(automation[key]) === null) return fail('Invalid automation budget')
  if (automation.enterpriseBudgetCents !== undefined && amount(automation.enterpriseBudgetCents) === null)
    return fail('Invalid enterprise automation budget')
  return { valid: true }
}
