<script setup lang="ts">
import MarketChart from './MarketChart.vue'
import { computed, ref, watch, onMounted } from 'vue'
import type { CapitalState } from '../capital.ts'
import { getAsset } from '../trading/catalog.ts'
import { getNewsPresentation } from '../trading/news.ts'
import { formatCash, formatChange, formatPrice, formatQuantity, formatRate, withLiveQuote } from '../trading/presentation.ts'
import { buyAsset, feeRate, getQuickQuantity, sellAsset } from '../trading/trades.ts'
import type { TradeResult, TradeSide, TradeFraction } from '../trading/trades.ts'
import { parseTradeQuantity, formatEditableQuantity } from '../trading/order-ui.ts'
import type { V8CapitalState } from '../exact-state-v8.ts'
import { getExactAmount as v } from '../exact-state-v8.ts'
import { v8BuyTrade, v8SellTrade, v8MaximumBuyUnits, type V8TradeResult } from '../exact-runtime-v8.ts'
import { formatCompactUnits, formatDecimalUnits } from '../large-numbers.ts'
import { exactTradeCost, quoteToExactFraction } from '../exact-trading.ts'
import { liquidityQuote } from '../trading/liquidity-v8.ts'
import type { NewsAutoSellTrigger } from '../trading/auto-sell-v8.ts'

