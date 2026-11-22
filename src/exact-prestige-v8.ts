import { MIN_LEVEL, MIN_WORTH_CENTS, prestigePointsV4 as previewV8PrestigePoints } from './ascension/v2.ts'
export { previewV8PrestigePoints }

import type {V8CapitalState} from './exact-state-v8.ts'
import {createV8CapitalState,getExactAmount as v,withExactAmount as s} from './exact-state-v8.ts'
import {getExactLevel} from './exact-levels.ts'
import {exactTradeCost,quoteToExactFraction} from './exact-trading.ts'
import {getAsset} from './trading/catalog.ts'
import {v8AdvanceFiscalEconomy,v8PayTaxes} from './exact-runtime-v8.ts'
import {MAX_ASCENSION_HISTORY} from './ascension/state.ts'
import {MARKET_TICK_MS} from './trading/market.ts'
import {transcendentLevel,transcendentHeritageBps,pendingStartingCapitalCents} from './ascension/transcendent-v1.ts'
import { collectionV3Snapshot } from './prestige/collections-v3.ts'
import { nextPrestigeCycle, MAX_SAFE_CYCLE } from './ascension/prestige-count-v8.ts'
import { prestigeFameV4Trading } from './trading/fame-v4-trading.ts'
import { prestigeFameV4Collections } from './prestige/collections-v4.ts'
import { v4ContractEarlyExitWorth,v4ForceContractsBeforePrestige,v4PrestigeEnterpriseData } from './economy/fame-v4-enterprises.ts'

/** Exact Prestige eligible wealth, excluding persistent luxury collections. */
export function v8EligiblePrestigeWorthCents(state:V8CapitalState):bigint{
  let gross=v(state.game.balance)-v(state.fiscal.taxesDueCents)+v4ContractEarlyExitWorth(state)
  for(const [id,item]of Object.entries(state.trading.positions)){
    const asset=getAsset(id)
    if(!asset)throw new RangeError('Unknown asset in portfolio')
    const price=state.trading.quotes[id]?.price??asset.referencePrice
    const units=v(item.quantity)
    const fraction=quoteToExactFraction(price)
    if(!fraction)throw new RangeError('Invalid quote')
    const fee=asset.kind==='stock'?50n:asset.kind==='crypto'?100n:150n
    const proceeds=exactTradeCost(fraction,units,asset.quantityDecimals,fee,'sell')
    if(!proceeds)throw new RangeError('Invalid portfolio valuation')
    gross+=proceeds.proceedsCents
  }
  for(const company of Object.values(state.enterprises.owned))gross+=v(company.investedCents)
  // One economy-wide exclusion, independent of cash/portfolio/business form.
  // Only gains above the initial principal become PP-eligible.
  return gross-v(state.ascension.run.startingCapitalGrantedCents??'0')
}

/** Exact PP preview freezes the current Museum and Heritage status in V3 receipts. */
export function v8PrestigeRewardPreview(state:V8CapitalState,worth:bigint,level:number){
  const base=previewV8PrestigePoints(worth,level)
  const heritageLevelAtCycle=transcendentLevel(state.ascension.progress,'heritage')
  const museumCompleteAtCycle=collectionV3Snapshot(state.prestige.ownedCollectionIds).museumComplete
  const bonusBps=transcendentHeritageBps(state.ascension.progress,museumCompleteAtCycle)
  const earned=base*BigInt(bonusBps)/10_000n
  return {base,earned,bonusBps,heritageLevelAtCycle,museumCompleteAtCycle}
}
export type V8PrestigeResult =
  | {ok:true;state:V8CapitalState;earnedPoints:bigint;cycle:number;worthCents:bigint}
  | {ok:false;reason:string}

