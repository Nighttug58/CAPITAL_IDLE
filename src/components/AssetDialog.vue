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
import { quoteToExactFraction } from '../exact-trading.ts'
import {v4DiscountedTradeCost} from '../prestige/fame-v4-prestige.ts'
import { liquidityQuote } from '../trading/liquidity-v8.ts'
import type { NewsAutoSellTrigger } from '../trading/auto-sell-v8.ts'
import { fameV4Level, minTrailingDrawdown, allowedTargetPortions, fameV4Trend } from '../trading/fame-v4-trading.ts'

const props = defineProps<{
  state: CapitalState
  batterySaver?:boolean
  exactState?: V8CapitalState
  executeExactTrade?: (side: TradeSide, assetId: string, quantity: string) => V8TradeResult
  setAutoSellRule?: (assetId:string,trigger:NewsAutoSellTrigger,enabled:boolean)=>boolean
  setFameV4Stop?: (assetId:string,enabled:boolean,drawdownPct:number)=>boolean
  setFameV4Target?: (assetId:string,slot:number,gainPct:number|null,portionPct:number)=>boolean
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
const stopRank=computed(()=>props.exactState?fameV4Level(props.exactState,2):0)
const traderFeeDiscount=computed(()=>props.exactState?.ascension.run.fameV4Prestige?.specialization==='trader'
  ?fameV4Level(props.exactState,30)*2:0)
const targetRank=computed(()=>props.exactState?fameV4Level(props.exactState,7):0)
const trendRank=computed(()=>props.exactState?fameV4Level(props.exactState,1):0)
const trend=computed(()=>props.exactState?fameV4Trend(props.exactState,props.assetId):null)
const v4Rules=computed(()=>props.exactState?.trading.fameV4Trading)
const stopSettings=computed(()=>v4Rules.value?.stops[props.assetId])
const configuredTargets=computed(()=>v4Rules.value?.targets[props.assetId]??[])
const selectableDrawdowns=computed(()=>[25,20,15,10,5].filter(pct=>pct>=(minTrailingDrawdown(stopRank.value)??100)))
const stopPct=ref(25)
watch([()=>props.assetId,()=>stopSettings.value?.drawdownPct,stopRank],()=>{
 stopPct.value=stopSettings.value?.drawdownPct??minTrailingDrawdown(stopRank.value)??25
},{immediate:true})
const targetSlot=ref(0)
const targetPctText=ref('10')
const targetPortion=ref(25)
const tradeV4Notice=ref('')
watch([targetSlot,configuredTargets,()=>props.assetId],()=>{
 const selected=configuredTargets.value.find(t=>t.slot===targetSlot.value)
 if(selected){targetPctText.value=String(selected.gainPct);targetPortion.value=selected.portionPct}
 else {targetPctText.value='10';targetPortion.value=25}
},{immediate:true})
const targetSlots=computed(()=>targetRank.value===5?[0,1,2]:[0])
const permittedPortions=computed(()=>allowedTargetPortions(targetRank.value))
function saveStop(active:boolean){
 const done=props.setFameV4Stop?.(props.assetId,active,stopPct.value)??false
 tradeV4Notice.value=done?active?'Stop suiveur activé.':'Stop suiveur désactivé.':'Stop non enregistré : données ou sauvegarde indisponibles.'
}
function saveTarget(){
 const text=targetPctText.value.trim()
 const gainPct=/^\d{1,5}$/.test(text)?Number(text):NaN
 if(!Number.isSafeInteger(gainPct)||gainPct<1||gainPct>10000){
  tradeV4Notice.value='Objectif invalide : saisissez un gain net entier de 1 à 10 000 %.';return
 }
 const done=props.setFameV4Target?.(props.assetId,targetSlot.value,gainPct,targetPortion.value)??false
 tradeV4Notice.value=done?'Sortie stratégique enregistrée.':'Objectif non enregistré : vérifiez le niveau et la sauvegarde.'
}
function removeTarget(slot:number){
 const done=props.setFameV4Target?.(props.assetId,slot,null,25)??false
 tradeV4Notice.value=done?'Objectif retiré.':'Suppression indisponible.'
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
  return fraction && props.exactState ? v4DiscountedTradeCost(props.exactState,fraction,units,asset.value.quantityDecimals,fee,'sell')?.proceedsCents ?? null : null
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
      <MarketChart :battery-saver="batterySaver" :samples="samples" :news="news" :average="average" @open-news="emit('open-news',$event)" />
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
      <section v-if="exactState && trendRank>0" class="asset-v4-tools" aria-label="Instinct du trader">
        <div class="asset-auto-sell-heading"><strong>Instinct du trader · {{ trendRank }}/10</strong><small>{{ trendRank*30 }} secondes</small></div>
        <div v-if="trend" class="asset-v4-stat">
          <span>Variation observée : <b>{{ trend.variationPct.toFixed(2) }} %</b></span>
          <span>Première moitié {{ trend.earlierPct.toFixed(2) }} % · seconde {{ trend.recentPct.toFixed(2) }} %</span>
          <strong>{{ trend.signal==='acceleration'?'Accélération détectée':trend.signal==='ralentissement'?'Ralentissement détecté':'Mouvement relativement stable' }}</strong>
        </div>
        <small v-else>Données de marché insuffisantes pour calculer l'indicateur.</small>
        <small class="asset-auto-sell-footnote">Analyse descriptive uniquement, sans prévision garantie.</small>
      </section>
      <section v-if="exactState && stopRank>0 && setFameV4Stop" class="asset-auto-sell asset-v4-tools" aria-label="Stop suiveur Fame">
        <div class="asset-auto-sell-heading"><strong>Stop suiveur · {{ stopRank }}/5</strong><small>Après news auto</small></div>
        <p>Déclenche une vente des unités liquides après un repli depuis le plus haut observé après l'achat.</p>
        <label class="asset-v4-input">Baisse déclenchante
          <select v-model.number="stopPct" aria-label="Seuil de baisse du stop suiveur">
            <option v-for="pct in selectableDrawdowns" :key="pct" :value="pct">−{{ pct }} %</option>
          </select>
        </label>
        <div class="asset-v4-action-row">
          <button type="button" class="asset-auto-sell-toggle" :class="{'is-on':stopSettings?.enabled}"
            :aria-pressed="!!stopSettings?.enabled" @click="saveStop(!stopSettings?.enabled)">
            {{ stopSettings?.enabled?'DÉSACTIVER':'ACTIVER LE STOP' }}
          </button>
          <button v-if="stopSettings?.enabled && stopPct!==stopSettings.drawdownPct" type="button" class="asset-auto-sell-toggle" @click="saveStop(true)">Changer seuil</button>
        </div>
        <small v-if="stopSettings?.peakPrice" class="asset-auto-sell-footnote">Sommet suivi : {{ formatPrice(stopSettings.peakPrice) }}</small>
      </section>
      <section v-if="exactState && targetRank>0 && setFameV4Target" class="asset-auto-sell asset-v4-tools" aria-label="Sortie stratégique Fame">
        <div class="asset-auto-sell-heading"><strong>Sortie stratégique · {{ targetRank }}/5</strong><small>Plus-value après frais</small></div>
        <p>Programme une vente partielle lorsque le bénéfice net estimé atteint l'objectif choisi.</p>
        <div class="asset-v4-grid">
          <label class="asset-v4-input">Objectif
            <select v-model.number="targetSlot" aria-label="Emplacement d'objectif">
              <option v-for="slot in targetSlots" :key="slot" :value="slot">Objectif {{ slot+1 }}</option>
            </select>
          </label>
          <label class="asset-v4-input">Gain net cible (%)
            <input v-model="targetPctText" type="text" inputmode="numeric" maxlength="5" placeholder="10" aria-label="Objectif de bénéfice net en pourcentage"/>
          </label>
          <label class="asset-v4-input">Part vendue
            <select v-model.number="targetPortion" aria-label="Part du portefeuille à vendre">
              <option v-for="portion in permittedPortions" :key="portion" :value="portion">{{ portion }} %</option>
            </select>
          </label>
          <button type="button" class="order-submit" @click="saveTarget()">Programmer</button>
        </div>
        <div v-for="entry in configuredTargets" :key="entry.slot" class="asset-v4-target-row">
          <span>Objectif {{ entry.slot+1 }} : +{{ entry.gainPct }} % · vente {{ entry.portionPct }} %</span>
          <button type="button" :aria-label="'Annuler objectif '+(entry.slot+1)" @click="removeTarget(entry.slot)">Annuler</button>
        </div>
        <small class="asset-auto-sell-footnote">Ventes automatiques hors ligne · unités en staking exclues · taxes ordinaires · pas de vente à découvert.</small>
      </section>
      <p v-if="tradeV4Notice" role="status" class="asset-v4-notice">{{ tradeV4Notice }}</p>
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
          <span>Frais ({{ formatRate(feeRate(asset.kind)) }}<template v-if="traderFeeDiscount"> · Destin Trader −{{ traderFeeDiscount }} % des frais</template>)</span><strong>{{ displayFee }}</strong>
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
.trading-asset-modal .asset-v4-tools { margin:9px 0; padding:10px; border-radius:10px; border:1px solid rgba(143,178,213,.28); background:rgba(15,32,53,.56); display:grid; gap:8px; font-size:11px; }
.trading-asset-modal .asset-v4-tools p { margin:0; color:#aebdd2; font-size:11px; line-height:1.45; }
.trading-asset-modal .asset-v4-stat { display:grid; gap:5px; color:#c8d9e9; }
.trading-asset-modal .asset-v4-stat strong { color:#9dd3fb; }
.trading-asset-modal .asset-v4-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
.trading-asset-modal .asset-v4-input { display:grid; gap:4px; font-size:10px; color:#b4c4d6; min-width:0; }
.trading-asset-modal .asset-v4-input input,.trading-asset-modal .asset-v4-input select { min-width:0; width:100%; color:#eef5ff; background:#1a2a3c; border:1px solid #4f6884; border-radius:7px; min-height:36px; padding:5px 7px; font:inherit; font-size:12px; }
.trading-asset-modal .asset-v4-grid .order-submit { margin:0; align-self:end; min-height:36px; }
.trading-asset-modal .asset-v4-action-row { display:flex; gap:7px; }
.trading-asset-modal .asset-v4-target-row { display:flex; justify-content:space-between; align-items:center; gap:8px; font-size:11px; border-top:1px solid #516079; padding-top:7px; }
.trading-asset-modal .asset-v4-target-row button { border:1px solid #6a8caf; background:#21374d; color:#d3eaff; padding:5px 7px; border-radius:6px; font-size:10px; }
.trading-asset-modal .asset-v4-notice { color:#b5e5ca; font-size:11px; margin:6px 0; }
</style>
