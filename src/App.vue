<script setup lang="ts">
import {createV8CapitalState, getExactAmount as v, type V8CapitalState} from './exact-state-v8.ts'
import {projectV8ForLegacyUI, approximateMoneyCents} from './exact-view-v8.ts'
import {loadV8CapitalState, saveV8CapitalState, exportV8Save} from './exact-persistence-v8.ts'
import {createV8MarketRuntime} from './exact-clock-v8.ts'
import {makeOfflineReport,offlineReportDuration,OFFLINE_REPORT_MIN_MS,type OfflineReport} from './offline-report-v8.ts'
import OfflineReportDialog from './components/OfflineReportDialog.vue'
import {v8SettlePassiveIncome} from './exact-autoclick-frame.ts'
import {getExactLevel,getExactLevelProgress} from './exact-levels.ts'
import {formatCompactUnits,formatFameMicros,decodeExactInteger} from './large-numbers.ts'
import {finiteNumberDecimal} from './exact-save-v8.ts'
import { DOLLAR_AUTOCLICK_MAX_LEVEL, dollarAutoClickPriceCents, getDollarAutoClickLevel, buyDollarAutoClick } from './dollar-autoclick-v8.ts'
import {v8Click,v8UpgradeClick,v8BuyTrade,v8SellTrade, type V8TradeResult,v8BuyEnterprise,
 v8PayTaxes,v8BuyFameUpgrade,v8BuyFameUpgradeMax,v8BuyCollection,v8BuyCollectionsMax,v8BuyPrestigeUpgrade,v8BuyPrestigeUpgradeMax,v8ClaimAvailableAchievements,
 quoteV8ClickMax,v8UpgradeClickMax,v8BuyEnterpriseMax,v8BonusBasisPoints} from './exact-runtime-v8.ts'
import {v8ChangeStaking, type V8StakingResult} from './exact-staking-v8.ts'
import {buyNewsPower,newsPowerCost} from './news-powers.ts'
import {v8PerformPrestige} from './exact-prestige-v8.ts'
import {getAsset} from './trading/catalog.ts'
import { setNewsAutoSellRule, type NewsAutoSellTrigger } from './trading/auto-sell-v8.ts'
import { setFameV4TrailingStop, setFameV4ProfitTarget } from './trading/fame-v4-trading.ts'
import {getEnterpriseIncomeMicrosPerSecondExact} from './economy/catalog.ts'
import {v4ChooseSynergy,v4ChooseEnterprise,v4StartContract,v4StartProject, type FameV4EnterpriseCommand} from './economy/fame-v4-enterprises.ts'

import {getCollectionSlot,getV2NextFameBoostCost,FAME_BOOST_BPS_PER_LEVEL} from './prestige/catalog.ts'
import {v8BuyFameV4Upgrade,v8BuyFameV4UpgradeMax} from './prestige/fame-v4-ledger.ts'
import {prestigeCost as nextAscensionCost} from './ascension/v2.ts'
import {v8BuyTranscendent,v8BuyTranscendentMax,transcendentNextCost,type TranscendentId} from './ascension/transcendent-v1.ts'
import {FISCAL_PERIOD_MS} from './economy/state.ts'
import { computed, nextTick, onMounted, onUnmounted, ref, watch, type CSSProperties } from 'vue'
import {PRIMARY_PAGES, adjacentPage, nextPageToward, isPrimaryPage, isSwipeDirectionHorizontal, shouldCompleteSwipe, NAV_ADJACENT_MS, NAV_PASS_THROUGH_MS, NAV_LAST_HOP_MS, type PrimaryPage} from './navigation/swipe.ts'
import {
  getClickValue,
  MAX_CLICK_LEVEL,
  getNextUpgrade,
  type GameState,
} from './game.ts'
import { getClaimableAchievementCount, type AchievementMetric, type AchievementBatchResult } from './achievements.ts'
import AchievementsScreen from './components/AchievementsScreen.vue'
import { exportFileName } from './save-transfer.ts'
import type { CapitalState } from './capital.ts'
import { type StakingResult } from './trading/staking.ts'
import type { TradeResult, TradeSide } from './trading/trades.ts'
import TradingScreen from './components/TradingScreen.vue'
import EnterpriseScreen from './components/EnterpriseScreen.vue'
import StatsScreen from './components/StatsScreen.vue'
import FameShopScreen from './components/FameShopScreen.vue'
import CollectionScreen from './components/CollectionScreen.vue'
import PrestigeScreen from './components/PrestigeScreen.vue'
import TranscendentShopScreen from './components/TranscendentShopScreen.vue'
import { type AscensionPurchase } from './ascension/shop.ts'
import { type AscensionResult } from './ascension/engine.ts'
import { activateMarketFrenzy, selectMarketSpeed, type MarketActionResult } from './ascension/market-effects.ts'
import { getBonusBreakdown } from './prestige/bonuses.ts'
import { collectionV3BonusBps, collectionV3Snapshot } from './prestige/collections-v3.ts'
import { type FameShopPurchase } from './prestige/shop.ts'
import { type CollectionPurchase } from './prestige/collections.ts'
import type { EarlyTaxPaymentResult } from './economy/fiscal.ts'
import type { EnterpriseAction, EnterpriseResult } from './economy/enterprises.ts'

interface FloatingGain {
  id: number
  amount: number
  x: number
  y: number
}

// V8 is the single authoritative state. The old numeric model is a read-only
// compatibility projection for existing Vue screens, NEVER a save authority.
const boot = loadV8CapitalState(localStorage)
const loadBlocked = ref(!boot.ok)
const loadError = ref(boot.ok ? '' : boot.reason)
const exact = ref<V8CapitalState>(boot.ok ? boot.state : createV8CapitalState())
const offlineReport=ref<OfflineReport|null>(null)
let reportBaseline:V8CapitalState|null=null
let reportAt:number|undefined
function prepareOfflineReport(at:number){
  if(offlineReport.value||offlineReportDuration(exact.value,at)<OFFLINE_REPORT_MIN_MS)return
  reportBaseline=exact.value
  reportAt=at
  const pending=Math.max(0,Math.floor((at-exact.value.trading.dividendLastPaidAt)/1000))
  offlineReport.value=makeOfflineReport(reportBaseline,reportBaseline,at,pending)
}
function dismissOfflineReport(){offlineReport.value=null;reportBaseline=null;reportAt=undefined}
const capital = ref<CapitalState>(projectV8ForLegacyUI(exact.value))
const game = computed<GameState>(() => capital.value.game)
const level = computed(() => getExactLevel(v(exact.value.prestige.experienceCents)))
const clickValue = computed(() => getClickValue(game.value.purchasedUpgrades) * (1 + v8BonusBasisPoints(exact.value, 'click') / 10_000))
const xpProgress = computed(() => getExactLevelProgress(v(exact.value.prestige.experienceCents)))
const xpLabel = computed(() => formatCompactUnits(v(exact.value.prestige.experienceCents)-xpProgress.value.startCents,2,'XP')+' / '+
  formatCompactUnits(xpProgress.value.nextCents-xpProgress.value.startCents,2,'XP'))
const nextUpgrade = computed(() => getNextUpgrade(game.value))
const upgradeUnlocked = computed(() => !!nextUpgrade.value && level.value >= nextUpgrade.value.requiredLevel)
const upgradeAffordable = computed(() => upgradeUnlocked.value && !!nextUpgrade.value &&
  v(exact.value.game.balance) >= BigInt(nextUpgrade.value.price)*100n)
