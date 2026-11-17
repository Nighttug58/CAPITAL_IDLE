<script setup lang="ts">
import { computed, ref, nextTick, onMounted, onUnmounted, watch } from 'vue'
import type { CapitalState } from '../capital.ts'
import type { MarketNews } from '../trading/types.ts'
import { getAsset } from '../trading/catalog.ts'
import type { TradeResult, TradeSide } from '../trading/trades.ts'
import type { V8CapitalState } from '../exact-state-v8.ts'
import type { V8TradeResult } from '../exact-runtime-v8.ts'
import type { V8StakingResult } from '../exact-staking-v8.ts'
import type { StakingResult } from '../trading/staking.ts'
import { formatCash } from '../trading/presentation.ts'
import {formatCompactUnits} from '../large-numbers.ts'
import {getExactAmount as v} from '../exact-state-v8.ts'
import { marketNewsEffects, peekUpcomingNews, volatilityRadar } from '../ascension/market-effects.ts'
import {newsPowerCost} from '../news-powers.ts'
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
  if(cost<=0n || BigInt(state.game.balance)<cost){notice.value='Cash disponible insuffisant.';return}

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
    <div class="trading-hero">
      <div><span class="eyebrow">CAPITAL · MARCHÉS</span><strong>Trading</strong><span class="trading-hero-note">Marché fictif · évolution en direct</span></div>
      <div class="trading-wallet"><span>SOLDE DISPONIBLE</span><strong>{{ displayWallet }}</strong></div>
    </div>
    <div v-if="radar.length" class="trading-radar" aria-label="Radar de volatilité">
      <strong>RADAR VOLATILITÉ</strong>
      <span v-for="item in radar" :key="item.id">{{ item.symbol }} · {{ item.volatilityPercent.toFixed(2) }} %</span>
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
    <section id="trading-content" class="trading-stage">
      <PortfolioPanel v-if="activeTab === 'portfolio'" :state="state" :exact-state="exactState" @open-asset="openAsset" />
      <AssetList v-else-if="activeTab === 'stocks'" kind="stock" :quotes="state.trading.quotes" :history="state.trading.history" @open-asset="openAsset" />
      <AssetList v-else-if="activeTab === 'crypto'" kind="crypto" :quotes="state.trading.quotes" :history="state.trading.history" @open-asset="openAsset" />
      <StakingPanel v-else-if="activeTab === 'staking' && executeStaking"
        :state="state" :execute-staking="executeStaking"
        :exact-state="exactState" :execute-exact-staking="executeExactStaking" />
      <NewsPreview v-else :news="state.trading.news" :now="state.trading.dividendLastPaidAt"
        :upcoming="upcoming" @open-news="openNews">
        <button v-if="exactState && exactState.ascension.progress.prestigeCount>=3" type="button" class="order-submit" @click="$event.detail < 2 && activatePower(null)">Générer une news · 5 % du patrimoine · {{ powerPrices[0] }}</button>
        <small role="status">{{ notice }}</small>
      </NewsPreview>
    </section>
    <p v-if="activeTab === 'stocks' || activeTab === 'crypto'" class="trading-disclaimer">
      Touchez un actif pour consulter ses détails et trader
    </p>
    <div v-if="hasDialog" class="trading-modal-backdrop" @click.self="closeDialog">
      <AssetDialog
        v-if="selectedAssetId" :inert="!!activeNews" :key="selectedAssetId" :state="state" :asset-id="selectedAssetId"
        :execute-trade="executeTrade" :exact-state="exactState" :execute-exact-trade="executeExactTrade" @close="closeDialog" @open-news="openNews"
      />
      <div v-if="activeNews" :class="{'trading-modal-backdrop news-overlay': selectedAssetId}" class="news-layer" @click.self="closeDialog">
      <NewsDialog
        v-if="activeNews" :key="activeNews.id" :event="activeNews" :news="state.trading.news"
        :now="state.trading.dividendLastPaidAt" :impact-multiplier="newsFactors.impactMultiplier"
         :ramp-fraction="newsFactors.rampFraction" :duration-multiplier="newsFactors.durationMultiplier"
        @close="closeDialog" @open-asset="followNewsAsset">
        <button v-if="exactState && exactState.ascension.progress.prestigeCount>=3 && activeNews.endsAt>state.trading.dividendLastPaidAt && !activeNews.manuallyEnded" class="order-submit" @click="confirmEnd=true">Terminer cette news · 10 % du patrimoine · {{ powerPrices[1] }}</button>
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
