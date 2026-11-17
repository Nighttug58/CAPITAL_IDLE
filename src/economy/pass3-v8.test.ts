import test from 'node:test'
import assert from 'node:assert/strict'
import { createCapitalState } from '../capital.ts'
import { createV8CapitalState, convertValidatedV7ToV8, getExactAmount as cents } from '../exact-state-v8.ts'
import { v8AccrueEnterpriseUntil, v8AdvanceFiscalEconomy, v8BuyEnterprise, v8BuyEnterpriseMax, quoteV8EnterpriseMax, quoteV8ClickMax, v8UpgradeClickMax, v8UpgradeClick, v8CreditIncome } from '../exact-runtime-v8.ts'
import { ENTERPRISES, getEnterpriseIncomeMicrosPerSecondExact, getEnterpriseUpgradeCostCentsExact, getEnterpriseUpgradeBatchCostCentsExact } from './catalog.ts'
import { UPGRADES } from '../game.ts'
import { validateExactV8State } from '../exact-save-validation.ts'
import { saveV8CapitalState, loadV8CapitalState, exportV8Save, prepareV8SaveImport } from '../exact-persistence-v8.ts'
import { getAsset } from '../trading/catalog.ts'
import { FISCAL_PERIOD_MS } from './state.ts'

const START = 1_800_000_000_000
const wealth = 10n ** 110n
const seeded = (level = 20) => {
  const base = createV8CapitalState(START)
  return {
    ...base,
    game: { ...base.game, balance: wealth.toString(), lifetimeEarned: wealth.toString() },
    enterprises: { ...base.enterprises, owned: { kiosque: { level, investedCents: '192620302' } } },
  }
}
const validate = (state: ReturnType<typeof seeded>) =>
  validateExactV8State(state, id => getAsset(id)?.quantityDecimals ?? null)

test('V8 upgrades business 20 -> 21 -> 22 without a company cap and with exact invested book value', () => {
  const state = seeded(20)
  const first = v8BuyEnterprise(state, 'kiosque', START, true)
  assert.equal(first.ok, true)
  if (!first.ok) return
  assert.equal(first.state.enterprises.owned.kiosque.level, 21)
  assert.equal(first.costCents, getEnterpriseUpgradeCostCentsExact('kiosque', 20))
  assert.equal(cents(first.state.enterprises.owned.kiosque.investedCents), 192620302n + first.costCents)
  assert.equal(cents(first.state.game.balance), wealth - first.costCents)
  const second = v8BuyEnterprise(first.state, 'kiosque', START, true)
  assert.equal(second.ok, true)
  if (!second.ok) return
  assert.equal(second.state.enterprises.owned.kiosque.level, 22)
  assert.ok(second.costCents > first.costCents)
  assert.equal(cents(second.state.game.balance), wealth - first.costCents - second.costCents)
  assert.equal(cents(second.state.game.lifetimeEarned), wealth, 'upgrading is not eligible XP income')
  const checked = validate(second.state)
  assert.equal(checked.valid, true, checked.reason)
})

test('level 1000 earns beyond Number safe limit, accrual is exact and cannot double credit', () => {
  const state = seeded(1000)
  const rate = getEnterpriseIncomeMicrosPerSecondExact('kiosque', 1000)!
  assert.ok(rate > 10n ** 14n)
  const next = v8AccrueEnterpriseUntil(state, START + 123_456)
  const whole = rate * 123_456n / 10_000_000n
  const carry = rate * 123_456n % 10_000_000n
  assert.equal(cents(next.game.balance) - cents(state.game.balance), whole)
  assert.equal(cents(next.enterprises.revenueCarryNanoCents!), carry)
  assert.equal(cents(next.fiscal.taxesDueCents), whole * 1_500n / 10_000n)
  assert.equal(cents(next.prestige.experienceCents) > 0n, true)
  assert.strictEqual(v8AccrueEnterpriseUntil(next, START + 123_456), next)
  assert.equal(validate(next).valid, true, validate(next).reason)
})

test('one-shot 72h+offline catch-up is equivalent to splitting at the real fiscal boundary', () => {
  const base = seeded(100)
  const end = START + FISCAL_PERIOD_MS + 12_345
  const whole = v8AdvanceFiscalEconomy(base, end)
  const split = v8AdvanceFiscalEconomy(v8AdvanceFiscalEconomy(base, START + FISCAL_PERIOD_MS), end)
  for (const key of ['balance', 'lifetimeEarned'] as const)
    assert.equal(whole.game[key], split.game[key])
  for (const key of ['taxesPaidCents', 'taxesDueCents'] as const)
    assert.equal(whole.fiscal[key], split.fiscal[key])
  assert.equal(whole.prestige.experienceCents, split.prestige.experienceCents)
  assert.equal(whole.stats.earnedBySource.enterprises, split.stats.earnedBySource.enterprises)
  assert.equal(whole.fiscal.periodStartedAt, START + FISCAL_PERIOD_MS)
  assert.equal(validate(whole).valid, true, validate(whole).reason)
})