const clickMaxQuote = computed(() => quoteV8ClickMax(exact.value))
const clickMaxNotice = ref('')
const nextGain = computed(() => (nextUpgrade.value?.clickValue ?? 0) * (1 + v8BonusBasisPoints(exact.value, 'click') / 10_000))
const autoClickLevel = computed(() => getDollarAutoClickLevel(exact.value))
const autoClickCost = computed(() => dollarAutoClickPriceCents(autoClickLevel.value))
const autoClickAffordable = computed(() => autoClickCost.value !== null && v(exact.value.game.balance) >= autoClickCost.value)
const missingAutoClickCash = computed(() => autoClickCost.value===null ? null
  : autoClickCost.value > v(exact.value.game.balance) ? autoClickCost.value-v(exact.value.game.balance) : 0n)
const page = ref<PrimaryPage | 'fame' | 'prestige' | 'transcendent'>('home')
const fameLaunch = ref<HTMLButtonElement | null>(null)
const prestigeLaunch = ref<HTMLButtonElement | null>(null)
const focusTranscendentReturn=ref(false)
const achievementsLaunch = ref<HTMLButtonElement | null>(null)
const claimableAchievements = computed(() => getClaimableAchievementCount(capital.value))
const isFullscreen = ref(false)
const supportsFullscreen = typeof document !== 'undefined' && typeof document.documentElement.requestFullscreen === 'function'
const floatingGains = ref<FloatingGain[]>([])
const boostDialog = ref<HTMLDialogElement | null>(null)
const clickBoosts = computed(() => {
  const legacy = getBonusBreakdown(capital.value, 'click')
  const collectionBps = collectionV3BonusBps(collectionV3Snapshot(exact.value.prestige.ownedCollectionIds), 'click')
  return { ...legacy, collectionBps, totalBps: v8BonusBasisPoints(exact.value, 'click') }
})
const tapAnimationId = ref(0)
let nextGainId = 0
let marketRuntime: ReturnType<typeof createV8MarketRuntime> | null = null
let activeSince: number | null = null


/** Only the main navigation participates in horizontal slides. Fame and Prestige
 * remain dedicated secondary pages; the fullscreen control is not a page. */
interface SlideState {
  id:number
  from:PrimaryPage
  to:PrimaryPage
  direction:-1|1
  width:number
  startPx:number
  duration:number
  running:boolean
  commit:boolean
}
interface PointerGesture {
  id:number
  startX:number
  startY:number
  startedAt:number
  axis:'undecided'|'vertical'|'horizontal'
}
const appRoot=ref<HTMLElement|null>(null)
const displayedPage=ref<PrimaryPage>('home')
const slide=ref<SlideState|null>(null)
const drag=ref<{neighbor:PrimaryPage|null;delta:number;width:number}|null>(null)
let trackedPointer:PointerGesture|null=null
let slideId=0
let slideFrame=0
let slideTimer=0
let hopCount=0
let suppressClickUntil=0

function pageWidth():number {
  return Math.max(1,appRoot.value?.getBoundingClientRect().width || window.innerWidth || 360)
}
function motionAllowed():boolean {
  return typeof window.matchMedia==='function' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
function clearSlideHandles() {
  if(slideFrame)cancelAnimationFrame(slideFrame)
  if(slideTimer)clearTimeout(slideTimer)
  slideFrame=0
  slideTimer=0
}
function finishSlide(id:number) {
  const step=slide.value
  if(!step || step.id!==id)return
  clearSlideHandles()
  slide.value=null
  if(step.commit){
    hopCount++
    displayedPage.value=step.to
  }
  if(step.commit && isPrimaryPage(page.value))advanceMainNavigation()
}
function beginSlide(to:PrimaryPage,startPx=0,commit=true) {
  const from=displayedPage.value
  if(from===to)return
  if(!motionAllowed()) {
    slide.value=null
    drag.value=null
    if(commit) {
      displayedPage.value=to
      advanceMainNavigation()
    }
    return
  }
  const direction=PRIMARY_PAGES.indexOf(to)>PRIMARY_PAGES.indexOf(from)?1:-1
  const remaining=isPrimaryPage(page.value)?Math.abs(PRIMARY_PAGES.indexOf(page.value)-PRIMARY_PAGES.indexOf(from)):1
  const baseDuration=remaining>1?NAV_PASS_THROUGH_MS:hopCount>0?NAV_LAST_HOP_MS:NAV_ADJACENT_MS
  const width=pageWidth()
  const duration=startPx===0?baseDuration:Math.max(95,Math.round(NAV_ADJACENT_MS*(1-Math.min(.8,Math.abs(startPx)/width))))
  const id=++slideId
  slide.value={id,from,to,direction,width,startPx,duration,running:false,commit}
  drag.value=null
  // Mount the next screen at the edge before animating its transform.
  void nextTick(() => {
    if(slide.value?.id!==id)return
    const run=()=>{
      slideFrame=0
      if(slide.value?.id!==id)return
      slide.value={...slide.value,running:true}
      // Also finish if the browser does not dispatch transitionend (background tabs).
      slideTimer=window.setTimeout(()=>finishSlide(id),duration+75)
    }
    if(typeof requestAnimationFrame==='function') {
      slideFrame=requestAnimationFrame(()=>{
        if(slide.value?.id!==id)return
        slideFrame=requestAnimationFrame(run)
      })
    } else {
      slideTimer=window.setTimeout(run,16)
    }
  })
}
function advanceMainNavigation() {
  if(slide.value || !isPrimaryPage(page.value))return
  const next=nextPageToward(displayedPage.value,page.value)
  if(!next)return
  if(!motionAllowed()) {
    displayedPage.value=page.value
    return
  }
  beginSlide(next)
}
function navigateTo(target:PrimaryPage) {
  // A secondary page is not a swipe step: leaving it directly chooses a main tab.
  if(!isPrimaryPage(page.value)) {
    clearSlideHandles()
    slide.value=null
    drag.value=null
    trackedPointer=null
    displayedPage.value=target
    page.value=target
    return
  }
  page.value=target
  if(drag.value) {
    drag.value=null
    trackedPointer=null
  }
  if(!slide.value) {
    hopCount=0
    advanceMainNavigation()
  }
}
function showMainPage(target:PrimaryPage):boolean {
  if(!isPrimaryPage(page.value))return false
  const current=slide.value
  if(current)return current.from===target || current.to===target
  const dragging=drag.value
  return target===displayedPage.value || dragging?.neighbor===target
}
function mainPageStyle(target:PrimaryPage):CSSProperties {
  const current=slide.value
  if(current && (current.from===target || current.to===target)) {
    const atFrom=current.running?(current.commit?-current.direction*current.width:0):current.startPx
    const x=target===current.from?atFrom:
      current.running?(current.commit?0:current.direction*current.width):current.startPx+current.direction*current.width
    return {transform:`translate3d(${x}px,0,0)`,
      transition:current.running?`transform ${current.duration}ms cubic-bezier(.2,.7,.2,1)`:'none',
      pointerEvents:'none',willChange:'transform'}
  }
  const dragging=drag.value
  if(dragging && (target===displayedPage.value || target===dragging.neighbor)) {
    const direction=dragging.delta<0?1:-1
    const x=target===displayedPage.value?dragging.delta:dragging.delta+direction*dragging.width
    return {transform:`translate3d(${x}px,0,0)`,transition:'none',pointerEvents:'none',willChange:'transform'}
  }
  // Important: no transform on the settled page, so fixed dialogs remain fixed
  // to the viewport instead of becoming trapped inside a transformed ancestor.
  return {}
}
function onSlideTransitionEnd(event:TransitionEvent) {
  if(event.propertyName!=='transform' || !(event.target instanceof HTMLElement) || !event.target.matches('main'))return
  const current=slide.value
  if(current?.running)finishSlide(current.id)
}
function blockPageSwipe(target:EventTarget|null):boolean {
  if(!(target instanceof Element))return true
  if(target.closest('.bottom-nav,dialog,[role="dialog"],[role="alertdialog"],[aria-modal="true"],.trading-modal-backdrop,.prestige-overlay,.collection-overlay,.news-overlay,.news-layer,.ascension-confirm-overlay,.market-chart,.trading-tabs,.collection-tabs,.prestige-tabs,input,textarea,select,[contenteditable="true"],[role="slider"],[data-no-page-swipe]'))return true
  // Nested horizontal scrollers own their gestures; ordinary vertical lists do not.
  for(let el:Element|null=target;el && el!==appRoot.value;el=el.parentElement) {
    if(el instanceof HTMLElement && el.scrollWidth>el.clientWidth+4) {
      const overflowX=window.getComputedStyle(el).overflowX
      if(overflowX==='auto'||overflowX==='scroll')return true
    }
  }
  const modals=document.querySelectorAll('dialog[open],[aria-modal="true"],[role="dialog"],[role="alertdialog"],.trading-modal-backdrop')
  return Array.from(modals).some(el=>{
    const owner=el.closest('main') as HTMLElement|null
    return !owner || owner.style.display!=='none'
  })
}
function beginPageGesture(event:PointerEvent) {
  if(!isPrimaryPage(page.value) || slide.value || trackedPointer || (event.pointerType==='mouse' && event.button!==0) || blockPageSwipe(event.target))return
  trackedPointer={id:event.pointerId,startX:event.clientX,startY:event.clientY,startedAt:Date.now(),axis:'undecided'}
}
function movePageGesture(event:PointerEvent) {
  const gesture=trackedPointer
  if(!gesture || event.pointerId!==gesture.id || slide.value)return
  const dx=event.clientX-gesture.startX
  const dy=event.clientY-gesture.startY
  if(gesture.axis==='undecided' && Math.max(Math.abs(dx),Math.abs(dy))>11) {
    gesture.axis=isSwipeDirectionHorizontal(dx,dy)?'horizontal':'vertical'
  }
  if(gesture.axis!=='horizontal')return
  const width=pageWidth()
  const direction=dx<0?1:-1
  const neighbor=adjacentPage(displayedPage.value,direction)
  drag.value={neighbor,delta:neighbor?Math.max(-width,Math.min(width,dx)):dx*.16,width}
}
function endPageGesture(event:PointerEvent) {
  const gesture=trackedPointer
  if(!gesture || event.pointerId!==gesture.id)return
  trackedPointer=null
  if(gesture.axis!=='horizontal')return
  suppressClickUntil=Date.now()+350
  const dragging=drag.value
  if(!dragging){return}
  const neighbor=dragging.neighbor
  const committed=!!neighbor && shouldCompleteSwipe(dragging.delta,Date.now()-gesture.startedAt)
  if(committed && neighbor) {
    hopCount=0
    page.value=neighbor
    beginSlide(neighbor,dragging.delta,true)
  } else if(neighbor) {
    beginSlide(neighbor,dragging.delta,false)
  } else drag.value=null
}
function cancelPageGesture(event:PointerEvent) {
  if(trackedPointer?.id!==event.pointerId)return
  trackedPointer=null
  if(drag.value?.neighbor)beginSlide(drag.value.neighbor,drag.value.delta,false)
  else drag.value=null
}
function preventSwipeClick(event:MouseEvent) {
  if(Date.now()>suppressClickUntil || (event.target instanceof Element && event.target.closest('.bottom-nav')))return
  suppressClickUntil=0
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()
}

const progressPercent = computed(() => xpProgress.value.fractionBasisPoints / 100)

const numberFormatter = new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 2 })
const formatMoney = (value: number) => numberFormatter.format(value) + ' $'
const exactCashLabel = computed(() => formatCompactUnits(v(exact.value.game.balance)))

