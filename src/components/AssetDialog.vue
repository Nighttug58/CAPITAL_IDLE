<script setup lang="ts">
import MarketChart from './MarketChart.vue'
import { computed, ref, watch, onMounted } from 'vue'
import type { CapitalState } from '../capital.ts'
import { getAsset } from '../trading/catalog.ts'
import { getNewsPresentation } from '../trading/news.ts'
import { formatCash, formatChange, formatPrice, formatQuantity, formatRate } from '../trading/presentation.ts'
import { buyAsset, feeRate, getQuickQuantity, sellAsset } from '../trading/trades.ts'
import type { TradeResult, TradeSide, TradeFraction } from '../trading/trades.ts'
import { parseTradeQuantity, formatEditableQuantity } from '../trading/order-ui.ts'

const props = defineProps<{
  state: CapitalState
  assetId: string
  executeTrade: (side: TradeSide, assetId: string, quantity: number) => TradeResult
}>()
const emit = defineEmits<{
  close: []
  'open-news': [id: string]
}>()
const asset = computed(() => getAsset(props.assetId)!)
const quote = computed(() => props.state.trading.quotes[props.assetId])
const currentPrice = computed(() => quote.value?.price ?? asset.value.referencePrice)
const position = computed(() => props.state.trading.positions[props.assetId])
const owned = computed(() => position.value?.quantity ?? 0)
const samples = computed(() => props.state.trading.history[props.assetId] ?? [])
const firstPrice = computed(() => samples.value[0]?.price)
const change = computed(() => firstPrice.value ? (currentPrice.value / firstPrice.value - 1) * 100 : null)
const news = computed(() => props.state.trading.news.filter(n => n.affectedAssetIds.includes(props.assetId)))
const average = computed(() => position.value && owned.value > 0 ? position.value.costBasis / owned.value : undefined)
const rate = computed(() => quote.value?.dividendYield ?? asset.value.initialDividendYield)
const relatedNews = computed(() => props.state.trading.news.filter(event => event.affectedAssetIds.includes(props.assetId)).slice(-4).reverse())
const balance = computed(() => props.state.game.balance)
const activeSide = ref<TradeSide>('buy')
const quantityText = ref('')
const status = ref<{ message: string; success: boolean } | null>(null)
const dialogRoot = ref<HTMLElement | null>(null)

onMounted(() => dialogRoot.value?.focus())
watch(activeSide, () => { quantityText.value = ''; status.value = null })
const quantity = computed(() => parseTradeQuantity(quantityText.value))
const preview = computed(() => activeSide.value === 'buy'
  ? buyAsset(props.state, props.assetId, quantity.value)
  : sellAsset(props.state, props.assetId, quantity.value))
const ready = computed(() => preview.value.ok)
const estimate = computed(() => preview.value.ok ? preview.value.receipt : null)

const errors: Record<string, string> = {
  'unknown-asset': 'Actif introuvable.',
  'invalid-quantity': 'Saisissez une quantité valide, avec la bonne précision.',
  'invalid-price': 'Cours indisponible : transaction suspendue.',
  'insufficient-funds': 'Solde insuffisant, frais compris.',
  'insufficient-supply': 'Quantité supérieure à l’offre restante.',
  'insufficient-holdings': 'Vous ne détenez pas autant d’unités.',
  'staked-holdings': 'Cette quantité est verrouillée en staking ou en retrait.',
  'amount-too-small': 'Ordre trop petit pour couvrir les arrondis et les frais.',
  'money-overflow': 'Montant trop élevé pour être calculé avec précision.',
}
function chooseFraction(fraction: TradeFraction) {
  const amount = getQuickQuantity(props.state, props.assetId, activeSide.value, fraction)
  quantityText.value = formatEditableQuantity(amount, asset.value.quantityDecimals)
  status.value = null
}
function submit() {
  status.value = null
  if (!ready.value) {
    status.value = { success: false, message: !preview.value.ok ? errors[preview.value.error] ?? 'Ordre refusé.' : 'Ordre refusé.' }
    return
  }
  const response = props.executeTrade(activeSide.value, props.assetId, quantity.value)
  if (!response.ok) {
    status.value = { success: false, message: errors[response.error] ?? 'La cotation a changé : recommencez.' }
    return
  }
  status.value = {
    success: true,
    message: `${activeSide.value === 'buy' ? 'Achat confirmé' : 'Vente confirmée'} · ${formatQuantity(response.receipt.quantity)} ${asset.value.symbol} · frais ${formatCash(response.receipt.fee)}${response.receipt.taxAccrued > 0 ? ` · taxe différée ${formatCash(response.receipt.taxAccrued)}` : ''}`,
  }
  quantityText.value = ''
}
</script>