test('V8 preserves level 1000 and enormous invested cost through save, reload and import/export', () => {
  const base = seeded(1000)
  const upgraded = v8BuyEnterprise(base, 'kiosque', START, true)
  assert.equal(upgraded.ok, true)
  if (!upgraded.ok) return
  const state = v8AccrueEnterpriseUntil(upgraded.state, START + 1000)
  const storage = new Map<string,string>()
  const store = { getItem: (key:string) => storage.get(key) ?? null,
    setItem: (key:string,value:string) => { storage.set(key,value) } }
  assert.equal(saveV8CapitalState(store,state),true)
  const loaded = loadV8CapitalState(store,START+1000)
  assert.equal(loaded.ok,true)
  if (!loaded.ok) return
  assert.equal(loaded.state.enterprises.owned.kiosque.level,1001)
  assert.equal(loaded.state.enterprises.owned.kiosque.investedCents,
    state.enterprises.owned.kiosque.investedCents)
  assert.equal(loaded.state.game.balance,state.game.balance)
  const restored = prepareV8SaveImport(exportV8Save(loaded.state,START+1000),START+1000)
  assert.equal(restored.ok,true)
  if (restored.ok) assert.deepEqual(restored.state, state)
})

test('old V7 company remains owned at original book value and receives only future new rates', () => {
  const initial = createCapitalState({ balance: 1_000_000, lifetimeEarned: 1_000_000, purchasedUpgrades: 0 }, START)
  initial.enterprises.owned.kiosque = {level:20, investedCents:987_654_321}
  const migrated = convertValidatedV7ToV8(initial)
  assert.equal(migrated.enterprises.owned.kiosque.level,20)
  assert.equal(migrated.enterprises.owned.kiosque.investedCents,'987654321')
  const before = cents(migrated.game.balance)
  const after = v8AccrueEnterpriseUntil(migrated,START+1000)
  assert.ok(cents(after.game.balance)>before)
  assert.equal(after.enterprises.owned.kiosque.investedCents,'987654321')
  assert.equal(validate(after).valid,true,validate(after).reason)
})


test('MAX enterprise: batch sum matches every separately rounded price at all brackets', () => {
  const range=getEnterpriseUpgradeBatchCostCentsExact
  for (const business of ['kiosque','restaurant','data-center','groupe-technologique']) {
    for (const start of [1,2,18,19,20,21,32,199,200,999,1000,10_000]) {
      for (const count of [0,1,2,5,20,200]) {
        let brute=0n
        for(let i=start;i<start+count;i++)brute+=getEnterpriseUpgradeCostCentsExact(business,i)!
        assert.equal(range(business,start,start+count),brute,
          business+' '+start+'->'+(start+count))
      }
    }
  }
  assert.equal(range('bad',1,3),null)
  assert.equal(range('kiosque',20,19),null)
  assert.equal(range('kiosque',1,Number.MAX_SAFE_INTEGER),null)
  const now=performance.now()
  assert.ok(range('kiosque',20,1_000_000_000_000)!>0n)
  assert.ok(performance.now()-now<1000,'one-trillion-level batch must be constant time')
})

test('MAX click quote: buy only affordable and unlocked ranks, single atomic debit', () => {
  const initial=createV8CapitalState(START)
  const wealthy=v8CreditIncome(initial,'clicks',10n**20n)
  const full=quoteV8ClickMax(wealthy)
  assert.ok(full)
  assert.equal(full.targetLevel,UPGRADES.length)
  let sequential=wealthy
  for(let i=0;i<UPGRADES.length;i++){
    const next=v8UpgradeClick(sequential)
    assert.ok(next)
    sequential=next
  }
  const batched=v8UpgradeClickMax(wealthy,0)
  assert.ok(batched)
  assert.equal(batched.game.balance,sequential.game.balance)
  assert.equal(batched.game.purchasedUpgrades,sequential.game.purchasedUpgrades)
  assert.equal(batched.prestige.experienceCents,wealthy.prestige.experienceCents)
  assert.equal(batched.ascension.progress.availablePoints,wealthy.ascension.progress.availablePoints)
  assert.equal(quoteV8ClickMax(batched),null)
  assert.equal(v8UpgradeClickMax(batched,0),null)
  assert.equal(validate(batched).valid,true,validate(batched).reason)

  const limit=12
  const affordable=UPGRADES.slice(0,limit).reduce((a,r)=>a+BigInt(r.price)*100n,0n)
  const limited={...wealthy,game:{...wealthy.game,balance:affordable.toString()}}
  assert.equal(quoteV8ClickMax(limited)?.levelsBought,limit)
  assert.equal(v8UpgradeClickMax(limited,0)?.game.balance,'0')
  const locked={...initial,game:{...initial.game,balance:(10n**100n).toString()}}
  assert.equal(quoteV8ClickMax(locked),null,'cash must not bypass player-level gate')
  assert.equal(quoteV8ClickMax({...wealthy,game:{...wealthy.game,balance:'-1'}}),null)
})