const props = defineProps<{
  state: CapitalState
  exactState?: V8CapitalState
  executeExactTrade?: (side: TradeSide, assetId: string, quantity: string) => V8TradeResult
  setAutoSellRule?: (assetId:string,trigger:NewsAutoSellTrigger,enabled:boolean)=>boolean
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
const samples = computed(() => withLiveQuote(
  props.state.trading.history[props.assetId] ?? [], quote.value,
))
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
const autoSellError=ref('')
const autoSellPreferences=computed(()=>props.exactState?.trading.autoSellRules?.[props.assetId])
function toggleAutoSell(trigger:NewsAutoSellTrigger){
  const enabled=!autoSellPreferences.value?.[trigger]
  autoSellError.value=props.setAutoSellRule?.(props.assetId,trigger,enabled)?'':'Réglage non enregistré : sauvegarde indisponible.'
}
const dialogRoot = ref<HTMLElement | null>(null)

onMounted(() => dialogRoot.value?.focus())
watch(activeSide, () => { quantityText.value = ''; status.value = null })
const quantity = computed(() => parseTradeQuantity(quantityText.value))
const preview = computed(() => activeSide.value === 'buy'
  ? buyAsset(props.state, props.assetId, quantity.value)
  : sellAsset(props.state, props.assetId, quantity.value))
const exactPreview = computed(() => props.exactState && props.executeExactTrade
  ? activeSide.value === 'buy'
    ? v8BuyTrade(props.exactState, props.assetId, quantityText.value)
    : v8SellTrade(props.exactState, props.assetId, quantityText.value)
  : null)
const ready = computed(() => exactPreview.value ? exactPreview.value.ok : preview.value.ok)
const estimate = computed(() => !exactPreview.value && preview.value.ok ? preview.value.receipt : null)
const estimateExact = computed(() => exactPreview.value?.ok ? exactPreview.value : null)
const cashExact = (amount:bigint) => formatCompactUnits(amount,2,'$')
const displayFee = computed(() => estimateExact.value
  ? cashExact(estimateExact.value.feeCents) : estimate.value ? formatCash(estimate.value.fee) : '—')
const displayTotal = computed(() => estimateExact.value
  ? cashExact(estimateExact.value.cashDeltaCents < 0n
      ? -estimateExact.value.cashDeltaCents : estimateExact.value.cashDeltaCents)
  : estimate.value ? formatCash(Math.abs(estimate.value.cashChange)) : '—')
const displayProfit = computed(() => estimateExact.value
  ? cashExact(estimateExact.value.realizedNetProfitCents)
  : estimate.value ? formatCash(estimate.value.netRealizedProfit) : '—')
const displayImpact = computed(() => {
  if (!estimateExact.value || !props.exactState) return null
  const after = estimateExact.value.state.trading.quotes[props.assetId]?.price
  if (!after || !currentPrice.value) return null
  const percent = (after / currentPrice.value - 1) * 100
  return (percent > 0 ? '+' : '') + percent.toFixed(2) + ' %'
})
const displayTax = computed(() => estimateExact.value && props.exactState
  ? cashExact(v(estimateExact.value.state.fiscal.taxesDueCents)-v(props.exactState.fiscal.taxesDueCents))
  : estimate.value ? formatCash(estimate.value.taxAccrued) : '—')
const errorKey = computed(() => exactPreview.value && !exactPreview.value.ok
  ? exactPreview.value.reason : !preview.value.ok ? preview.value.error : '')
const exactHolding = computed(() => props.exactState?.trading.positions[props.assetId])
const fullHolding = computed(() => exactHolding.value
  ? formatCompactUnits(v(exactHolding.value.quantity), asset.value.quantityDecimals, '')
  : formatQuantity(owned.value))
const fullBalance = computed(() => props.exactState
  ? cashExact(v(props.exactState.game.balance)) : formatCash(balance.value))
// Historical extremes are observations, never guaranteed trading limits.
const observedRange = computed(() => {
  let low = currentPrice.value
  let high = currentPrice.value
  for (const sample of samples.value) {
    if (sample.price < low) low = sample.price
    if (sample.price > high) high = sample.price
  }
  return {low,high}
})

const errors: Record<string, string> = {
  'unknown-asset': 'Actif introuvable.',
  'invalid-quantity': 'Saisissez une quantité valide, avec la bonne précision.',
  'invalid-price': 'Cours indisponible : transaction suspendue.',
  'insufficient-funds': 'Solde insuffisant, frais compris.',
  'insufficient-holdings': 'Vous ne détenez pas autant d’unités.',
  'staked-holdings': 'Cette quantité est verrouillée en staking ou en retrait.',
  'amount-too-small': 'Achat trop petit : une revente immédiate ne rapporterait aucun centime.',
  'money-overflow': 'Montant trop élevé pour être calculé avec précision.',
  'invalid-cost': 'Montant de la transaction invalide.',
  'unknown-asset-or-invalid-price': 'Cours invalide.',
  'storage-error': 'Sauvegarde indisponible : aucune transaction exécutée.',
}
function chooseFraction(fraction: TradeFraction) {
  if (props.exactState && props.executeExactTrade) {
    const units=activeSide.value==='buy'
      ? v8MaximumBuyUnits(props.exactState,props.assetId)
      : (() => {
        const held=props.exactState!.trading.positions[props.assetId]
        const stake=props.exactState!.trading.staking.positions[props.assetId]
        return held ? v(held.quantity) - (stake ? v(stake.locked)+v(stake.unlocking)+v(stake.awaitingCompound) : 0n) : 0n
      })()
    const fractionUnits=units*BigInt(Math.round(fraction*100))/100n
    quantityText.value = formatDecimalUnits(fractionUnits>0n?fractionUnits:0n,asset.value.quantityDecimals,true)
  } else {
    const amount = getQuickQuantity(props.state, props.assetId, activeSide.value, fraction)
    quantityText.value = formatEditableQuantity(amount, asset.value.quantityDecimals)
  }
  status.value = null
}
// Withdraw the unrealized profit in cash, not the entire holding. Use the
// same execution curve and exact fee rounding as the V8 settlement engine.
function netSale(price: number, units: bigint, held: bigint): bigint | null {
  if (units === 0n) return 0n
  const impact = liquidityQuote(asset.value, price, units, 'sell', held)
  const fraction = impact && quoteToExactFraction(impact.executionPrice)
  const fee = asset.value.kind === 'stock' ? 50n : asset.value.kind === 'crypto' ? 100n : 150n
  return fraction ? exactTradeCost(fraction, units, asset.value.quantityDecimals, fee, 'sell')?.proceedsCents ?? null : null
}
const profitWithdrawal = computed(() => {
  const state = props.exactState
  const holding = exactHolding.value
  if (!state || !props.executeExactTrade || !holding) return null
  const held = v(holding.quantity)
  const basis = v(holding.costBasis)
  const stake = state.trading.staking.positions[props.assetId]
  const liquid = held - (stake ? v(stake.locked) + v(stake.unlocking) + v(stake.awaitingCompound) : 0n)
  const price = state.trading.quotes[props.assetId]?.price ?? asset.value.referencePrice
  if (held <= 0n || liquid <= 0n) return null
  const fullNet = netSale(price, held, held)
  if (fullNet === null || fullNet <= basis) return null
  return { held, basis, liquid, price, target: fullNet - basis }
})
function withdrawProfit() {
  const plan = profitWithdrawal.value
  const state = props.exactState
  const execute = props.executeExactTrade
  status.value = null
  if (!plan || !state || !execute) return
  // The remainder is valued after the order reprices the market. Keep at
  // least the original investment at estimated net liquidation value.
  // Search only on click, never on a market tick.
  let low = 0n, high = plan.liquid
  while (low < high) {
    const mid = low + (high - low + 1n) / 2n
    const impact = liquidityQuote(asset.value, plan.price, mid, 'sell', plan.held)
    const cash = netSale(plan.price, mid, plan.held)
    const remainder = impact ? netSale(impact.endingPrice, plan.held - mid, plan.held - mid) : null
    if (cash !== null && cash <= plan.target && remainder !== null && remainder >= plan.basis) low = mid
    else high = mid - 1n
  }
  const cash = netSale(plan.price, low, plan.held)
  const amount = formatDecimalUnits(low, asset.value.quantityDecimals, true)
  const preview = low > 0n ? v8SellTrade(state, props.assetId, amount) : null
  if (!cash || !preview?.ok || preview.realizedNetProfitCents <= 0n) {
    status.value = {success:false,message:'Plus-value insuffisante pour vendre sans entamer le capital initial.'}
    return
  }
  const response = execute('sell', props.assetId, amount)
  if (!response.ok) {
    status.value = {success:false,message:errors[response.reason] ?? 'Ordre refusé.'}
    return
  }
  quantityText.value = ''
  status.value = {success:true,message:`Plus-value encaissée · ${cashExact(response.cashDeltaCents)} · ${amount} ${asset.value.symbol} vendus`}
}
function submit() {
  status.value = null
  if (!ready.value) {
    status.value = { success: false, message: !preview.value.ok ? errors[preview.value.error] ?? 'Ordre refusé.' : 'Ordre refusé.' }
    return
  }
  if (props.exactState && props.executeExactTrade) {
    const response=props.executeExactTrade(activeSide.value,props.assetId,quantityText.value)
    if (!response.ok) {
      status.value={success:false,message:errors[response.reason]??'Ordre refusé.'}
      return
    }
    status.value={success:true,message:`${activeSide.value==='buy'?'Achat confirmé':'Vente confirmée'} · ${quantityText.value} ${asset.value.symbol} · frais ${cashExact(response.feeCents)}${activeSide.value==='sell' && response.cashDeltaCents===0n?' · produit net nul (moins de 0,01 $)':''}`}
    quantityText.value=''
    return
  }
  const response = props.executeTrade(activeSide.value, props.assetId, quantity.value)
  if (!response.ok) {
    status.value = { success: false, message: errors[response.error] ?? 'La cotation a changé : recommencez.' }
    return
  }
  status.value = {
    success: true,
    message: `${activeSide.value === 'buy' ? 'Achat confirmé' : 'Vente confirmée'} · ${formatQuantity(response.receipt.quantity)} ${asset.value.symbol} · frais ${formatCash(response.receipt.fee)}${activeSide.value === 'sell' && response.receipt.cashChange === 0 ? ' · produit net nul (moins de 0,01 $)' : ''}${response.receipt.taxAccrued > 0 ? ` · taxe différée ${formatCash(response.receipt.taxAccrued)}` : ''}`,
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
      <div v-if="asset.kind === 'stock'" class="yield-summary">Dividende annuel · {{ formatRate(rate ?? 0) }}</div>
      <MarketChart :samples="samples" :news="news" :average="average" @open-news="emit('open-news',$event)" />
      <section v-if="exactState && setAutoSellRule" class="asset-auto-sell" aria-label="Ventes automatiques sur news">
        <div class="asset-auto-sell-heading"><strong>Ventes automatiques</strong><small>Pour {{ asset.symbol }} uniquement</small></div>
        <button type="button" class="asset-auto-sell-toggle" :class="{ 'is-on': autoSellPreferences?.greenEnd }"
          :aria-pressed="!!autoSellPreferences?.greenEnd" @click="toggleAutoSell('greenEnd')">
          <span>Fin d’une news verte<small>Vendre les unités disponibles dès sa fin.</small></span>
          <strong>{{ autoSellPreferences?.greenEnd ? 'ACTIVÉ' : 'DÉSACTIVÉ' }}</strong>
        </button>
        <button type="button" class="asset-auto-sell-toggle" :class="{ 'is-on': autoSellPreferences?.redStart }"
          :aria-pressed="!!autoSellPreferences?.redStart" @click="toggleAutoSell('redStart')">
          <span>Apparition d’une news rouge<small>Vendre dès qu’elle affecte cet actif.</small></span>
          <strong>{{ autoSellPreferences?.redStart ? 'ACTIVÉ' : 'DÉSACTIVÉ' }}</strong>
        </button>
        <small class="asset-auto-sell-footnote">Fonctionne aussi hors ligne · Staking verrouillé exclu · Frais et taxes habituels</small>
        <small v-if="autoSellError" class="order-error" role="alert">{{ autoSellError }}</small>
      </section>
      <div class="asset-order">
        <div class="order-side">
          <button type="button" :class="{ 'is-buy': activeSide === 'buy' }" :aria-pressed="activeSide === 'buy'" @click="activeSide = 'buy'">Acheter</button>
          <button type="button" :class="{ 'is-sell': activeSide === 'sell' }" :aria-pressed="activeSide === 'sell'" @click="activeSide = 'sell'">Vendre</button>
        </div>
        <button v-if="exactState && executeExactTrade" class="order-profit-quick" type="button"
          :disabled="!profitWithdrawal" @click="$event.detail < 2 && withdrawProfit()">
          Encaisser la plus-value <span v-if="profitWithdrawal">· {{ cashExact(profitWithdrawal.target) }} max.</span>
        </button>
        <div class="order-hint">
          <span>{{ activeSide === 'buy' ? 'Votre solde' : 'En portefeuille' }}</span>
          <strong>{{ activeSide === 'buy' ? fullBalance : fullHolding + ' ' + asset.symbol }}</strong>
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
          <span>Frais ({{ formatRate(feeRate(asset.kind)) }})</span><strong>{{ displayFee }}</strong>
          <template v-if="displayImpact">
            <span>Impact de l'ordre sur le cours</span><strong>{{ displayImpact }}</strong>
          </template>
          <span>{{ activeSide === 'buy' ? 'Total à payer' : 'Montant à recevoir' }}</span>
          <strong>{{ displayTotal }}</strong>
          <template v-if="activeSide === 'sell' && (estimate || estimateExact)">
            <span>Plus-value nette réalisée</span><strong>{{ displayProfit }}</strong>
            <span>Taxe différée (due sous 72 h max.)</span><strong>{{ displayTax }}</strong>
          </template>
        </div>
        <p v-if="activeSide === 'sell' && ((estimate && estimate.cashChange === 0) || (estimateExact && estimateExact.cashDeltaCents === 0n))" class="order-precision">
          Cette vente rapporte 0,00 $ après arrondis et frais : les unités seront retirées sans crédit de dollars.
        </p>
        <p v-if="quantityText.trim() && !ready && !status"
          class="order-error" role="alert">{{ errors[errorKey] ?? 'Ordre invalide.' }}</p>
        <p v-if="status" :class="status.success ? 'order-success' : 'order-error'" role="status">{{ status.message }}</p>
        <button class="order-submit" type="button" :disabled="!ready"
          @click="submit">
          {{ activeSide === 'buy' ? 'Confirmer l’achat' : 'Confirmer la vente' }}
        </button>
      </div>
      <section class="asset-market-details" aria-label="Détails du marché et actualités">
        <h3>Détails du marché et actualités</h3>
        <div class="asset-detail-grid">
          <div><span>Plus bas observé (1 h)</span><strong>{{ formatPrice(observedRange.low) }}</strong></div>
          <div><span>Plus haut observé (1 h)</span><strong>{{ formatPrice(observedRange.high) }}</strong></div>
          <div><span>Vous détenez</span><strong>{{ fullHolding }}</strong></div>
        </div>
        <div class="asset-news-related">
          <span class="eyebrow">NEWS ASSOCIÉES</span>
          <button v-for="entry in relatedNews" :key="entry.id" type="button" @click="emit('open-news', entry.id)">
            {{ getNewsPresentation(entry)?.headline ?? 'Actualité du marché' }} <span aria-hidden="true">›</span>
          </button>
          <p v-if="!relatedNews.length" class="asset-news-empty">Aucune actualité associée.</p>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.trading-asset-modal .asset-detail-quote { margin-bottom: 3px; }
.trading-asset-modal .yield-summary { margin: 0 0 5px; font-size: 11px; line-height: 1.35; }
.trading-asset-modal .order-profit-quick {
  width: 100%; min-height: 36px; margin: 4px 0; padding: 6px 8px;
  border-radius: 8px; border: 1px solid #27845a; color: #8ee6b2;
  background: rgba(39,132,90,.16); font: inherit; font-size: 12px; font-weight: 700;
}
.trading-asset-modal .order-profit-quick:disabled { opacity: .45; cursor: not-allowed; }
.trading-asset-modal .asset-auto-sell { margin: 10px 0; padding: 10px; border-radius: 10px; border: 1px solid rgba(150,170,203,.24); background: rgba(17,30,51,.42); display: grid; gap: 7px; }
.trading-asset-modal .asset-auto-sell-heading { display: flex; justify-content: space-between; align-items: center; gap: 6px; font-size: 12px; }
.trading-asset-modal .asset-auto-sell-heading small { color: #a8b6ca; font-size: 10px; }
.trading-asset-modal .asset-auto-sell-toggle { display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 10px; text-align: left; padding: 9px; border-radius: 8px; border: 1px solid rgba(146,164,190,.27); color: #e5edf8; background: rgba(255,255,255,.035); font: inherit; font-size: 11px; cursor: pointer; }
.trading-asset-modal .asset-auto-sell-toggle span { display: grid; gap: 3px; font-weight: 650; }
.trading-asset-modal .asset-auto-sell-toggle span small { color: #9caec7; font-size: 10px; font-weight: 400; }
.trading-asset-modal .asset-auto-sell-toggle strong { flex: none; color: #b7bfd1; font-size: 10px; }
.trading-asset-modal .asset-auto-sell-toggle.is-on { border-color: #228b65; background: rgba(34,139,101,.16); }
.trading-asset-modal .asset-auto-sell-toggle.is-on strong { color: #85edb5; }
.trading-asset-modal .asset-auto-sell-footnote { color: #9caec7; font-size: 10px; line-height: 1.4; }
</style>
