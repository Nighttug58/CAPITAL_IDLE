import { ASCENSION_UPGRADES, ascensionSpentPoints, createZeroAscensionLevels, nextAscensionCost } from './catalog.ts'
import type { AscensionUpgradeId } from './contracts.ts'
import type { V8CapitalState } from '../exact-state-v8.ts'

// All eleven classic Prestige upgrades are available immediately whenever PP
// are available. Removal of cycle gates preserves historical prices and ledgers.
const prices: Partial<Record<AscensionUpgradeId, [number, number]>> = {
  'news-frequency':[20,22], 'news-duration':[45,35], 'volatility-radar':[75,0],
  'news-preview':[50,40], 'news-impact':[65,40], 'news-propagation':[160,0],
  'crypto-staking':[175,0], 'market-frenzy':[250,0], 'time-accelerator':[100,64],
  'staking-yield':[45,30], 'auto-compound':[200,0],
}
export const prestigeShop = ASCENSION_UPGRADES.flatMap(row => {
  const price = prices[row.id]
  return price ? [{id:row.id,maxLevel:row.maxLevel,first:price[0],step:price[1]}] : []
})
export function prestigeCost(id:string,rank:number) {
  const row=prestigeShop.find(r=>r.id===id)
  return row && Number.isInteger(rank) && rank>=0 && rank<row.maxLevel ? row.first+rank*row.step : null
}
export function prestigeSpent(levels:unknown,legacy:unknown):number|null {
  if(ascensionSpentPoints(levels)===null || ascensionSpentPoints(legacy)===null)return null
  const current=levels as ReturnType<typeof createZeroAscensionLevels>
  const old=legacy as typeof current
  let spent=0
  for(const {id} of ASCENSION_UPGRADES){
    if(old[id]>current[id] || (!prices[id] && current[id]))return null
    for(let i=0;i<current[id];i++)spent+=i<old[id]?nextAscensionCost(id,i)!:prestigeCost(id,i)!
  }
  return spent
}
export function migratePrestigeShop(state:V8CapitalState):V8CapitalState {
  const {progress,run}=state.ascension
  if(progress.shopVersion===2)return state
  const kept=createZeroAscensionLevels()
  for(const {id} of prestigeShop)kept[id]=progress.upgradeLevels[id]
  const refund=ascensionSpentPoints(progress.upgradeLevels)!-ascensionSpentPoints(kept)!
  const {automation,marketOrders,nextOrderId,lastStrategyAtRealMs,...currentRun}=run
  return {...state,ascension:{progress:{...progress,shopVersion:2,legacyRanks:{...kept},upgradeLevels:kept,
    availablePoints:(BigInt(progress.availablePoints)+BigInt(refund)).toString()},
    run:currentRun}}
}
export const MIN_LEVEL=150
export const MIN_WORTH_CENTS=1_000_000_000_000n
export function prestigePoints(worth:bigint,level:number):bigint {
  if(level<MIN_LEVEL || worth<MIN_WORTH_CENTS)return 0n
  // floor(10 * (worth / threshold)^(7/20)) via the integer twentieth root.
  const n=10n**20n * worth**7n / MIN_WORTH_CENTS**7n
  let x=1n<<BigInt(Math.ceil(n.toString(2).length/20))
  for(;;){
    const next=(19n*x+n/x**19n)/20n
    if(next>=x)return x
    x=next
  }
}

// V4 (21/11/2026): stronger Prestige rewards after order-induced pumps were removed.
// floor(250 * sqrt(eligible wealth / $10B)); keep prestigePoints for old receipts.
export function prestigePointsV4(worth: bigint, level: number): bigint {
  if (level < MIN_LEVEL || worth < MIN_WORTH_CENTS) return 0n
  const squared = 62_500n * worth / MIN_WORTH_CENTS
  let root = 1n << BigInt(Math.ceil(squared.toString(2).length / 2))
  for (;;) {
    const next = (root + squared / root) >> 1n
    if (next >= root) return root
    root = next
  }
}