const fameBalance = computed(() => formatFameMicros(v(exact.value.prestige.fameMicros)))
function openFameShop() {
  page.value = 'fame'
}
function returnHomeFromFame() {
  page.value = 'home'
  void nextTick(() => fameLaunch.value?.focus())
}
function openAchievements() { navigateTo('achievements') }
function returnHomeFromAchievements() {
  navigateTo('home')
  void nextTick(() => achievementsLaunch.value?.focus())
}
function syncExactState(next: V8CapitalState) {
  exact.value = next
  capital.value = projectV8ForLegacyUI(next)
}
function claimAchievementRewards(groupId?: AchievementMetric): AchievementBatchResult {
  if (loadBlocked.value) return {ok:false,error:'storage-error'}
  const result = v8ClaimAvailableAchievements(exact.value,groupId)
  if (!result) return {ok:false,error:'nothing-to-claim'}
  // Un seul commit de sauvegarde pour les paliers: tous ou aucun.
  return replaceWholeSaveExact(result.state)
    ? {ok:true,count:result.count,rewardCents:result.rewardCents}
    : {ok:false,error:'storage-error'}
}
function openPrestige() {
  focusTranscendentReturn.value=false
  page.value = 'prestige'
}
function openTranscendentShop() { page.value='transcendent' }
function returnToPrestige() {
  focusTranscendentReturn.value=true
  page.value='prestige'
}
function executeTranscendentMaxPurchase(id:TranscendentId,expectedRank:number):{levels:number;costPoints:bigint}|null {
  if(loadBlocked.value)return null
  settleEconomyNow()
  const before=v(exact.value.ascension.progress.availablePoints)
  const next=v8BuyTranscendentMax(exact.value,id,expectedRank)
  if(!next || !replaceWholeSaveExact(next))return null
  return {levels:next.ascension.progress.transcendentV1!.levels[id]-expectedRank,
    costPoints:before-v(next.ascension.progress.availablePoints)}
}
function executeTranscendentPurchase(id:TranscendentId,expectedRank:number,quoted:bigint):boolean {
  if(loadBlocked.value || transcendentNextCost(expectedRank)!==quoted)return false
  settleEconomyNow()
  const next=v8BuyTranscendent(exact.value,id,expectedRank)
  return !!next && replaceWholeSaveExact(next)
}
function returnHomeFromPrestige() {
  focusTranscendentReturn.value=false
  page.value = 'home'
  void nextTick(() => prestigeLaunch.value?.focus())
}

function executeFamePurchase(id: string, currentLevel: number): FameShopPurchase {
  if (loadBlocked.value) return {ok:false,state:capital.value,error:'invalid-state'}
  settleEconomyNow()
  const price = getV2NextFameBoostCost(id,currentLevel)
  const oldFame = v(exact.value.prestige.fameMicros)
  const next = v8BuyFameUpgrade(exact.value,id as keyof V8CapitalState['prestige']['boosts'],currentLevel)
  if (!next || price===null) return {ok:false,state:capital.value,error:'insufficient-fame'}
  if(!replaceWholeSaveExact(next))return {ok:false,state:capital.value,error:'invalid-state'}
  const state=capital.value
  const actualCost = oldFame-v(next.prestige.fameMicros)
  return {ok:true,state,receipt:{
    boostId:id as keyof V8CapitalState['prestige']['boosts'],
    previousLevel:currentLevel,newLevel:currentLevel+1,
    costFame:price,costMicros:Number(actualCost),
    previousBonusBps:currentLevel*FAME_BOOST_BPS_PER_LEVEL,
    newBonusBps:(currentLevel+1)*FAME_BOOST_BPS_PER_LEVEL,
    remainingFameMicros:state.prestige.fameMicros,
  }}
}

