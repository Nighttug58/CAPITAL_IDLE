<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import type { CapitalState } from '../capital.ts'
import { getAsset } from '../trading/catalog.ts'
import type { TradeResult, TradeSide } from '../trading/trades.ts'
import { formatCash } from '../trading/presentation.ts'
import AssetList from './AssetList.vue'
import PortfolioPanel from './PortfolioPanel.vue'
import NewsPreview from './NewsPreview.vue'
import AssetDialog from './AssetDialog.vue'
import NewsDialog from './NewsDialog.vue'

const props = defineProps<{
  state: CapitalState
  executeTrade: (side: TradeSide, assetId: string, quantity: number) => TradeResult
}>()
type Tab = 'portfolio' | 'stocks' | 'crypto' | 'news'
const activeTab = ref<Tab>('portfolio')
const selectedAssetId = ref<string | null>(null)
const selectedNewsId = ref<string | null>(null)
const tabs: { key: Tab; label: string }[] = [
  { key: 'portfolio', label: 'Portfolio' },
  { key: 'stocks', label: 'Actions' },
  { key: 'crypto', label: 'Crypto' },
  { key: 'news', label: 'News' },
]
const activeNews = computed(() => props.state.trading.news.find(e => e.id === selectedNewsId.value) ?? null)
const hasDialog = computed(() => selectedAssetId.value !== null || selectedNewsId.value !== null)
let historyEntry = false

function ensureHistoryEntry() {
  if (historyEntry) return
  window.history.pushState({ ...window.history.state, capitalIdleDialog: true }, '', window.location.href)
  historyEntry = true
}
function openAsset(id: string) {
  const asset = getAsset(id)
  if (!asset) return
  ensureHistoryEntry()
  selectedNewsId.value = null
  selectedAssetId.value = asset.id
}
function openNews(id: string) {
  if (!props.state.trading.news.some(e => e.id === id)) return
  ensureHistoryEntry()
  selectedAssetId.value = null
  selectedNewsId.value = id
}
function closeDialog() {
  selectedAssetId.value = null
  selectedNewsId.value = null
  if (historyEntry) {
    historyEntry = false
    window.history.back()
  }
}
function onPopState() {
  selectedAssetId.value = null
  selectedNewsId.value = null
  historyEntry = false
}
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && hasDialog.value) {
    event.preventDefault()
    closeDialog()
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
      <div class="trading-wallet"><span>SOLDE DISPONIBLE</span><strong>{{ formatCash(state.game.balance) }}</strong></div>
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
      <PortfolioPanel v-if="activeTab === 'portfolio'" :state="state" @open-asset="openAsset" />
      <AssetList v-else-if="activeTab === 'stocks'" kind="stock" :quotes="state.trading.quotes" :history="state.trading.history" @open-asset="openAsset" />
      <AssetList v-else-if="activeTab === 'crypto'" kind="crypto" :quotes="state.trading.quotes" :history="state.trading.history" @open-asset="openAsset" />
      <NewsPreview v-else :news="state.trading.news" :now="state.trading.dividendLastPaidAt" @open-news="openNews" />
    </section>
    <p v-if="activeTab === 'stocks' || activeTab === 'crypto'" class="trading-disclaimer">
      Touchez un actif pour consulter ses détails et trader
    </p>
    <div v-if="hasDialog" class="trading-modal-backdrop" @click.self="closeDialog">
      <AssetDialog
        v-if="selectedAssetId" :key="selectedAssetId" :state="state" :asset-id="selectedAssetId"
        :execute-trade="executeTrade" @close="closeDialog" @open-news="openNews"
      />
      <NewsDialog
        v-else-if="activeNews" :key="activeNews.id" :event="activeNews" :now="state.trading.dividendLastPaidAt"
        @close="closeDialog" @open-asset="openAsset"
      />
    </div>
  </main>
</template>