<template>
  <section ref="dialogRoot" class="trading-modal trading-asset-modal" role="dialog" aria-modal="true" :aria-label="'Trader ' + asset.name" tabindex="-1">
    <div class="trading-modal-header">
      <div class="modal-title-group">
        <span class="eyebrow">{{ asset.kind === 'stock' ? 'ACTION' : asset.kind === 'memecoin' ? 'MEMECOIN' : 'CRYPTOMONNAIE' }} · {{ asset.symbol }}</span>
        <h2>{{ asset.name }}</h2>
      </div>
      <button type="button" class="modal-close" aria-label="Fermer le détail" @click="emit('close')">×</button>
    </div>
    <div class="trading-modal-scroll">
      <div class="asset-detail-quote">
        <strong>{{ formatPrice(currentPrice) }}</strong>
        <span :class="change === null ? 'market-direction-flat' : change >= 0 ? 'market-direction-up' : 'market-direction-down'">{{ formatChange(change) }} · 1 h</span>
      </div>
      <div v-if="asset.kind === 'stock'" class="yield-summary">Dividende annuel · {{ formatRate(rate ?? 0) }}

      </div>
      <MarketChart :samples="samples" :news="news" :average="average" @open-news="emit('open-news',$event)" />
      <div class="asset-order">
        <div class="order-side">
          <button type="button" :class="{ 'is-buy': activeSide === 'buy' }" :aria-pressed="activeSide === 'buy'" @click="activeSide = 'buy'">Acheter</button>
          <button type="button" :class="{ 'is-sell': activeSide === 'sell' }" :aria-pressed="activeSide === 'sell'" @click="activeSide = 'sell'">Vendre</button>
        </div>
        <div class="order-hint">
          <span>{{ activeSide === 'buy' ? 'Votre solde' : 'En portefeuille' }}</span>
          <strong>{{ activeSide === 'buy' ? formatCash(balance) : formatQuantity(owned) + ' ' + asset.symbol }}</strong>
        </div>
        <label class="order-quantity-label" for="order-quantity">Quantité à {{ activeSide === 'buy' ? 'acheter' : 'vendre' }}</label>
        <input
          id="order-quantity" v-model="quantityText" type="text" inputmode="decimal"
          autocomplete="off" class="order-input" placeholder="0" aria-describedby="order-precision"
          @input="status = null"
        />
        <div id="order-precision" class="order-precision">Précision autorisée : {{ asset.quantityDecimals }} décimales</div>
        <div class="order-fractions">
          <button v-for="fraction in ([0.25, 0.5, 1] as const)" :key="fraction" type="button" @click="chooseFraction(fraction)">
            {{ fraction === 1 ? 'MAX' : fraction === 0.5 ? '50 %' : '25 %' }}
          </button>
        </div>
        <div class="order-calculation">
          <span>Frais ({{ formatRate(feeRate(asset.kind)) }})</span><strong>{{ estimate ? formatCash(estimate.fee) : '—' }}</strong>
          <span>{{ activeSide === 'buy' ? 'Total à payer' : 'Montant à recevoir' }}</span>
          <strong>{{ estimate ? formatCash(Math.abs(estimate.cashChange)) : '—' }}</strong>
          <template v-if="activeSide === 'sell' && estimate">
            <span>Plus-value nette réalisée</span><strong>{{ formatCash(estimate.netRealizedProfit) }}</strong>
            <span>Taxe différée (due sous 72 h max.)</span><strong>{{ formatCash(estimate.taxAccrued) }}</strong>
          </template>
        </div>
        <p v-if="quantityText.trim() && !ready && !status && !preview.ok"
          class="order-error" role="alert">{{ errors[preview.error] ?? 'Ordre invalide.' }}</p>
        <p v-if="status" :class="status.success ? 'order-success' : 'order-error'" role="status">{{ status.message }}</p>
        <button class="order-submit" type="button" :disabled="!ready"
          @click="submit">
          {{ activeSide === 'buy' ? 'Confirmer l’achat' : 'Confirmer la vente' }}
        </button>
      </div>
      <details><summary>Détails du marché et actualités</summary>
      <div class="asset-detail-grid">
        <div><span>Prix minimum</span><strong>{{ formatPrice(asset.minPrice) }}</strong></div>
        <div><span>Prix maximum</span><strong>{{ formatPrice(asset.maxPrice) }}</strong></div>
        <div><span>Vous détenez</span><strong>{{ formatQuantity(owned) }}</strong></div>
      </div>
      <div v-if="relatedNews.length" class="asset-news-related">
        <span class="eyebrow">NEWS ASSOCIÉES</span>
        <button v-for="entry in relatedNews" :key="entry.id" type="button" @click="emit('open-news', entry.id)">
          {{ getNewsPresentation(entry)?.headline ?? 'Actualité du marché' }} <span>›</span>
        </button>
      </div>
      </details>
    </div>
  </section>
</template>

<style scoped>
.trading-asset-modal{height:auto;max-height:min(690px,100%)}
.trading-asset-modal .trading-modal-scroll{flex:1 1 auto;padding:10px}
.asset-detail-quote{margin-bottom:3px}.yield-summary{margin-bottom:5px}
.yield-summary,summary{font-size:12px}summary{cursor:pointer}
</style>