/** Entire Fame MAX buy is one V8 state and one verified persistence boundary. */
function executeFameMaxPurchase(id:string,expectedLevel:number):{levels:number;costFame:bigint}|null {
  if(loadBlocked.value)return null
  settleEconomyNow()
  const key=id as keyof V8CapitalState['prestige']['boosts']
  const before=v(exact.value.prestige.fameMicros)
  const next=v8BuyFameUpgradeMax(exact.value,key,expectedLevel)
  if(!next||!replaceWholeSaveExact(next))return null
  return {levels:next.prestige.boosts[key]-expectedLevel,
    costFame:(before-v(next.prestige.fameMicros))/1_000_000n}
}
function executeFameV4Purchase(id:string,expectedLevel:number):boolean {
  if(loadBlocked.value)return false
  settleEconomyNow()
  const next=v8BuyFameV4Upgrade(exact.value,id,expectedLevel)
  return !!next&&replaceWholeSaveExact(next)
}
function executeFameV4MaxPurchase(id:string,expectedLevel:number):{levels:number;costFame:bigint}|null {
  if(loadBlocked.value)return null
  settleEconomyNow()
  const before=v(exact.value.prestige.fameMicros)
  const next=v8BuyFameV4UpgradeMax(exact.value,id,expectedLevel)
  if(!next||!replaceWholeSaveExact(next))return null
  const itemId=id as keyof NonNullable<V8CapitalState['prestige']['fameV4']>['levels']
  return {levels:next.prestige.fameV4!.levels[itemId]-expectedLevel,
    costFame:(before-v(next.prestige.fameMicros))/1_000_000n}
}

function executeCollectionPurchase(id: string): CollectionPurchase {
  if (loadBlocked.value) return {ok:false,state:capital.value,error:'invalid-state'}
  settleEconomyNow()
  const slot = getCollectionSlot(id)
  if (!slot) return {ok:false,state:capital.value,error:'unknown-item'}
  const oldFame=v(exact.value.prestige.fameMicros)
  const next = v8BuyCollection(exact.value,id)
  if (!next) return {ok:false,state:capital.value,error:'insufficient-funds'}
  syncExactState(next)
  persist()
  const state=capital.value
  return {ok:true,state,receipt:{itemId:id,category:slot.category,
    priceCents:slot.priceCents,baseFame:slot.fame,
    awardedFameMicros:Number(v(next.prestige.fameMicros)-oldFame),
    boostId:slot.boostId,bonusBps:slot.bonusBps,
    remainingCashCents:approximateMoneyCents(v(next.game.balance))*100,
    availableFameMicros:state.prestige.fameMicros,
    ownedCount:next.prestige.ownedCollectionIds.length,
  }}
}

function executeCollectionMaxPurchase(): {ok:true;count:number;costCents:bigint;fameMicros:bigint}|{ok:false;error:'invalid-state'|'none-affordable'} {
  if (loadBlocked.value) return {ok:false,error:'invalid-state'}
  settleEconomyNow()
  const purchase=v8BuyCollectionsMax(exact.value)
  if (!purchase) return {ok:false,error:'none-affordable'}
  syncExactState(purchase.state)
  persist()
  return {ok:true,count:purchase.ids.length,costCents:purchase.costCents,fameMicros:purchase.fameMicros}
}

function click(event: MouseEvent) {
  if (loadBlocked.value) return
  const previous=v(exact.value.game.balance)
  const updated=v8Click(exact.value)
  const gainedCents=v(updated.game.balance)-previous
  if (gainedCents<=0n) return
  syncExactState(updated)
  persist()
  const gained=approximateMoneyCents(gainedCents)
  const target=event.currentTarget
  if (!(target instanceof HTMLElement))return
  const bounds=target.getBoundingClientRect()
  const pointerClick=event.detail!==0
  const pointerX=pointerClick?event.clientX-bounds.left:bounds.width/2
  const pointerY=pointerClick?event.clientY-bounds.top:bounds.height/2
  const x=Math.max(19,Math.min(81,(pointerX/Math.max(bounds.width,1))*100))
  const y=Math.max(24,Math.min(74,(pointerY/Math.max(bounds.height,1))*100))
  floatingGains.value=[...floatingGains.value.slice(-11),{id:++nextGainId,amount:gained,x,y}]
  tapAnimationId.value++
}

function removeFloatingGain(id: number) {
  floatingGains.value = floatingGains.value.filter((gain) => gain.id !== id)
}

function buy() {
  if (loadBlocked.value) return
  settleEconomyNow()
  const next = v8UpgradeClick(exact.value)
  if (next) {clickMaxNotice.value='';syncExactState(next); persist()}
}
function buyClickMax() {
  if (loadBlocked.value) return
  settleEconomyNow()
  const quote=clickMaxQuote.value
  if (!quote) return
  const next=v8UpgradeClickMax(exact.value,exact.value.game.purchasedUpgrades)
  if (!next || !replaceWholeSaveExact(next)) return
  clickMaxNotice.value=`+${quote.levelsBought} niveaux pour ${formatCompactUnits(quote.costCents,2,'$')}`
}
function buyAutoClick() {
  if (loadBlocked.value) return
  settleEconomyNow()
  const next = buyDollarAutoClick(exact.value, Date.now())
  if (next) replaceWholeSaveExact(next)
}

