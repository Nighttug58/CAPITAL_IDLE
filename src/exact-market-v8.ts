/** Exact dividends and market clock. Price discovery stays the existing seeded
 * deterministic Trading engine. Only the monetary settlement moves to BigInt.
 * This module does not introduce price-bound changes (pass 2). */
import type { V8CapitalState, V8TradingState } from './exact-state-v8.ts'
import { getExactAmount as v, withExactAmount as s } from './exact-state-v8.ts'
import { quoteToExactFraction } from './exact-trading.ts'
import { v8ExactRewardRate } from './prestige/exact-bonuses-v8.ts'
import { v8CreditIncome, v8AdvanceFiscalEconomy } from './exact-runtime-v8.ts'
import { advanceMarketTick, MARKET_TICK_MS, createRandom } from './trading/market.ts'
import { createEvent, getNewsDirection, isGlobalBearishNews, trimNews } from './trading/news.ts'
import type { TradingState } from './trading/types.ts'
import { ASSETS } from './trading/catalog.ts'
import { MARKET_SPEEDS, FRENZY_ACTIVE_MS } from './ascension/market-effects.ts'
import { transcendentNewsModifiers } from './ascension/transcendent-v1.ts'
import { applyNewsAutoSells, applyFameV4AutoSells } from './trading/auto-sell-v8.ts'
import { v4DividendBonusBps,observeFameV4News } from './trading/fame-v4-trading.ts'
import { v4CollectionsBonusBps } from './prestige/collections-v4.ts'
import {v4PrestigeBonusBps} from './prestige/fame-v4-prestige.ts'

const YEAR_SECONDS = 86_400n
const PICO_CENTS = 1_000_000_000_000n
const STOCKS=ASSETS.filter(asset=>asset.kind==='stock')

export function v8MarketNewsEffects(state:V8CapitalState,at:number){
  const levels=state.ascension.progress.upgradeLevels
  const frenzyEnds=state.ascension.run.frenzyEndsAtRealMs??0
  const frenzy=levels['market-frenzy']>0 && at>=frenzyEnds-FRENZY_ACTIVE_MS && at<frenzyEnds
  const advanced=transcendentNewsModifiers(state.ascension.progress)
  return {
    durationMultiplier:1+.25*levels['news-duration']+advanced.durationAdditional,
    impactMultiplier:(1+.25*levels['news-impact']+advanced.powerAdditional)*(frenzy?1.5:1),
    rampFraction:advanced.rampFraction,
    frequencyMultiplier:1+.05*levels['news-frequency'],
    propagateSingle:levels['news-propagation']>0,
  }
}

/** Exact per-second gross dividend in trillionths of a cent. */
export function v8DividendPicoCents(trading:V8TradingState):bigint {
  let total=0n
  for(const asset of STOCKS){
    const position=trading.positions[asset.id]
    if(!position)continue
    const quantity=v(position.quantity)
    if(quantity<=0n)continue
    const yieldNow=trading.quotes[asset.id]?.dividendYield??asset.initialDividendYield
    if(yieldNow===null)continue
    const refPrice=quoteToExactFraction(asset.referencePrice)
    const yieldRate=quoteToExactFraction(yieldNow)
    if(!refPrice||!yieldRate)continue
    const numerator=quantity*refPrice.numerator*yieldRate.numerator*100n*PICO_CENTS
    const denominator=10n**BigInt(asset.quantityDecimals)*refPrice.denominator*yieldRate.denominator*YEAR_SECONDS
    total+=numerator/denominator
  }
  return total
}

