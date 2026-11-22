<script setup lang="ts">
import { computed, ref, nextTick, onMounted, onUnmounted, watch } from 'vue'
import type { CapitalState } from '../capital.ts'
import type { MarketNews } from '../trading/types.ts'
import { getAsset } from '../trading/catalog.ts'
import type { TradeResult, TradeSide } from '../trading/trades.ts'
import type { V8CapitalState } from '../exact-state-v8.ts'
import type { V8TradeResult } from '../exact-runtime-v8.ts'
import type { NewsAutoSellTrigger } from '../trading/auto-sell-v8.ts'
import { fameV4Level } from '../trading/fame-v4-trading.ts'
import { getNewsDirection, getNewsPresentation } from '../trading/news.ts'
import type { V8StakingResult } from '../exact-staking-v8.ts'
import type { StakingResult } from '../trading/staking.ts'
import { formatCash, formatPrice } from '../trading/presentation.ts'
import {formatCompactUnits} from '../large-numbers.ts'
import {getExactAmount as v} from '../exact-state-v8.ts'
import { marketNewsEffects, peekUpcomingNews, volatilityRadar } from '../ascension/market-effects.ts'
import {newsPowerCost} from '../news-powers.ts'
import {v4SpendableCents} from '../prestige/fame-v4-tax.ts'
import {v8MarketNewsEffects} from '../exact-market-v8.ts'
import AssetList from './AssetList.vue'
import PortfolioPanel from './PortfolioPanel.vue'
import NewsPreview from './NewsPreview.vue'
import AssetDialog from './AssetDialog.vue'
import NewsDialog from './NewsDialog.vue'
import StakingPanel from './StakingPanel.vue'

const props = defineProps<{
  state: CapitalState
  purchaseNews?: (id:string|null,count:number,cost:bigint)=>boolean
  exactState?: V8CapitalState
  executeExactTrade?: (side: TradeSide, assetId: string, quantity: string) => V8TradeResult
  setAutoSellRule?: (assetId:string,trigger:NewsAutoSellTrigger,enabled:boolean)=>boolean
  setFameV4Stop?: (assetId:string,enabled:boolean,drawdownPct:number)=>boolean
  setFameV4Target?: (assetId:string,slot:number,gainPct:number|null,portionPct:number)=>boolean
  executeExactStaking?: (action: 'deposit' | 'withdraw', assetId: string, quantity: string) => V8StakingResult
  executeTrade: (side: TradeSide, assetId: string, quantity: number) => TradeResult
  executeStaking?: (action: 'deposit' | 'withdraw', assetId: string, quantity: number) => StakingResult
}>()
type Tab = 'portfolio' | 'stocks' | 'crypto' | 'news' | 'staking'
const activeTab = ref<Tab>('portfolio')
const notice=ref('')
function activatePower(id:string|null){
  const state=props.exactState
  if(!state || !props.purchaseNews)return
  const cost=newsPowerCost(state,id!==null)
  const count=state.newsPowers?.count??0
  if(cost<=0n || v4SpendableCents(state)<cost){notice.value='Cash disponible insuffisant.';return}

  notice.value=props.purchaseNews(id,count,cost)?'Achat enregistré.':'Achat refusé. Vérifie le prix et le cash disponible.'
}
const powerPrices=computed(()=>activeTab.value==='news'||selectedNewsId.value ? props.exactState ?
  [false,true].map(end=>formatCompactUnits(newsPowerCost(props.exactState!,end),2,'$')) : [] : [])
const displayWallet=computed(()=>props.exactState
  ?formatCompactUnits(v(props.exactState.game.balance),2,'$')
  :formatCash(props.state.game.balance))
const selectedAssetId = ref<string | null>(null)
const selectedNewsId = ref<string | null>(null)
const selectedNewsSnapshot = ref<MarketNews | null>(null)
const tabs = computed<{ key: Tab; label: string }[]>(() => [
  { key: 'portfolio', label: 'Portfolio' },
  { key: 'stocks', label: 'Actions' },
  { key: 'crypto', label: 'Crypto' },
  { key: 'news', label: 'News' },
  ...(props.executeStaking && props.state.ascension.progress.upgradeLevels['crypto-staking'] > 0
    ? [{ key: 'staking' as const, label: 'Staking' }] : []),
])
const activeNews = computed(() => props.state.trading.news.find(e => e.id === selectedNewsId.value) ?? selectedNewsSnapshot.value)
watch(() => props.state.ascension.progress.upgradeLevels['crypto-staking'], level => {
  if (level === 0 && activeTab.value === 'staking') activeTab.value = 'portfolio'
})
const upcoming = computed(() => peekUpcomingNews(props.state, props.state.trading.dividendLastPaidAt))
const newsFactors = computed(() => props.exactState
  ? v8MarketNewsEffects(props.exactState, props.state.trading.dividendLastPaidAt)
  : marketNewsEffects(props.state, props.state.trading.dividendLastPaidAt))