// All V8 money/quantity mutations go through the exact store, never the
// read-only v7 UI projection. Legacy receipts contain display-only Numbers.
function executeTrade(side: TradeSide, assetId: string, quantity: number): TradeResult {
  if (loadBlocked.value) return {ok:false,state:capital.value,error:'money-overflow'}
  settleEconomyNow()
  const before = exact.value
  const changed = side==='buy' ? v8BuyTrade(before,assetId,finiteNumberDecimal(quantity)??'invalid') :
    v8SellTrade(before,assetId,finiteNumberDecimal(quantity)??'invalid')
  if (!changed.ok) {
    const reason=changed.reason
    const error: TradeResult & {ok:false} = {ok:false,state:capital.value,
      error: reason==='insufficient-funds' ? 'insufficient-funds' :
        reason==='insufficient-holdings' ? 'insufficient-holdings' :
        reason==='staked-holdings' ? 'staked-holdings' :
        reason==='amount-too-small' ? 'amount-too-small' :
        reason==='invalid-quantity' ? 'invalid-quantity' :
        reason==='unknown-asset-or-invalid-price' ? 'invalid-price' : 'money-overflow'}
    return error
  }
  if (!replaceWholeSaveExact(changed.state)) return {ok:false,state:capital.value,error:'money-overflow'}
  const asset=getAsset(assetId)!
  return {ok:true,state:capital.value,receipt:{assetId,side,quantity,
    price:before.trading.quotes[assetId]?.price??asset.referencePrice,
    gross:approximateMoneyCents(changed.grossCents),fee:approximateMoneyCents(changed.feeCents),
    cashChange:approximateMoneyCents(changed.cashDeltaCents),
    netRealizedProfit:approximateMoneyCents(changed.realizedNetProfitCents),
    levelEarnings:approximateMoneyCents(v(changed.state.game.lifetimeEarned)-v(before.game.lifetimeEarned)),
    taxAccrued:approximateMoneyCents(v(changed.state.fiscal.taxesDueCents)-v(before.fiscal.taxesDueCents)),
  }}
}
/** Exact input path for unlimited quantities. No Number conversion or UI projection. */
function executeExactTrade(side: TradeSide, assetId: string, quantity: string): V8TradeResult {
  if (loadBlocked.value) return {ok:false,reason:'storage-error'}
  settleEconomyNow()
  const result=side==='buy'?v8BuyTrade(exact.value,assetId,quantity):v8SellTrade(exact.value,assetId,quantity)
  if(!result.ok)return result
  if(!replaceWholeSaveExact(result.state))return{ok:false,reason:'storage-error'}
  return result
}
function changeNewsAutoSellRule(assetId:string,trigger:NewsAutoSellTrigger,enabled:boolean):boolean {
  if(loadBlocked.value)return false
  const next=setNewsAutoSellRule(exact.value,assetId,trigger,enabled)
  return !!next && (next===exact.value || replaceWholeSaveExact(next))
}
function changeFameV4Stop(assetId:string,enabled:boolean,drawdownPct:number):boolean{
  if(loadBlocked.value)return false
  settleEconomyNow()
  const next=setFameV4TrailingStop(exact.value,assetId,enabled,drawdownPct)
  return !!next && (next===exact.value || replaceWholeSaveExact(next))
}
function changeFameV4Target(assetId:string,slot:number,gainPct:number|null,portionPct:number):boolean{
  if(loadBlocked.value)return false
  settleEconomyNow()
  const next=setFameV4ProfitTarget(exact.value,assetId,slot,gainPct,portionPct)
  return !!next && (next===exact.value || replaceWholeSaveExact(next))
}
function executeExactStaking(action:'deposit'|'withdraw',id:string,quantity:string):V8StakingResult{
  if(loadBlocked.value)return{ok:false,reason:'storage-error'}
  settleEconomyNow()
  const result=v8ChangeStaking(exact.value,action,id,quantity,Date.now())
  if(!result.ok)return result
  if(!replaceWholeSaveExact(result.state))return{ok:false,reason:'storage-error'}
  return result
}
function executeStaking(action:'deposit'|'withdraw',id:string,quantity:number):StakingResult {
  if(loadBlocked.value)return{ok:false,state:capital.value,error:'storage-error'}
  settleEconomyNow()
  const changed=v8ChangeStaking(exact.value,action,id,finiteNumberDecimal(quantity)??'invalid',Date.now())
  if(!changed.ok){const error=changed.reason as Exclude<StakingResult,{ok:true}>['error'];
    return{ok:false,state:capital.value,error}}
  if(!replaceWholeSaveExact(changed.state))return{ok:false,state:capital.value,error:'storage-error'}
  return {ok:true,state:capital.value,receipt:{assetId:id,action,quantity,unlockAt:changed.unlockAt}}
}
/** One settle-and-save boundary for all Fame V4 enterprise purchases/assignments.
 * The economy cursor is settled to the precise action timestamp first. */
function executeFameV4Enterprise(command:FameV4EnterpriseCommand):boolean{
  if(loadBlocked.value)return false
  const at=Date.now()
  const settled=v8SettlePassiveIncome(exact.value,at)
  if(settled.enterprises.lastAccruedAt!==at)return false
  let next:V8CapitalState|null=null
  if(command.kind==='synergy')
    next=v4ChooseSynergy(settled,command.first,command.second,at)
  else if(command.kind==='assign')
    next=v4ChooseEnterprise(settled,command.role,command.id,at)
  else if(command.kind==='contract'){
    const principal=decodeExactInteger(command.principalCents,false)
    next=principal===null?null:v4StartContract(settled,principal,command.minutes,at)
  }else if(command.kind==='project')
    next=v4StartProject(settled,command.tier,command.category,at)
  return !!next&&replaceWholeSaveExact(next)
}
function executeEnterpriseMax(id:string,expectedLevel:number) {
  if(loadBlocked.value)return{ok:false as const,error:'money-overflow' as const}
  settleEconomyNow()
  const result=v8BuyEnterpriseMax(exact.value,id,Date.now(),expectedLevel)
  if(!result.ok)return{ok:false as const,error:result.reason as Exclude<EnterpriseResult,{ok:true}>['error']|'stale-level'}
  if(!replaceWholeSaveExact(result.state))return{ok:false as const,error:'money-overflow' as const}
  marketRuntime?.wake()
  return{ok:true as const,level:result.state.enterprises.owned[id]!.level,
    levelsBought:result.levelsBought,costCents:result.costCents.toString()}
}
function executeEnterprise(action:EnterpriseAction,id:string):EnterpriseResult{
  if(loadBlocked.value)return{ok:false,state:capital.value,error:'money-overflow'}
  settleEconomyNow()
  const result=v8BuyEnterprise(exact.value,id,Date.now(),action==='upgrade')
  if(!result.ok)return{ok:false,state:capital.value,error:result.reason as Exclude<EnterpriseResult,{ok:true}>['error']}
  if(!replaceWholeSaveExact(result.state))return{ok:false,state:capital.value,error:'money-overflow'}
  marketRuntime?.wake()
  const level=result.state.enterprises.owned[id]?.level??0
  return{ok:true,state:capital.value,receipt:{enterpriseId:id,action,
    costCents:Math.max(0,approximateMoneyCents(result.costCents)*100),level,
    incomeMicrosPerSecond:Number(getEnterpriseIncomeMicrosPerSecondExact(id,level)??0n)}}
}
function persist():boolean {
  if(loadBlocked.value)return false
  if(activeSince!==null){
    const now=Date.now()
    const elapsed=Math.max(0,now-activeSince)
    activeSince=now
    if(Number.isSafeInteger(elapsed)&&Number.isSafeInteger(exact.value.stats.activePlayMs+elapsed)){
      syncExactState({...exact.value,stats:{...exact.value.stats,activePlayMs:exact.value.stats.activePlayMs+elapsed}})
    }
  }
  return saveV8CapitalState(localStorage,exact.value)
}
function settleEconomyNow(){
  if(loadBlocked.value)return
  const next=v8SettlePassiveIncome(exact.value,Date.now())
  if(next!==exact.value){syncExactState(next);persist()}
}
function payTaxes():EarlyTaxPaymentResult{
  if(loadBlocked.value)return{ok:false,state:capital.value,error:'money-overflow'}
  settleEconomyNow()
  const at=Date.now()
  const period=exact.value.fiscal.periodStartedAt
  const due=v(exact.value.fiscal.taxesDueCents)
  if(due===0n)return{ok:false,state:capital.value,error:'nothing-due'}
  if(at<period||at>=period+FISCAL_PERIOD_MS)return{ok:false,state:capital.value,error:'invalid-clock'}
  const next=v8PayTaxes(exact.value,at)
  if(!replaceWholeSaveExact(next))return{ok:false,state:capital.value,error:'money-overflow'}
  return{ok:true,state:capital.value,amountCents:Number(due>BigInt(Number.MAX_SAFE_INTEGER)?BigInt(Number.MAX_SAFE_INTEGER):due)}
}
function startMarketRuntime(){
  if(loadBlocked.value)return
  marketRuntime=createV8MarketRuntime({
    getState:()=>exact.value,
    isForeground:()=>!document.hidden,
    setState:syncExactState,
    persist,
    initialOfflineTarget:reportAt,
    onOfflineReplay:(state,pending,incomplete)=>{
      if(!offlineReport.value||!reportBaseline||reportAt===undefined)return
      offlineReport.value=makeOfflineReport(reportBaseline,state,reportAt,pending,incomplete)
      if(pending===0||incomplete){reportBaseline=null;reportAt=undefined}
    },
  })
  marketRuntime.start()
  if(document.hidden)marketRuntime.pause()
}
/** Stop timers, persist a verified V8 snapshot, and only then publish the
 * new in-memory state. Failed writes leave the previous game untouched. */
