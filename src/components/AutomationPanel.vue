<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { CapitalState } from '../capital.ts'
import { ASSETS, getAsset } from '../trading/catalog.ts'
import { formatPrice, formatQuantity } from '../trading/presentation.ts'
import { parseTradeQuantity } from '../trading/order-ui.ts'
import { quantityStringToUnits } from '../exact-trading.ts'
import type { AscensionAutomationSettings, AscensionMarketOrder, AscensionOrderKind } from '../ascension/contracts.ts'
import {
  AUTO_STOP_LOSS_BPS, AUTO_TAKE_PROFIT_BPS, MAX_PENDING_ORDERS,
  type AutomationActionResult, type AutomationError,
} from '../ascension/automation-orders.ts'

const props = defineProps<{
  state: CapitalState
  saveAutomation: (patch: Partial<AscensionAutomationSettings>) => AutomationActionResult
  createOrder: (order: Omit<AscensionMarketOrder, 'id'|'createdAtRealMs'>) => AutomationActionResult
  createExactOrder?: (order: Omit<AscensionMarketOrder,'id'|'createdAtRealMs'|'quantity'> & {quantity:string}) => AutomationActionResult
  cancelOrder: (id: number) => AutomationActionResult
}>()
const levels = computed(() => props.state.ascension.progress.upgradeLevels)
const settings = computed(() => props.state.ascension.run.automation)
const orders = computed(() => props.state.ascension.run.marketOrders ?? [])
const assets = ASSETS
const orderAssetId = ref('nvideo')
const orderSide = ref<'buy'|'sell'>('buy')
const orderKind = ref<AscensionOrderKind>('limit')
const orderQuantity = ref('')
const orderPrice = ref('')
const budget = ref('0')
const reserve = ref('0')
const enterpriseBudget = ref('0')
const takeProfit = ref('10')
const stopLoss = ref('5')
const notice = ref('')
const error = ref(false)
const busy = ref(false)
const currentOrderAsset = computed(() => getAsset(orderAssetId.value) ?? ASSETS[0]!)
const currentPrice = computed(() =>
  props.state.trading.quotes[orderAssetId.value]?.price ?? currentOrderAsset.value.referencePrice)
const hasOrders = computed(() => levels.value['automatic-orders'] > 0)
const hasAny = computed(() => ['auto-investor','auto-trader','auto-enterprise','automatic-orders']
  .some(id => levels.value[id as keyof typeof levels.value] > 0))
const toggles = [
  { key: 'investorEnabled', upgrade: 'auto-investor', name: 'Auto Investisseur', note: 'Achète les actifs sélectionnés selon le budget' },
  { key: 'traderEnabled', upgrade: 'auto-trader', name: 'Auto Trader', note: 'Ventes sur Take Profit ou Stop Loss' },
  { key: 'enterpriseEnabled', upgrade: 'auto-enterprise', name: 'Auto Entreprise', note: 'Achète ou améliore l’entreprise la moins chère' },
] as const

watch(settings, value => {
  budget.value = (value.maxOrderCents / 100).toString()
  reserve.value = (value.cashReserveCents / 100).toString()
  enterpriseBudget.value = ((value.enterpriseBudgetCents ?? value.maxOrderCents) / 100).toString()
  takeProfit.value = ((value.takeProfitBps ?? AUTO_TAKE_PROFIT_BPS) / 100).toString()
  stopLoss.value = ((value.stopLossBps ?? AUTO_STOP_LOSS_BPS) / 100).toString()
}, { immediate: true })