const radar = computed(() => volatilityRadar(props.state).slice(0, 3))
const fameNewsRank=computed(()=>props.exactState?fameV4Level(props.exactState,4):0)
const fameJournalRank=computed(()=>props.exactState?fameV4Level(props.exactState,6):0)
const activeMarketNews=computed(()=>props.state.trading.news.filter(x=>
  x.startedAt<=props.state.trading.dividendLastPaidAt && x.endsAt>props.state.trading.dividendLastPaidAt))
const heldNews=computed(()=>activeMarketNews.value.filter(event=>
  event.affectedAssetIds.some(id=>!!props.exactState?.trading.positions[id])))
const newsPressure=computed(()=>heldNews.value.reduce((sum,x)=>sum+x.impact,0))
const newsJournal=computed(()=>[...(props.exactState?.trading.fameV4Trading?.newsLog??[])].reverse())
function earliestAssetGain(log:{startPrices:Record<string,number>;endPrices?:Record<string,number>}):string{
 const id=Object.keys(log.startPrices)[0]
 if(!id||!log.endPrices)return 'en cours'
 const start=log.startPrices[id],end=log.endPrices[id]
 if(!start||!end)return 'données insuffisantes'
 const pct=(end/start-1)*100
 return (pct>=0?'+':'')+pct.toFixed(2)+' %'
}
function eventRemain(endsAt:number):string{
 const seconds=Math.max(0,Math.ceil((endsAt-props.state.trading.dividendLastPaidAt)/1000))
 return seconds>=60?Math.floor(seconds/60)+' min '+(seconds%60)+' s':seconds+' s'
}
const confirmEnd=ref(false)
watch(selectedNewsId,()=>{confirmEnd.value=false;notice.value=''})
const hasDialog = computed(() => selectedAssetId.value !== null || selectedNewsId.value !== null)
let historyEntry = false
let overlayOrigin: Element | null = null
let returnFocus: HTMLElement | null = null
function captureFocus() {
  if (!hasDialog.value && document.activeElement instanceof HTMLElement) returnFocus = document.activeElement
}
function restoreFocus() {
  void nextTick(() => { if (returnFocus?.isConnected) returnFocus.focus() })
}

function ensureHistoryEntry() {
  if (historyEntry) return
  window.history.pushState({ ...window.history.state, capitalIdleDialog: true }, '', window.location.href)
  historyEntry = true
}
function openAsset(id: string) {
  const asset = getAsset(id)
  if (!asset) return
  captureFocus()
  ensureHistoryEntry()
  selectedNewsId.value = null
  selectedNewsSnapshot.value = null
  selectedAssetId.value = asset.id
}
function openNews(id: string) {
  const chosen = props.state.trading.news.find(e => e.id === id)
  if (!chosen) return
  captureFocus()
  ensureHistoryEntry()
  if (selectedAssetId.value) {
    overlayOrigin = document.activeElement
    window.history.pushState({ ...window.history.state, assetNews: true }, '')
  }
  selectedNewsSnapshot.value = chosen
  selectedNewsId.value = id
}
let pendingAsset: string | null = null
function followNewsAsset(id: string) {
  if (!selectedAssetId.value) { openAsset(id); return }
  pendingAsset = id
  closeDialog()
}
function dismissOverlay() {
  const id = selectedNewsId.value
  selectedNewsId.value = null
  selectedNewsSnapshot.value = null
  void nextTick(() => {
    if (pendingAsset) { openAsset(pendingAsset); pendingAsset = null; return }
    const pin = Array.from(document.querySelectorAll<SVGElement>('.news-pin')).find(el => el.dataset.newsId === id)
    const target = pin ?? overlayOrigin
    if (target instanceof HTMLElement || target instanceof SVGElement) target.focus({preventScroll:true})
  })
}
function closeDialog() {
  if (selectedAssetId.value && selectedNewsId.value) {
    window.history.back()
    return
  }
  selectedAssetId.value = null
  selectedNewsId.value = null
  selectedNewsSnapshot.value = null
  restoreFocus()
  if (historyEntry) {
    historyEntry = false
    window.history.back()
  }
}
function onPopState() {
  if (selectedAssetId.value && selectedNewsId.value) { dismissOverlay(); return }
  selectedAssetId.value = null
  selectedNewsId.value = null
  selectedNewsSnapshot.value = null
  historyEntry = false
  restoreFocus()
}
function onKeydown(event: KeyboardEvent) {
  if (!hasDialog.value) return
  if (event.key === 'Escape') {
    event.preventDefault()
    closeDialog()
    return
  }
  if (event.key !== 'Tab') return
  const root = document.querySelector<HTMLElement>(selectedNewsId.value ? '.trading-news-modal' : '.trading-asset-modal')
  if (!root) return
  const buttons = Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])'))
  if (!buttons.length) return
  const first = buttons[0]!, last = buttons[buttons.length - 1]!
  if (event.shiftKey && (document.activeElement === root || document.activeElement === first || !root.contains(document.activeElement))) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (document.activeElement === root || document.activeElement === last || !root.contains(document.activeElement))) {
    event.preventDefault()
    first.focus()
  }
}
onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('popstate', onPopState)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('popstate', onPopState)
  // L'application masque Trading plutôt que de détruire le composant au changement d'onglet.
})
</script>