/** Pure atomic reset; writer guarantees only one v8 save replace. */
export function v8PerformPrestige(state:V8CapitalState,at:number):V8PrestigeResult{
  if(!Number.isSafeInteger(at)||at<0||at<state.enterprises.lastAccruedAt||
    at<state.fiscal.periodStartedAt||at<state.trading.lastTickAt||
    at<state.trading.dividendLastPaidAt||at<state.ascension.run.startedAtRealMs)
    return{ok:false,reason:'invalid-clock'}
  const settled=v8AdvanceFiscalEconomy(state,at)
  if(settled.enterprises.lastAccruedAt!==at)return{ok:false,reason:'money-overflow'}
  if(at-settled.trading.lastTickAt>=MARKET_TICK_MS||
    at-settled.trading.dividendLastPaidAt>=1000)return{ok:false,reason:'pending-market-replay'}
  // Closing every active contract at 85% before computing PP prevents a
  // phantom principal in eligible wealth and never credits failure as income.
  const exited=v4ForceContractsBeforePrestige(settled,at)
  const afterTax=v8PayTaxes(exited,at,true)
  const level=getExactLevel(v(afterTax.prestige.experienceCents))
  if(level<MIN_LEVEL)return{ok:false,reason:'insufficient-level'}
  const eligible=v8EligiblePrestigeWorthCents(afterTax)
  if(eligible<MIN_WORTH_CENTS)return{ok:false,reason:'insufficient-worth'}
  const reward=v8PrestigeRewardPreview(afterTax,eligible,level)
  const earnedPoints=reward.earned
  const progress=afterTax.ascension.progress
  const startingCapitalLevelAtCycle=transcendentLevel(progress,'starting-capital')
  const grant=pendingStartingCapitalCents(progress)
  const nextCycle=nextPrestigeCycle(progress)
  const nextProgress={...progress,
    availablePoints:s(v(progress.availablePoints)+earnedPoints),
    lifetimePoints:s(v(progress.lifetimePoints)+earnedPoints),
    prestigeCount:nextCycle.prestigeCount,
    ...(nextCycle.prestigeCountExact!==undefined?{prestigeCountExact:nextCycle.prestigeCountExact}:{}),
    history:[...progress.history,{formulaVersion:progress.transcendentV1?.version===1 ? 4 as const : 5 as const,cycle:nextCycle.prestigeCount,
      ...(nextCycle.cycleExact>MAX_SAFE_CYCLE?{cycleExact:s(nextCycle.cycleExact)}:{}),
      completedAtRealMs:at,
      eligibleWorthCents:s(eligible),earnedPoints:s(earnedPoints),levelAtCompletion:level,
      basePoints:s(reward.base),heritageLevelAtCycle:reward.heritageLevelAtCycle,
      museumCompleteAtCycle:reward.museumCompleteAtCycle,bonusBps:reward.bonusBps,
      startingCapitalLevelAtCycle,startingCapitalGrantedCents:s(grant)}]
      .slice(-MAX_ASCENSION_HISTORY),
  }
  const fresh=createV8CapitalState(at)
  const {...previousPrestige}=afterTax.prestige
  delete previousPrestige.xpRebase
  delete previousPrestige.xpRebaseV4
  const result:V8CapitalState={...fresh,
    game:{...fresh.game,balance:s(grant)},
    ...(state.newsPowers?{newsPowers:state.newsPowers}:{}),
    trading:{...fresh.trading,...(state.trading.autoSellRules?{autoSellRules:state.trading.autoSellRules}:{}),
      ...(state.trading.fameV4Trading?{fameV4Trading:prestigeFameV4Trading(state.trading.fameV4Trading)}:{})},
    prestige:{...previousPrestige,
      ...(afterTax.prestige.fameV4Collections?{
        fameV4Collections:prestigeFameV4Collections(afterTax.prestige.fameV4Collections)}:{}),
      experienceCents:'0',lastAwardedLevel:1,
      experienceCarryBps:0,clickCarryBps:0,tradingCarryBps:0,
      fameMicros:'0',fameForfeitedMicros:s(v(previousPrestige.fameForfeitedMicros)+v(previousPrestige.fameMicros)),
      cycleEarnedFameMicros:'0',cycleLevelFameMicros:'0',cycleCollectionFameMicros:'0'},
    fiscal:afterTax.fiscal,
    enterprises:{...fresh.enterprises,...(v4PrestigeEnterpriseData(afterTax)?{
      fameV4Enterprise:v4PrestigeEnterpriseData(afterTax)}:{})},
    ascension:{...fresh.ascension,progress:nextProgress,
      run:{...fresh.ascension.run,startingCapitalGrantedCents:s(grant)}},
    achievements:{claimedIds:[...afterTax.achievements.claimedIds],cycleGiftCents:'0'},
  }
  return{ok:true,state:result,earnedPoints,cycle:nextCycle.prestigeCount,worthCents:eligible}
}