const errors: Record<AutomationError, string> = {
  'locked': 'Amélioration Prestige non débloquée.',
  'invalid-settings': 'Paramètres invalides. Vérifie les budgets et les pourcentages.',
  'invalid-order': 'Ordre invalide : vérifie la quantité, le prix et le type.',
  'too-many-orders': 'Nombre maximum d’ordres en attente atteint.',
  'order-not-found': 'Cet ordre a déjà été exécuté ou annulé.',
  'pending-replay': 'Le marché doit finir son rattrapage avant de placer cet ordre.',
  'storage-error': 'Échec de la sauvegarde, aucune modification effectuée.',
}
function present(result: AutomationActionResult, success: string) {
  error.value = !result.ok
  notice.value = result.ok ? success : errors[result.error]
}
function apply(patch: Partial<AscensionAutomationSettings>, message: string) {
  if (busy.value) return
  busy.value = true
  try { present(props.saveAutomation(patch), message) }
  finally { busy.value = false }
}
function toggle(key: typeof toggles[number]['key']) {
  apply({ [key]: !settings.value[key] }, 'Automatisation mise à jour.')
}
function amountCents(text: string): number | null {
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(text.trim())) return null
  const n = Math.round(Number(text.replace(',', '.')) * 100)
  return Number.isSafeInteger(n) && n >= 0 ? n : null
}
function basisPoints(text: string): number | null {
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(text.trim())) return null
  const n = Math.round(Number(text.replace(',', '.')) * 100)
  return Number.isSafeInteger(n) ? n : null
}
function saveBudget() {
  const maxOrderCents = amountCents(budget.value)
  const cashReserveCents = amountCents(reserve.value)
  const enterpriseBudgetCents = amountCents(enterpriseBudget.value)
  const takeProfitBps = basisPoints(takeProfit.value)
  const stopLossBps = basisPoints(stopLoss.value)
  if ([maxOrderCents, cashReserveCents, enterpriseBudgetCents, takeProfitBps, stopLossBps]
    .some(value => value === null)) {
    error.value = true; notice.value = 'Saisis des montants positifs avec au plus deux décimales.'
    return
  }
  apply({
    maxOrderCents: maxOrderCents!, cashReserveCents: cashReserveCents!,
    enterpriseBudgetCents: enterpriseBudgetCents!,
    takeProfitBps: takeProfitBps!, stopLossBps: stopLossBps!,
  }, 'Budgets, réserve et objectifs enregistrés.')
}
function toggleAsset(id: string) {
  const selected = settings.value.allowedAssetIds
  const next = selected.includes(id) ? selected.filter(name => name !== id) : [...selected, id]
  apply({ allowedAssetIds: next }, 'Liste des actifs autorisés enregistrée.')
}
function putOrder() {
  if (!hasOrders.value || busy.value) return
  const quantity = parseTradeQuantity(orderQuantity.value)
  const triggerPrice = Number(orderPrice.value.replace(',', '.'))
  if ((!props.createExactOrder && !Number.isFinite(quantity)) ||
    (props.createExactOrder && (quantityStringToUnits(orderQuantity.value,currentOrderAsset.value.quantityDecimals)??0n)<=0n) ||
    !Number.isFinite(triggerPrice) || !(triggerPrice > 0)) {
    error.value = true; notice.value = 'Prix et quantité de l’ordre invalides.'
    return
  }
  busy.value = true
  try {
    const common={assetId:orderAssetId.value,side:orderSide.value,
      kind:orderKind.value,triggerPrice}
    const result=props.createExactOrder
      ? props.createExactOrder({...common,quantity:orderQuantity.value})
      : props.createOrder({...common,quantity})
    present(result, 'Ordre enregistré et prêt pour la prochaine cotation.')
    if (result.ok) orderQuantity.value = ''
  } finally { busy.value = false }
}
function removeOrder(id: number) {
  if (busy.value) return
  busy.value = true
  try { present(props.cancelOrder(id), 'Ordre annulé sans frais.') }
  finally { busy.value = false }
}
watch(orderSide, value => {
  if (value === 'buy' && orderKind.value !== 'limit') orderKind.value = 'limit'
})
</script>