<template>
  <main id="trading" class="trading-screen" aria-label="Marchés Trading">
    <div class="trading-scroll-content">
    <div class="trading-hero">
      <div><span class="eyebrow">CAPITAL · MARCHÉS</span><strong>Trading</strong><span class="trading-hero-note">Marché fictif · évolution en direct</span></div>
      <div class="trading-wallet"><span>SOLDE DISPONIBLE</span><strong>{{ displayWallet }}</strong></div>
    </div>
    <div v-if="radar.length" class="trading-radar" aria-label="Radar de volatilité">
      <strong>RADAR VOLATILITÉ</strong>
      <span v-for="item in radar" :key="item.id">{{ item.symbol }} · {{ item.volatilityPercent.toFixed(2) }} %</span>
    </div>
    <section v-if="fameNewsRank>0" class="fame-trading-radar" aria-label="Radar des news Fame V4">
      <strong>RADAR DES NEWS · {{ fameNewsRank }}/5</strong>
      <span>Nouvelles actives concernant vos positions : {{ heldNews.length }}</span>
      <span v-if="fameNewsRank>=2 && heldNews.length">Prochaine expiration observée : {{ eventRemain(Math.min(...heldNews.map(x=>x.endsAt))) }}</span>
      <span v-if="fameNewsRank>=3">Signaux actifs : {{ heldNews.filter(x=>getNewsDirection(x)==='bullish').length }} verts · {{ heldNews.filter(x=>getNewsDirection(x)==='bearish').length }} rouges</span>
      <span v-if="fameNewsRank>=4">Pression cumulée observée : {{ newsPressure.toFixed(2) }}</span>
      <span v-if="fameNewsRank>=5">Fenêtre de news habituelle : 5–10 minutes · estimation uniquement, sans résultat révélé</span>
    </section>
    <section id="trading-content" class="trading-stage">
      <PortfolioPanel v-if="activeTab === 'portfolio'" :state="state" :exact-state="exactState" @open-asset="openAsset" />
      <AssetList v-else-if="activeTab === 'stocks'" kind="stock" :quotes="state.trading.quotes" :history="state.trading.history" @open-asset="openAsset" />
      <AssetList v-else-if="activeTab === 'crypto'" kind="crypto" :quotes="state.trading.quotes" :history="state.trading.history" @open-asset="openAsset" />
      <StakingPanel v-else-if="activeTab === 'staking' && executeStaking"
        :state="state" :execute-staking="executeStaking"
        :exact-state="exactState" :execute-exact-staking="executeExactStaking" />
      <NewsPreview v-else :news="state.trading.news" :now="state.trading.dividendLastPaidAt"
        :upcoming="upcoming" @open-news="openNews">
        <button v-if="exactState" type="button" class="order-submit" @click="$event.detail < 2 && activatePower(null)">Générer une news · 5 % du patrimoine · {{ powerPrices[0] }}</button>
        <small role="status">{{ notice }}</small>
      </NewsPreview>
      <section v-if="activeTab==='news' && fameJournalRank>0" class="fame-news-journal" aria-label="Réseau d'informateurs">
        <h3>Réseau d’informateurs · journal de news observées</h3>
        <small>100 dernières news enregistrées après déblocage, sans reconstitution du passé.</small>
        <p v-if="!newsJournal.length">Aucune news enregistrée depuis l'activation du pouvoir.</p>
        <details v-for="entry in newsJournal" :key="entry.id" class="fame-news-record">
          <summary>{{ getNewsPresentation({id:entry.id,templateId:entry.templateId,
            startedAt:entry.startedAt,endsAt:entry.endsAt,affectedAssetIds:Object.keys(entry.startPrices),
            impact:0,phase:'active'})?.headline??entry.templateId }}
            · {{ earliestAssetGain(entry) }}
          </summary>
          <small>Détectée : {{ new Date(entry.recordedAt).toLocaleString('fr-CH') }} · {{ entry.direction==='bullish'?'Hausse':entry.direction==='bearish'?'Baisse':'Neutre' }}</small>
          <div v-for="(price,id) in entry.startPrices" :key="id">
            {{ getAsset(String(id))?.symbol??id }} : {{ formatPrice(price) }} →
            {{ entry.endPrices?.[id]!==undefined?formatPrice(entry.endPrices[id]):'en cours' }}
          </div>
        </details>
      </section>
    </section>
    <p v-if="activeTab === 'stocks' || activeTab === 'crypto'" class="trading-disclaimer">
      Touchez un actif pour consulter ses détails et trader
    </p>
    </div>
    <div class="trading-tabs" aria-label="Rubriques Trading">
      <button
        v-for="tab in tabs" :key="tab.key" type="button" class="trading-tab"
        :class="{ 'is-selected': activeTab === tab.key }"
        :aria-pressed="activeTab === tab.key"
        aria-controls="trading-content"
        @click="activeTab = tab.key"
      >{{ tab.label }}</button>
    </div>
    <div v-if="hasDialog" class="trading-modal-backdrop" @click.self="closeDialog">
      <AssetDialog
        v-if="selectedAssetId" :inert="!!activeNews" :key="selectedAssetId" :state="state" :asset-id="selectedAssetId"
        :execute-trade="executeTrade" :exact-state="exactState" :execute-exact-trade="executeExactTrade"
        :set-auto-sell-rule="setAutoSellRule" :set-fame-v4-stop="setFameV4Stop"
        :set-fame-v4-target="setFameV4Target" @close="closeDialog" @open-news="openNews"
      />
      <div v-if="activeNews" :class="{'trading-modal-backdrop news-overlay': selectedAssetId}" class="news-layer" @click.self="closeDialog">
      <NewsDialog
        v-if="activeNews" :key="activeNews.id" :event="activeNews" :news="state.trading.news"
        :now="state.trading.dividendLastPaidAt" :impact-multiplier="newsFactors.impactMultiplier"
         :ramp-fraction="newsFactors.rampFraction" :duration-multiplier="newsFactors.durationMultiplier"
        @close="closeDialog" @open-asset="followNewsAsset">
        <button v-if="exactState && activeNews.endsAt>state.trading.dividendLastPaidAt && !activeNews.manuallyEnded" class="order-submit" @click="confirmEnd=true">Terminer cette news · 10 % du patrimoine · {{ powerPrices[1] }}</button>
        <div v-if="confirmEnd && activeNews.endsAt>state.trading.dividendLastPaidAt && !activeNews.manuallyEnded">
          <p>Arrêter son effet pour {{ powerPrices[1] }} en cash ?</p>
          <button type="button" @click="confirmEnd=false; activatePower(activeNews.id)">Confirmer la dépense</button>
          <button type="button" @click="confirmEnd=false">Annuler</button>
        </div>
        <small role="status">{{ notice }}</small>
      </NewsDialog></div>
    </div>
  </main>
</template>

<style scoped>
.fame-trading-radar {display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:5px 12px;margin:6px 0;padding:9px;border:1px solid rgba(85,143,195,.3);border-radius:9px;background:rgba(18,38,61,.75);font-size:11px;color:#bacfe4}
.fame-trading-radar strong {color:#e1f2ff;grid-column:1/-1;font-size:11px}
.fame-news-journal {margin-top:12px;padding:10px;border:1px solid rgba(96,150,195,.3);border-radius:9px;display:grid;gap:7px;color:#c6d8eb}
.fame-news-journal h3 {font-size:13px;margin:0;color:#e1f2ff}
.fame-news-journal small,.fame-news-journal p {font-size:10px;color:#9cb1c6;margin:0}
.fame-news-record {border:1px solid rgba(110,149,184,.25);padding:8px;border-radius:7px;font-size:11px}
.fame-news-record summary {cursor:pointer;line-height:1.4}
.fame-news-record>div {margin-top:5px;font-size:10px;overflow-wrap:anywhere}
</style>
