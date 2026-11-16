/** V8 version of current (PRE-rebalance) Prestige cycle and point accounting.
 * Eligibility/costs stay at level 100 and $100M until pass 6. */
import type {V8CapitalState} from './exact-state-v8.ts'
import {createV8CapitalState,getExactAmount as v,withExactAmount as s} from './exact-state-v8.ts'
import {getExactLevel} from './exact-levels.ts'
import {exactTradeCost,quoteToExactFraction} from './exact-trading.ts'
import {getAsset} from './trading/catalog.ts'
import {v8AdvanceFiscalEconomy,v8PayTaxes} from './exact-runtime-v8.ts'
import {MAX_ASCENSION_HISTORY} from './ascension/state.ts'
import {MARKET_TICK_MS} from './trading/market.ts'

const MIN_LEVEL=100
const MIN_WORTH_CENTS=10_000_000_000n
/** Newton integer square-root; no Number conversion even at 10^1000. */
export function isqrt(n:bigint):bigint{
  if(n<0n)throw new RangeError('Negative square root')
  if(n<2n)return n
  let x=1n<<BigInt(Math.ceil(n.toString(2).length/2))
  for(;;){const y=(x+n/x)>>1n;if(y>=x)return x;x=y}
}
export function previewV8PrestigePoints(worthCents:bigint,level:number):bigint{
  if(level<MIN_LEVEL||worthCents<MIN_WORTH_CENTS)return 0n
  return isqrt(worthCents*400n/MIN_WORTH_CENTS)
}

/** Exact Prestige eligible wealth, excluding persistent luxury collections. */
export function v8EligiblePrestigeWorthCents(state:V8CapitalState):bigint{
  let gross=v(state.game.balance)-v(state.fiscal.taxesDueCents)
  for(const [id,item]of Object.entries(state.trading.positions)){
    const asset=getAsset(id)
    if(!asset)throw new RangeError('Unknown asset in portfolio')
    const price=state.trading.quotes[id]?.price??asset.referencePrice
    const fraction=quoteToExactFraction(price)
    if(!fraction)throw new RangeError('Invalid quote')
    const priceCents=exactTradeCost(fraction,v(item.quantity),asset.quantityDecimals,0n,'sell')
    if(!priceCents)throw new RangeError('Invalid portfolio valuation')
    gross+=priceCents.grossCents
  }
  for(const company of Object.values(state.enterprises.owned))gross+=v(company.investedCents)
  return gross
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
  const afterTax=v8PayTaxes(settled,at,true)
  const level=getExactLevel(v(afterTax.prestige.experienceCents))
  if(level<MIN_LEVEL)return{ok:false,reason:'insufficient-level'}
  const eligible=v8EligiblePrestigeWorthCents(afterTax)
  if(eligible<MIN_WORTH_CENTS)return{ok:false,reason:'insufficient-worth'}
  const earnedPoints=previewV8PrestigePoints(eligible,level)
  const progress=afterTax.ascension.progress
  const nextCycle=progress.prestigeCount+1
  if(!Number.isSafeInteger(nextCycle))return{ok:false,reason:'cycle-overflow'}
  const nextProgress={...progress,
    availablePoints:s(v(progress.availablePoints)+earnedPoints),
    lifetimePoints:s(v(progress.lifetimePoints)+earnedPoints),
    prestigeCount:nextCycle,
    history:[...progress.history,{cycle:nextCycle,completedAtRealMs:at,
      eligibleWorthCents:s(eligible),earnedPoints:s(earnedPoints),levelAtCompletion:level}]
      .slice(-MAX_ASCENSION_HISTORY),
  }
  const fresh=createV8CapitalState(at)
  const {...previousPrestige}=afterTax.prestige
  delete previousPrestige.xpRebase
  delete previousPrestige.xpRebaseV4
  const result:V8CapitalState={...fresh,
    prestige:{...previousPrestige,experienceCents:'0',lastAwardedLevel:1,
      experienceCarryBps:0,clickCarryBps:0,tradingCarryBps:0,
      // Pass 5 prepares cycle counters; the actual Fame balance reset is
      // deliberately postponed to the Prestige V2 redesign in pass 6.
      cycleEarnedFameMicros:'0',cycleLevelFameMicros:'0',cycleCollectionFameMicros:'0'},
    fiscal:afterTax.fiscal,
    ascension:{...fresh.ascension,progress:nextProgress},
    achievements:{claimedIds:[...afterTax.achievements.claimedIds],cycleGiftCents:'0'},
  }
  return{ok:true,state:result,earnedPoints,cycle:nextCycle,worthCents:eligible}
}
