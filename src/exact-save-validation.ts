import { prestigeShop, prestigeSpent, prestigePoints } from './ascension/v2.ts'
import { isValidMarketBoundary } from './trading/market.ts'
/**
 * Strict V8 serialization contract. No BigInt is ever written to JSON; all
 * economic amounts are canonical decimal strings. This validator is applied on active V8 writes, imports and migrations.
 * Invalid saves are rejected before being accepted as the authoritative state.
 */
import { decodeExactInteger } from './large-numbers.ts'
import type { AssetDecimals } from './exact-save-v8.ts'
import { getPurchasedFameBoostCost, getVersionedPurchasedFameCost } from './prestige/catalog.ts'
import { ascensionSpentPoints } from './ascension/catalog.ts'
import { getAsset, ASSETS } from './trading/catalog.ts'
import { getNewsTemplate } from './trading/news.ts'
import { getExactLevel, getExactV3Level, rebaseV3ExperienceCents } from './exact-levels.ts'
import { CURRENT_COLLECTION_SLOTS, currentCollectionId, getCollectionSlot } from './prestige/catalog.ts'
import { ENTERPRISES } from './economy/catalog.ts'
import { previewPrestigePoints } from './ascension/contracts.ts'

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
  return validPercent(value.price,asset.minPrice,asset.maxPrice)&&
    finite(value.momentum)&&safe(value.updatedAt)&&
    (value.dividendYield===null||validPercent(value.dividendYield,0.01,0.30))&&
    (value.dividendMomentum===undefined||validPercent(value.dividendMomentum,-0.00024,0.00024))&&
    (value.regime===undefined||['steady','bull','bear','frenzy'].includes(value.regime as string))&&
    (value.regimeTicksLeft===undefined||(safe(value.regimeTicksLeft)&&value.regimeTicksLeft<=115))&&
    (value.shockDrift===undefined||validPercent(value.shockDrift,-0.25,0.25))&&
    (value.shockTicksLeft===undefined||(safe(value.shockTicksLeft)&&value.shockTicksLeft<=40))&&
    (value.boundary===undefined||isValidMarketBoundary(value.boundary,asset,
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
      const asset=getAsset(order.assetId)!
      const units=amount(order.quantity)!
      if(units<=0n||order.triggerPrice<asset.minPrice||
        order.triggerPrice>asset.maxPrice)return false
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
  if(!validTradingStateShape(t)||!validLedgerShape(g,e,f,p,a,s))
    return fail('Invalid V8 market, timestamps, account or XP shape')
  if(value.newsPowers!==undefined && (!object(value.newsPowers) || !safe(value.newsPowers.count) || amount(value.newsPowers.spentCents)===null ||
    !Array.isArray(value.newsPowers.recent) || value.newsPowers.recent.length!==Math.min(50,value.newsPowers.count) ||
    value.newsPowers.recent.some(entry=>!object(entry)||typeof entry.eventId!=='string'||!safe(entry.at)||
      !['end','generate'].includes(entry.action as string)||(amount(entry.costCents)??0n)<=0n)))
    return fail('Invalid News power spending')
  const cash = amount(g.balance, true), earned = amount(g.lifetimeEarned)
  const giftCents = amount(gifts.cycleGiftCents)
  if (cash === null || earned === null || giftCents === null || cash > earned + giftCents)
    return fail('Cash / lifetime earnings / gifts inconsistent')
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
    const spent = amount(p.fameSpentMicros), forfeited = amount(p.fameForfeitedMicros)
    const cycleEarned = amount(p.cycleEarnedFameMicros)
    const cycleLevels = amount(p.cycleLevelFameMicros)
    const cycleCollections = amount(p.cycleCollectionFameMicros)
    if (expectedSpent === null || spent === null || forfeited === null ||
        cycleEarned === null || cycleLevels === null || cycleCollections === null ||
        spent !== BigInt(expectedSpent) * 1_000_000n ||
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
    if (p.fameShopLedgerVersion !== undefined || p.fameLegacyLevels !== undefined ||
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
  if (shopPP === null || lifetimePP - availablePP !== BigInt(shopPP)) return fail('PP shop ledger does not balance')
  if(progress.history && Array.isArray(progress.history) && progress.history.length > 100)
    return fail('Prestige history exceeds 100 cycles')
  if (!Array.isArray(progress.history) || typeof progress.prestigeCount !== 'number' ||
      !Number.isSafeInteger(progress.prestigeCount) || progress.prestigeCount < 0)
    return fail('Missing prestige history')
  if(progress.shopVersion===2){
    const ranks=progress.upgradeLevels as Record<string,number>
    const legacy=progress.legacyRanks as Record<string,number>
    for(const offer of prestigeShop)
      if(ranks[offer.id]>legacy[offer.id] && progress.prestigeCount<offer.cycle)return fail('Locked Prestige purchase')
  }
  let pointsInHistory=0n
  for (const [index, item] of progress.history.entries()) {
    if (!object(item) || amount(item.eligibleWorthCents) === null || amount(item.earnedPoints) === null ||
      !Number.isSafeInteger(item.cycle) || item.cycle !== progress.prestigeCount - progress.history.length + index + 1)
      return fail('Invalid prestige history')
    const total=amount(item.earnedPoints)!
    const worth=amount(item.eligibleWorthCents)!
    if(item.formulaVersion===2){
      if(progress.shopVersion!==2 || !safe(item.completedAtRealMs) || !safe(item.levelAtCompletion) || total===0n || prestigePoints(worth,item.levelAtCompletion)!==total)return fail('Invalid Prestige V2 reward')
    } else if(item.formulaVersion!==undefined || !safe(item.levelAtCompletion)||item.levelAtCompletion<100||
      !safe(item.completedAtRealMs)||worth<10_000_000_000n||
      (worth<=BigInt(Number.MAX_SAFE_INTEGER) &&
        BigInt(previewPrestigePoints(Number(worth)/100,item.levelAtCompletion))!==total))
      return fail('Invalid historical Prestige reward')
    pointsInHistory+=total
  }
  if(pointsInHistory>lifetimePP||
    (progress.prestigeCount<=100 && pointsInHistory!==lifetimePP))
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