function replaceWholeSaveExact(next:V8CapitalState):boolean {
  marketRuntime?.stop()
  marketRuntime=null
  if(!saveV8CapitalState(localStorage,next)){
    if(!loadBlocked.value)startMarketRuntime()
    return false
  }
  loadBlocked.value=false
  loadError.value=''
  syncExactState(next)
  floatingGains.value=[]
  tapAnimationId.value=0
  nextGainId=0
  activeSince=document.hidden?null:Date.now()
  startMarketRuntime()
  return true
}
function exportSave():boolean {
  let url:string|null=null
  try{
    if(loadBlocked.value)return false
    settleEconomyNow()
    if(!persist())return false
    const at=Date.now()
    const blob=new Blob([exportV8Save(exact.value,at)],{type:'application/json;charset=utf-8'})
    url=URL.createObjectURL(blob)
    const link=document.createElement('a')
    link.href=url
    link.download=exportFileName(at)
    document.body.appendChild(link)
    try{link.click()}finally{link.remove()}
    const exportedUrl=url
    setTimeout(()=>URL.revokeObjectURL(exportedUrl),2000)
    return true
  }catch{if(url!==null)URL.revokeObjectURL(url);return false}
}
function importSave(next:V8CapitalState):boolean{return replaceWholeSaveExact(next)}
function resetSave():boolean{
  if(!replaceWholeSaveExact(createV8CapitalState(Date.now())))return false
  // A deliberate RESET means complete erasure, unlike the automatic V7->V8
  // migration which keeps a backup. The new V8 key is already authoritative.
  for(const key of ['capital-idle-save-v1','capital-idle-save-v2','capital-idle-save-v3',
    'capital-idle-save-v4','capital-idle-save-v5','capital-idle-save-v6',
    'capital-idle-save-v7','capital-idle-save-backup-v7']){
    try{localStorage.removeItem(key)}catch{/* V8 is still authoritative */}
  }
  return true
}
function executePrestigeMaxPurchase(id:string,expectedLevel:number):{levels:number;costPoints:bigint}|null {
  if(loadBlocked.value)return null
  settleEconomyNow()
  const key=id as keyof V8CapitalState['ascension']['progress']['upgradeLevels']
  const before=v(exact.value.ascension.progress.availablePoints)
  const next=v8BuyPrestigeUpgradeMax(exact.value,key,expectedLevel)
  if(!next || !replaceWholeSaveExact(next))return null
  return {levels:next.ascension.progress.upgradeLevels[key]-expectedLevel,
    costPoints:before-v(next.ascension.progress.availablePoints)}
}
function executePrestigePurchase(id:string,expectedLevel:number):AscensionPurchase{
  if(loadBlocked.value)return{ok:false,state:capital.value,error:'storage-error'}
  settleEconomyNow()
  const cost=nextAscensionCost(id as keyof V8CapitalState['ascension']['progress']['upgradeLevels'],expectedLevel)
  const next=v8BuyPrestigeUpgrade(exact.value,id as keyof V8CapitalState['ascension']['progress']['upgradeLevels'],expectedLevel)
  if(!next||cost===null)return{ok:false,state:capital.value,error:'insufficient-points'}
  if(!replaceWholeSaveExact(next))return{ok:false,state:capital.value,error:'storage-error'}
  return {ok:true,state:capital.value,receipt:{upgradeId:id as keyof V8CapitalState['ascension']['progress']['upgradeLevels'],
    previousLevel:expectedLevel,newLevel:expectedLevel+1,costPoints:cost,
    remainingPoints:Number(v(next.ascension.progress.availablePoints)>BigInt(Number.MAX_SAFE_INTEGER)?
      BigInt(Number.MAX_SAFE_INTEGER):v(next.ascension.progress.availablePoints))}}
}
function purchaseNews(id:string|null,count:number,quoted:bigint):boolean {
  if(loadBlocked.value || newsPowerCost(exact.value,id!==null)!==quoted)return false
  const next=buyNewsPower(exact.value,id,count,Date.now())
  return !!next && replaceWholeSaveExact(next)
}
function executePrestigeCycle():AscensionResult{
  if(loadBlocked.value)return{ok:false,state:capital.value,error:'storage-error'}
  settleEconomyNow()
  const at=Date.now()
  const before=exact.value
  const tax=v(before.fiscal.taxesDueCents)
  const changed=v8PerformPrestige(before,at)
  if(!changed.ok){
    if(changed.reason==='pending-market-replay')marketRuntime?.wake()
    return{ok:false,state:capital.value,error:changed.reason as Exclude<AscensionResult,{ok:true}>['error']}
  }
  if(!replaceWholeSaveExact(changed.state))return{ok:false,state:capital.value,error:'storage-error'}
  const limited=(n:bigint)=>Number(n>BigInt(Number.MAX_SAFE_INTEGER)?BigInt(Number.MAX_SAFE_INTEGER):n)
  return{ok:true,state:capital.value,receipt:{cycle:changed.cycle,
    earnedPoints:limited(changed.earnedPoints),totalPoints:limited(v(changed.state.ascension.progress.availablePoints)),
    eligibleWorthCents:limited(changed.worthCents),taxesSettledCents:limited(tax),completedAt:at}}
}
function executeMarketSpeed(speed:number):MarketActionResult{
  const result=selectMarketSpeed(capital.value,speed,Date.now())
  if(!result.ok||result.state===capital.value)return result
  const next={...exact.value,ascension:{...exact.value.ascension,run:{...exact.value.ascension.run,
    marketClock:result.state.ascension.run.marketClock}}}
  return replaceWholeSaveExact(next)?{ok:true,state:capital.value}:{ok:false,state:capital.value,error:'storage-error'}
}
function executeMarketFrenzy():MarketActionResult{
  const result=activateMarketFrenzy(capital.value,Date.now())
  if(!result.ok)return result
  const run=result.state.ascension.run
  const next={...exact.value,ascension:{...exact.value.ascension,run:{...exact.value.ascension.run,
    frenzyEndsAtRealMs:run.frenzyEndsAtRealMs,frenzyReadyAtRealMs:run.frenzyReadyAtRealMs}}}
  return replaceWholeSaveExact(next)?{ok:true,state:capital.value}:{ok:false,state:capital.value,error:'storage-error'}
}

function syncMarketVisibility() {
  if (document.hidden) {
    marketRuntime?.pause()
    persist()
    activeSince = null
  } else {
    activeSince = Date.now()
    marketRuntime?.resume()
  }
}

function syncMarketPageShow() {
  activeSince = document.hidden ? null : Date.now()
  marketRuntime?.resume()
}

function syncMarketPageHide() {
  marketRuntime?.pause()
  persist()
  activeSince = null
}

function syncFullscreen() {
  isFullscreen.value = !!document.fullscreenElement
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen()
    } else {
      await document.documentElement.requestFullscreen()
    }
  } catch {
    // Le plein écran est facultatif, et peut être refusé par le navigateur.
  }
}