/** Simulates exactly ONE real second; no timelapse, double-paying or Number caps. */
export function v8AdvanceMarketSecond(state:V8CapitalState,recordHistory=true):V8CapitalState {
  const previous=state.trading.dividendLastPaidAt
  const at=previous+1000
  if(!Number.isSafeInteger(at))return state
  const run=state.ascension.run
  let clock=run.marketClock
  let origin=run.startedAtRealMs
  const dormant=clock.simulatedAtMs===origin && clock.realAnchorMs===origin && previous!==origin
  if(dormant){origin=previous;clock={...clock,simulatedAtMs:previous,realAnchorMs:previous}}
  if(clock.realAnchorMs!==previous||at<clock.realAnchorMs)return state
  const speedIndex=MARKET_SPEEDS.indexOf(clock.selectedSpeed)
  const speed=speedIndex<0 || speedIndex>state.ascension.progress.upgradeLevels['time-accelerator'] ? 1 : clock.selectedSpeed
  const nextSimulatedAt=clock.simulatedAtMs+(at-clock.realAnchorMs)*speed
  if(!Number.isSafeInteger(nextSimulatedAt))return state
  const previousTicks=Math.floor((clock.simulatedAtMs-origin)/MARKET_TICK_MS)
  const nextTicks=Math.floor((nextSimulatedAt-origin)/MARKET_TICK_MS)
  if(nextTicks<previousTicks||nextTicks-previousTicks>1)return state
  let trading=state.trading
  if(nextTicks>previousTicks){
    const effects=v8MarketNewsEffects(state,at)
    const updated=advanceMarketTick(trading as unknown as TradingState,recordHistory,{
      realAt:at,speed,
      updateDividends:Math.floor((at-origin)/MARKET_TICK_MS)>
        Math.floor((Math.max(origin,trading.lastTickAt)-origin)/MARKET_TICK_MS),
      newsStrength:effects.impactMultiplier,
      newsRampFraction:effects.rampFraction,
      news:{durationMultiplier:effects.durationMultiplier,frequencyMultiplier:effects.frequencyMultiplier,
        propagateSingle:effects.propagateSingle,eager:true},
    })
    trading=updated as unknown as V8TradingState
  }
  // Le ticker de prix tourne par 5s, mais une News de secours doit démarrer
  // dès la prochaine seconde réelle où aucune News rouge/verte n'est active.
  const liveNews = trading.news.filter(event => !isGlobalBearishNews(event))
  if (!liveNews.some(event => event.startedAt <= at && event.endsAt > at &&
      getNewsDirection(event) !== 'neutral')) {
    const random = createRandom(trading.seed)
    const effects = v8MarketNewsEffects(state,at)
    const emergency = createEvent(at,() => random.next(),liveNews,{
      durationMultiplier:effects.durationMultiplier,
      propagateSingle:effects.propagateSingle,
    })
    trading = {...trading,seed:random.seed(),news:trimNews([...liveNews,emergency],at)}
  }
  const carry=trading.dividendCarryPicoCents!==undefined?v(trading.dividendCarryPicoCents):
    BigInt(Math.round(trading.dividendCarry*Number(PICO_CENTS)))
  const pending=v(trading.dividendPendingCents)
  // Add Fame V4 direct + diversification to the historical dividend reward once.
  // The absolute Fame multiplier is restricted to the six classic powers.
  const grossPico=v8DividendPicoCents(trading)
  let earnedPico=0n
  if(grossPico>0n){
    const bonus=v8ExactRewardRate(state,'dividend')
    const newV4Bps=Math.min(4500,v4DividendBonusBps(state)+
      v4CollectionsBonusBps(state,'dividend',previous)+
      v4PrestigeBonusBps(state,'dividend',previous))
    earnedPico=grossPico*bonus.numerator*
      BigInt(10_000+newV4Bps)/(bonus.denominator*10_000n)
  }
  const total=carry+pending*PICO_CENTS+earnedPico
  const due=total/PICO_CENTS
  const rem=total%PICO_CENTS
  const updated:V8CapitalState={...state,
    trading:{...trading,dividendLastPaidAt:at,
      dividendPendingCents:'0',dividendCarryPicoCents:s(rem),
      dividendCarry:Number(rem)/Number(PICO_CENTS)},
    ascension:{...state.ascension,run:{...run,startedAtRealMs:origin,
      marketClock:{...clock,realAnchorMs:at,simulatedAtMs:nextSimulatedAt}}},
  }
  const credited=due>0n?v8CreditIncome(updated,'dividends',due):updated
  const observed=observeFameV4News(state,v8AdvanceFiscalEconomy(credited,at),at)
  return applyFameV4AutoSells(applyNewsAutoSells(state,observed,at),at)
}