test('MAX enterprise: includes acquisition and sums original costs, settlement and ledger once', () => {
  const initial=v8CreditIncome(createV8CapitalState(START),'clicks',10n**20n)
  const target=26
  const expectedCost=BigInt(ENTERPRISES[0]!.purchaseCostCents)+
    getEnterpriseUpgradeBatchCostCentsExact('kiosque',1,target)!
  const state={...initial,game:{...initial.game,balance:expectedCost.toString()}}
  const quote=quoteV8EnterpriseMax(state,'kiosque')
  assert.ok(quote)
  assert.equal(quote.targetLevel,target)
  assert.equal(quote.levelsBought,target)
  assert.equal(quote.costCents,expectedCost)
  const result=v8BuyEnterpriseMax(state,'kiosque',START,0)
  assert.equal(result.ok,true)
  if(!result.ok)return
  assert.equal(result.state.enterprises.owned.kiosque.level,target)
  assert.equal(result.state.enterprises.owned.kiosque.investedCents,expectedCost.toString())
  assert.equal(result.state.game.balance,'0')
  assert.equal(result.state.game.lifetimeEarned,state.game.lifetimeEarned)
  assert.equal(result.state.prestige.experienceCents,state.prestige.experienceCents)
  assert.equal(result.state.ascension.progress.availablePoints,state.ascension.progress.availablePoints)
  assert.equal(validate(result.state).valid,true,validate(result.state).reason)
  assert.deepEqual(v8BuyEnterpriseMax(result.state,'kiosque',START,0),{ok:false,reason:'stale-level'})
  assert.equal(quoteV8EnterpriseMax(result.state,'kiosque'),null)
  const old=state
  let sequential=old
  for(let i=0;i<target;i++){
    const bought=v8BuyEnterprise(sequential,'kiosque',START,i!==0)
    assert.ok(bought.ok)
    if(!bought.ok)return
    sequential=bought.state
  }
  assert.equal(sequential.game.balance,result.state.game.balance)
  assert.equal(sequential.enterprises.owned.kiosque.investedCents,result.state.enterprises.owned.kiosque.investedCents)
})

test('MAX enterprise: huge BigInt budget, no artificial level cap, save/import lossless', () => {
  const initial=createV8CapitalState(START)
  const wealth=10n**100n
  const state={...initial,
    game:{...initial.game,balance:wealth.toString(),lifetimeEarned:wealth.toString()},
    enterprises:{...initial.enterprises,owned:{kiosque:{level:1000,investedCents:'987654321'}}}}
  const before=performance.now()
  const quote=quoteV8EnterpriseMax(state,'kiosque')
  assert.ok(quote)
  assert.equal(quote.targetLevel,Number.MAX_SAFE_INTEGER-1)
  assert.ok(quote.levelsBought>1_000_000)
  assert.ok(performance.now()-before<1000,'MAX quote must use binary search, not buy loops')
  const res=v8BuyEnterpriseMax(state,'kiosque',START,1000)
  assert.equal(res.ok,true)
  if(!res.ok)return
  assert.equal(res.state.enterprises.owned.kiosque.level,Number.MAX_SAFE_INTEGER-1)
  assert.equal(getEnterpriseUpgradeBatchCostCentsExact('kiosque',1000,res.state.enterprises.owned.kiosque.level),res.costCents)
  assert.equal(validate(res.state).valid,true,validate(res.state).reason)
  const store=new Map<string,string>()
  const storage={getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>{store.set(k,v)}}
  assert.equal(saveV8CapitalState(storage,res.state),true)
  const loaded=loadV8CapitalState(storage,START)
  assert.equal(loaded.ok,true)
  if(loaded.ok)assert.equal(loaded.state.enterprises.owned.kiosque.level,Number.MAX_SAFE_INTEGER-1)
  const imported=prepareV8SaveImport(exportV8Save(res.state,START),START)
  assert.equal(imported.ok,true)
  if(imported.ok)assert.deepEqual(imported.state,res.state)
})

test('MAX enterprise: reject invalid ID, locked level, negative cash and stale request', () => {
  const empty=createV8CapitalState(START)
  assert.equal(quoteV8EnterpriseMax(empty,'kiosque'),null)
  assert.equal(quoteV8EnterpriseMax(empty,'missing'),null)
  assert.deepEqual(v8BuyEnterpriseMax(empty,'missing',START,0),{ok:false,reason:'unknown-enterprise'})
  assert.deepEqual(v8BuyEnterpriseMax(empty,'kiosque',START,0),{ok:false,reason:'level-locked'})
  const unlocked=v8CreditIncome(empty,'clicks',10n**15n)
  const cashless={...unlocked,game:{...unlocked.game,balance:'-1'}}
  assert.equal(quoteV8EnterpriseMax(cashless,'kiosque'),null)
  assert.deepEqual(v8BuyEnterpriseMax(unlocked,'kiosque',START,1),{ok:false,reason:'stale-level'})
  assert.deepEqual(v8BuyEnterpriseMax(unlocked,'kiosque',START-1,0),{ok:false,reason:'invalid-clock'})
})