<template>
  <section class="automation-panel" aria-label="Automatisations Prestige">
    <div class="automation-heading">
      <span class="ascension-eyebrow">PRESTIGE · ASSISTANTS ACTIFS</span>
      <h2>Automatisations</h2>
      <p>Les bots fonctionnent seulement avec le jeu au premier plan, sans gains ni achats hors ligne. Une décision toutes les cinq secondes réelles.</p>
    </div>

    <div v-if="!hasAny" class="automation-locked">Débloque Auto Investisseur, Auto Trader, Auto Entreprise ou Ordres automatiques dans la boutique ci-dessous. Auto Click est maintenant disponible en dollars sur Accueil.</div>
    <div class="automation-switches">
      <div v-for="item in toggles" :key="item.key" class="automation-switch">
        <div><strong>{{ item.name }}</strong><small>{{ item.note }}</small></div>
        <button type="button" :disabled="!levels[item.upgrade] || busy"
          :aria-pressed="settings[item.key]" @click="toggle(item.key)">
          {{ !levels[item.upgrade] ? 'VERROUILLÉ' : settings[item.key] ? 'ACTIF' : 'ACTIVER' }}
        </button>
      </div>
    </div>

    <div v-if="levels['auto-investor'] || levels['auto-trader'] || levels['auto-enterprise']" class="automation-config">
      <h3>Règles et limites</h3>
      <p>La réserve est toujours respectée lors des achats. Le montant maximal s’applique à chaque ordre automatique.</p>
      <div class="automation-fields">
        <label>Budget par ordre ($)
          <input v-model="budget" type="text" inputmode="decimal" autocomplete="off"/>
        </label>
        <label>Réserve de cash ($)
          <input v-model="reserve" type="text" inputmode="decimal" autocomplete="off"/>
        </label>
        <label>Budget entreprise ($)
          <input v-model="enterpriseBudget" type="text" inputmode="decimal" autocomplete="off"/>
        </label>
        <label>Take Profit (%)
          <input v-model="takeProfit" type="text" inputmode="decimal" autocomplete="off"/>
        </label>
        <label>Stop Loss (%)
          <input v-model="stopLoss" type="text" inputmode="decimal" autocomplete="off"/>
        </label>
      </div>
      <button class="automation-save" type="button" :disabled="busy" @click="saveBudget">ENREGISTRER LES RÈGLES</button>
    </div>

    <div v-if="levels['auto-investor'] || levels['auto-trader']" class="automation-assets">
      <h3>Marchés autorisés <small>({{ settings.allowedAssetIds.length }} sélectionnés)</small></h3>
      <div class="automation-assets-list">
        <label v-for="asset in assets" :key="asset.id" :class="{ 'is-selected': settings.allowedAssetIds.includes(asset.id) }">
          <input type="checkbox" :checked="settings.allowedAssetIds.includes(asset.id)"
            :disabled="busy" @change="toggleAsset(asset.id)"/>
          <span>{{ asset.symbol }}</span>
          <small>{{ asset.kind === 'stock' ? 'Action' : asset.kind === 'crypto' ? 'Crypto' : 'Memecoin' }}</small>
        </label>
      </div>
    </div>

    <div v-if="hasOrders" class="automation-orders" aria-label="Ordres de marché conditionnels">
      <h3>Ordres automatiques <small>{{ orders.length }}/{{ MAX_PENDING_ORDERS }}</small></h3>
      <p>Une limite d’achat déclenche sous le prix choisi ; une limite de vente ou un Take Profit au-dessus ; un Stop Loss en dessous. Le prix réellement obtenu est celui du marché au déclenchement.</p>
      <div class="automation-order-fields">
        <label>Actif<select v-model="orderAssetId">
          <option v-for="asset in assets" :key="asset.id" :value="asset.id">{{ asset.symbol }}</option>
        </select></label>
        <label>Sens<select v-model="orderSide">
          <option value="buy">Acheter</option><option value="sell">Vendre</option>
        </select></label>
        <label>Déclencheur<select v-model="orderKind">
          <option value="limit">Limite</option>
          <option v-if="orderSide === 'sell'" value="stop-loss">Stop Loss</option>
          <option v-if="orderSide === 'sell'" value="take-profit">Take Profit</option>
        </select></label>
        <label>Prix cible ($)<input v-model="orderPrice" type="text" inputmode="decimal" placeholder="Prix cible"/></label>
        <label>Quantité<input v-model="orderQuantity" type="text" inputmode="decimal" placeholder="Quantité"/></label>
      </div>
      <p class="automation-order-current">Prix actuel : <strong>{{ formatPrice(currentPrice) }}</strong> · Quantité affichée en unités de l’actif</p>
      <button type="button" class="automation-save" :disabled="busy || orders.length >= MAX_PENDING_ORDERS"
        @click="putOrder">PLACER UN ORDRE</button>
      <div v-if="orders.length" class="automation-pending">
        <article v-for="order in orders" :key="order.id">
          <div><strong>#{{ order.id }} · {{ getAsset(order.assetId)?.symbol }} · {{ order.side === 'buy' ? 'ACHAT' : 'VENTE' }}</strong>
            <small>{{ order.kind }} · {{ formatQuantity(order.quantity) }} à {{ formatPrice(order.triggerPrice) }}</small></div>
          <button type="button" :disabled="busy" @click="removeOrder(order.id)">Annuler</button>
        </article>
      </div>
      <p v-else class="automation-empty">Aucun ordre en attente.</p>
    </div>
    <p v-if="notice" class="automation-notice" :class="{ 'is-error': error }" role="status">{{ notice }}</p>
  </section>
</template>