// Les clics sont sauvegardés aussitôt ; les centaines de ticks de rattrapage
// ne déclenchent pas une écriture localStorage à chaque tranche.
// V8 commands explicitly persist; no observer is allowed to serialize the v7 UI facade.

onMounted(() => {
  activeSince = document.hidden ? null : Date.now()
  if(!loadBlocked.value){
    if(boot.ok&&boot.origin!=='new')prepareOfflineReport(Date.now())
    startMarketRuntime()
  }

  document.addEventListener('fullscreenchange', syncFullscreen)
  document.addEventListener('visibilitychange', syncMarketVisibility)
  window.addEventListener('pagehide', syncMarketPageHide)
  window.addEventListener('pageshow', syncMarketPageShow)
})

// A hidden home must never keep click popups to replay when it is shown again.
watch(page, (next) => {
  if (next !== 'home') floatingGains.value = []
}, { flush: 'sync' })

onUnmounted(() => {
  clearSlideHandles()
  document.removeEventListener('fullscreenchange', syncFullscreen)
  document.removeEventListener('visibilitychange', syncMarketVisibility)
  window.removeEventListener('pagehide', syncMarketPageHide)
  window.removeEventListener('pageshow', syncMarketPageShow)
  marketRuntime?.stop()
  marketRuntime = null
  persist()
  activeSince = null
})
</script>

<template>
  <div ref="appRoot" class="app-shell" @pointerdown.capture="beginPageGesture" @pointermove.capture="movePageGesture"
    @pointerup.capture="endPageGesture" @pointercancel.capture="cancelPageGesture"
    @click.capture="preventSwipeClick" @transitionend.capture="onSlideTransitionEnd">
    <div v-if="loadBlocked" class="save-load-blocked" role="alert">
      Sauvegarde non chargée ({{ loadError }}). Vos données ont été préservées :
      importez un fichier valide depuis Stats, ou utilisez RESET pour recommencer.
    </div>
    <main v-show="showMainPage('home')" id="accueil" class="home-screen" :style="mainPageStyle('home')">
      <div class="home-actions">
        <button ref="fameLaunch" class="fame-shop-launch" type="button" @click="openFameShop"
          :title="'Fame disponibles : ' + fameBalance"
          :aria-label="'Ouvrir le Fame Shop, ' + fameBalance + ' Fame disponibles'">
          <b aria-hidden="true">✦</b><span>Fame Shop</span><strong>{{ fameBalance }}</strong>
        </button>
        <button v-if="page === 'home'" ref="prestigeLaunch" class="prestige-launch" type="button"
          aria-label="Ouvrir le Prestige" @click="openPrestige">
          <span class="prestige-launch-symbol" aria-hidden="true">◆</span>
          <span class="prestige-launch-info"><strong>PRESTIGE</strong>
            <small>{{ formatCompactUnits(v(exact.ascension.progress.availablePoints),0,'PP') }} PP</small>
          </span>
        </button>
      </div>
      <div class="balance-value" aria-label="Solde">{{exactCashLabel}}</div>
      <section class="home-progression" aria-label="Progression et améliorations">
        <div class="home-progress-head">
          <div class="home-progress-identity">
            <span class="home-progress-caption">PROGRESSION</span>
            <strong>Niveau <span>{{ level }}</span></strong>
          </div>
          <div class="home-progress-actions">
            <span class="home-progress-percent">{{ Math.round(progressPercent) }} %</span>
            <button class="boost-trigger" type="button" @click="boostDialog?.showModal()">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
                stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
                <path d="m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Z"/>
              </svg>
              Boosts
            </button>
          </div>
        </div>
        <div class="home-xp-track" role="progressbar" :aria-label="`Progression du niveau ${level}`"
          :aria-valuenow="Math.round(progressPercent)" aria-valuemin="0" aria-valuemax="100">
          <span class="home-xp-fill" :style="{width: `${progressPercent}%`}"></span>
        </div>
        <div class="home-xp-summary"><span>Vers le niveau {{ level + 1 }}</span><strong>{{ xpLabel }}</strong></div>
        <dialog ref="boostDialog" class="boost-dialog" aria-label="Sources du gain par clic">
          <h2>Gain par clic</h2><dl>
            <dt>Base au niveau actuel</dt><dd>{{formatMoney(getClickValue(game.purchasedUpgrades))}}</dd>
            <dt>Fame Shop</dt><dd>+{{numberFormatter.format(clickBoosts.shopBps / 100)}} %</dd>
            <dt>Collections V3 + Musée</dt><dd>+{{numberFormatter.format(clickBoosts.collectionBps / 100)}} %</dd>
            <dt>Prestige absolu</dt><dd>+{{numberFormatter.format((clickBoosts.totalBps-clickBoosts.shopBps-clickBoosts.collectionBps)/100)}} %</dd>
            <dt>Total par clic</dt><dd>{{formatMoney(clickValue)}}</dd>
          </dl><button type="button" @click="boostDialog?.close()">Fermer</button>
        </dialog>
        <div class="home-upgrade-list">
          <div class="home-upgrade-row" aria-label="Amélioration du clic">
            <span class="home-upgrade-symbol home-upgrade-click-symbol" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
                stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="m5 3 14 10-7 1-3 7-4-18Z"/><path d="m12 14 3 6"/>
              </svg>
            </span>
            <div class="home-upgrade-info">
              <strong>Revenu par clic <span class="tap-reward">{{ formatMoney(clickValue) }}</span></strong>
              <small>Niv. {{ game.purchasedUpgrades }} / {{ MAX_CLICK_LEVEL }}
                <template v-if="nextUpgrade"> · → <span class="home-upgrade-increment">{{ formatMoney(nextGain) }}</span></template>
                <template v-else> · Niveau maximal</template>
              </small>
              <small v-if="clickMaxNotice" class="home-click-max-notice" role="status">{{ clickMaxNotice }}</small>
            </div>
            <div class="home-click-actions">
              <button class="upgrade-button home-upgrade-buy" type="button" :disabled="loadBlocked || !upgradeAffordable"
                aria-label="Acheter un niveau de clic" @click="buy">
                <span>{{ !nextUpgrade ? 'TERMINÉ' : !upgradeUnlocked ? 'Niv. ' + nextUpgrade.requiredLevel : '+1' }}</span>
                <strong v-if="nextUpgrade">{{ formatCompactUnits(BigInt(nextUpgrade.price)*100n) }}</strong>
              </button>
              <button class="home-click-max" type="button" :disabled="loadBlocked || !clickMaxQuote"
                :title="clickMaxQuote ? '+' + clickMaxQuote.levelsBought + ' niveaux pour ' + formatCompactUnits(clickMaxQuote.costCents,2,'$') : 'Aucun niveau achetable'"
                aria-label="Acheter le maximum de niveaux de clic" @click="buyClickMax">
                <span>MAX</span><strong v-if="clickMaxQuote">+{{ clickMaxQuote.levelsBought }}</strong>
              </button>
            </div>
          </div>
          <div class="home-upgrade-row" aria-label="Amélioration Auto Click">
            <span class="home-upgrade-symbol home-upgrade-auto-symbol" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
                stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="m13 2-9 12h7l-1 8 10-13h-7V2Z"/>
              </svg>
            </span>
            <div class="home-upgrade-info">
              <strong>Auto Click <span class="home-auto-rate">{{ autoClickLevel }} /s</span></strong>
              <small>Niv. {{ autoClickLevel }} / {{ DOLLAR_AUTOCLICK_MAX_LEVEL }}
                <template v-if="autoClickCost !== null"> · +1 clic/s</template>
                <template v-else> · MAX</template>
              </small>
            </div>
            <button class="upgrade-button home-upgrade-buy home-auto-buy" type="button"
              :disabled="loadBlocked || !autoClickAffordable" @click="buyAutoClick">
              <span>{{ autoClickCost === null ? 'MAX' : 'Améliorer' }}</span>
              <strong v-if="autoClickCost !== null">{{ formatCompactUnits(autoClickCost) }}</strong>
            </button>
          </div>
        </div>
        <div class="home-auto-footnote" aria-live="polite">
          <span><span class="home-online-dot" aria-hidden="true"></span> Automatique en ligne et hors ligne</span>
          <small v-if="missingAutoClickCash !== null && missingAutoClickCash > 0n">Manque {{ formatCompactUnits(missingAutoClickCash) }}</small>
        </div>
      </section>
      <button
        class="tap-zone"
        type="button"
        :aria-label="`Gagner ${formatMoney(clickValue)} en cliquant`"
        @click="click"
      >
        <span class="tap-content">
          <span class="banknotes" aria-hidden="true"><i :key="tapAnimationId" class="bundle-shadow" :class="{pulsing:tapAnimationId>0}"></i></span>
        </span>
        <span
          v-for="gain in floatingGains"
          :key="gain.id"
          class="floating-gain"
          :style="{ left: `${gain.x}%`, top: `${gain.y}%` }"
          aria-hidden="true"
          @animationend="removeFloatingGain(gain.id)"
        >+{{ formatMoney(gain.amount) }}</span>
      </button>

    </main>

    <AchievementsScreen v-if="showMainPage('achievements')" :style="mainPageStyle('achievements')" :state="capital"
      :claim-rewards="claimAchievementRewards" @back="returnHomeFromAchievements" />
    <FameShopScreen v-if="page === 'fame'" :state="capital" :exact-state="exact"
      :purchase-boost="executeFamePurchase" :purchase-boost-max="executeFameMaxPurchase"
      :purchase-v4="executeFameV4Purchase" :purchase-v4-max="executeFameV4MaxPurchase"
      @back="returnHomeFromFame" />
    <PrestigeScreen :exact="exact" v-if="page === 'prestige'" :state="capital" :focus-transcendent-on-mount="focusTranscendentReturn"
      :purchase-upgrade="executePrestigePurchase" :purchase-upgrade-max="executePrestigeMaxPurchase" :perform-cycle="executePrestigeCycle"
      :select-speed="executeMarketSpeed" :activate-frenzy="executeMarketFrenzy"
      @back="returnHomeFromPrestige" @open-transcendent="openTranscendentShop" />
    <TranscendentShopScreen v-if="page === 'transcendent'" :exact="exact"
      :purchase-branch="executeTranscendentPurchase" :purchase-branch-max="executeTranscendentMaxPurchase" :state="capital" @back="returnToPrestige" />
    <TradingScreen :purchase-news="purchaseNews" v-show="showMainPage('trading')" :style="mainPageStyle('trading')" :state="capital"
      :execute-trade="executeTrade" :execute-staking="executeStaking"
      :exact-state="exact" :execute-exact-trade="executeExactTrade" :execute-exact-staking="executeExactStaking"
      :set-auto-sell-rule="changeNewsAutoSellRule"
      :set-fame-v4-stop="changeFameV4Stop" :set-fame-v4-target="changeFameV4Target" />
    <EnterpriseScreen v-show="showMainPage('enterprises')" :style="mainPageStyle('enterprises')"
      :state="capital" :exact-state="exact" :execute-enterprise="executeEnterprise"
      :execute-enterprise-max="executeEnterpriseMax" :execute-fame-v4-enterprise="executeFameV4Enterprise" />
    <CollectionScreen v-if="showMainPage('collection')" :style="mainPageStyle('collection')" :state="exact" :purchase-collection="executeCollectionPurchase" :purchase-collection-max="executeCollectionMaxPurchase" />
    <StatsScreen v-show="showMainPage('stats')" :style="mainPageStyle('stats')" :state="capital" :exact-state="exact" :pay-taxes="payTaxes"
      :export-save="exportSave" :import-save="importSave" :reset-save="resetSave" />

    <nav class="bottom-nav" aria-label="Navigation principale">
      <button type="button" class="nav-home" :class="{ 'is-active': page === 'home' || page === 'fame' || page === 'prestige' || page === 'transcendent' }"
        :aria-current="page === 'home' ? 'page' : undefined" @click="navigateTo('home')">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />
        </svg>
        <span>Accueil</span>
      </button>
      <button type="button" class="nav-home" :class="{ 'is-active': page === 'trading' }"
        :aria-current="page === 'trading' ? 'page' : undefined" @click="navigateTo('trading')">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3 17l6-6 4 4 8-9M16 6h5v5" />
          <path d="M3 21h18" />
        </svg>
        <span>Trading</span>
      </button>
      <button type="button" class="nav-home" :class="{ 'is-active': page === 'enterprises' }"
        :aria-current="page === 'enterprises' ? 'page' : undefined" @click="navigateTo('enterprises')">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="3" y="10" width="18" height="11" rx="1" />
          <path d="M3 10 6 4h12l3 6M9 21v-7h6v7M3 10h18" />
        </svg>
        <span>Entreprises</span>
      </button>
      <button type="button" class="nav-home" :class="{ 'is-active': page === 'collection' }"
        :aria-current="page === 'collection' ? 'page' : undefined" @click="navigateTo('collection')">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
          stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m3 8 9-5 9 5-9 5-9-5zM3 8v9l9 5 9-5V8M12 13v9" />
        </svg>
        <span>Collection</span>
      </button>
      <button ref="achievementsLaunch" type="button" class="nav-home achievements-launch"
        :class="{ 'is-active': page === 'achievements' }"
        :aria-current="page === 'achievements' ? 'page' : undefined"
        :aria-label="'Ouvrir les Achievements' + (claimableAchievements ? ' · ' + claimableAchievements + ' cadeaux disponibles' : '')"
        title="Achievements · Cadeaux en cash" @click="openAchievements">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="12" cy="8" r="5"/><path d="m8.3 11.3-1.1 9 4.8-2.9 4.8 2.9-1.1-9"/><path d="m10.2 8 1.1 1.1 2.5-2.5"/>
        </svg>
        <span class="nav-label">Succès</span>
        <span v-if="claimableAchievements" class="achievements-pending" aria-hidden="true">{{ claimableAchievements }}</span>
      </button>
      <button type="button" class="nav-home" :class="{ 'is-active': page === 'stats' }"
        :aria-current="page === 'stats' ? 'page' : undefined" @click="navigateTo('stats')">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3 3v18h18M7 15l4-4 3 2 5-6" />
        </svg>
        <span>Stats</span>
      </button>
      <button v-if="supportsFullscreen" class="nav-home nav-fullscreen" type="button"
        :title="isFullscreen ? 'Quitter le plein écran' : 'Plein écran'"
        :aria-label="isFullscreen ? 'Quitter le plein écran' : 'Activer le plein écran'"
        :aria-pressed="isFullscreen" @click="toggleFullscreen">
        <svg v-if="!isFullscreen" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true">
          <path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/>
        </svg>
        <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true">
          <path d="M3 8h5V3M21 8h-5V3M3 16h5v5M21 16h-5v5"/>
        </svg>
        <span class="nav-label">Plein écran</span>
      </button>
    </nav>
    <OfflineReportDialog v-if="offlineReport" :report="offlineReport" @close="dismissOfflineReport" />
  </div>
</template>
