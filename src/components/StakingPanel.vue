<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { CapitalState } from '../capital.ts'
import {
  STAKABLE_CRYPTOS, STAKING_UNLOCK_MS, stakingBaseRate, stakingRate,
  liquidCryptoQuantity, getStakingEntry, type StakingResult,
} from '../trading/staking.ts'
import { formatEditableQuantity, parseTradeQuantity } from '../trading/order-ui.ts'
import { formatQuantity, formatPrice, formatRemaining } from '../trading/presentation.ts'

const props = defineProps<{
  state: CapitalState
  executeStaking: (action: 'deposit' | 'withdraw', assetId: string, quantity: number) => StakingResult
}>()
const selectedId = ref('ethereum')
const action = ref<'deposit' | 'withdraw'>('deposit')
const quantityText = ref('')
const message = ref('')
const error = ref(false)
const busy = ref(false)

const coin = computed(() => STAKABLE_CRYPTOS.find(item => item.id === selectedId.value) ?? STAKABLE_CRYPTOS[0]!)
const held = computed(() => props.state.trading.positions[coin.value.id]?.quantity ?? 0)
const stake = computed(() => getStakingEntry(props.state, coin.value.id))
const liquid = computed(() => liquidCryptoQuantity(props.state, coin.value.id))
const max = computed(() => action.value === 'deposit' ? liquid.value : stake.value.locked)
const validQuantity = computed(() => {
  const number = parseTradeQuantity(quantityText.value)
  return Number.isFinite(number) && number <= max.value + 1e-9 &&
    Math.abs(number * 10 ** coin.value.quantityDecimals - Math.round(number * 10 ** coin.value.quantityDecimals)) < 0.0001
})
const rate = computed(() => stakingRate(props.state, coin.value.id))
const compound = computed(() => props.state.ascension.progress.upgradeLevels['auto-compound'] > 0)
const rewardFactor = computed(() => 1 + props.state.ascension.progress.upgradeLevels['staking-yield'] * 0.1)
const portfolio = computed(() => STAKABLE_CRYPTOS.map(asset => ({
  asset,
  holding: props.state.trading.positions[asset.id]?.quantity ?? 0,
  stake: getStakingEntry(props.state, asset.id),
  rate: stakingRate(props.state, asset.id),
})))
const pendingFor = (id: string) => {
  const entry = getStakingEntry(props.state, id)
  return entry.unlockAt === null ? '' :
    formatRemaining(entry.unlockAt, Math.max(Date.now(), props.state.trading.staking?.lastAccruedAt ?? 0))
}
function choose(id: string) {
  selectedId.value = id
  quantityText.value = ''
  action.value = 'deposit'
  message.value = ''
}
watch(action, () => { quantityText.value = ''; message.value = '' })

function useMax(fraction: 0.25 | 0.5 | 1) {
  const precision = 10 ** coin.value.quantityDecimals
  const units = Math.floor(max.value * precision * fraction + 1e-8)
  quantityText.value = formatEditableQuantity(units / precision, coin.value.quantityDecimals)
  message.value = ''
}
const descriptions: Record<string, string> = {
  'locked': 'Débloque d’abord l’option Staking dans la boutique Prestige.',
  'not-eligible': 'Cette cryptomonnaie ne peut pas être placée en staking.',
  'invalid-quantity': 'Quantité incorrecte pour la précision de ce coin.',
  'not-owned': 'Achète ce coin dans Trading avant de le placer.',
  'insufficient-liquid': 'Pas assez de coins disponibles hors staking.',
  'insufficient-staked': 'La quantité dépasse le capital staké.',
  'withdraw-pending': 'Un retrait est déjà en cours pour ce coin.',
  'invalid-time': 'Horloge invalide : réessaie après la synchronisation.',
  'storage-error': 'Sauvegarde indisponible : les coins n’ont pas changé.',
}
function submit() {
  if (busy.value || !validQuantity.value) return
  busy.value = true
  try {
    const response = props.executeStaking(action.value, coin.value.id, parseTradeQuantity(quantityText.value))
    error.value = !response.ok
    message.value = response.ok
      ? response.receipt.action === 'deposit'
        ? formatQuantity(response.receipt.quantity) + ' ' + coin.value.symbol + ' placés en staking.'
        : formatQuantity(response.receipt.quantity) + ' ' + coin.value.symbol + ' en retrait pendant 5 minutes réelles.'
      : descriptions[response.error] ?? 'Action refusée.'
    if (response.ok) quantityText.value = ''
  } finally { busy.value = false }
}
</script>

<template>
  <div class="staking-panel" aria-label="Staking cryptomonnaies">
    <header class="staking-header">
      <span class="eyebrow">PRESTIGE · REVENUS PASSIFS CRYPTO</span>
      <h2>Staking</h2>
      <p>Place tes cryptos pour recevoir des récompenses dans le même coin. Rendement en temps réel, sans accélération du marché.</p>
      <div class="staking-facts">
        <span>Rendement Prestige <strong>×{{ rewardFactor.toFixed(1) }}</strong></span>
        <span>Retrait <strong>{{ STAKING_UNLOCK_MS / 60_000 }} min</strong></span>
        <span>Hors ligne <strong>24 h max.</strong></span>
      </div>
      <p v-if="compound" class="staking-compound">Capitalisation automatique active : récompenses réinvesties toutes les 10 minutes réelles.</p>
    </header>

    <div class="staking-content">
      <section class="staking-assets" aria-label="Cryptomonnaies éligibles">
        <button v-for="item in portfolio" :key="item.asset.id" type="button" class="staking-asset"
          :class="{ 'is-selected': selectedId === item.asset.id }"
          :aria-pressed="selectedId === item.asset.id"
          @click="choose(item.asset.id)">
          <span class="staking-asset-name"><strong>{{ item.asset.symbol }}</strong><small>{{ item.asset.name }}</small></span>
          <span class="staking-asset-info"><strong>{{ item.rate.toFixed(3) }} %/h</strong><small>{{ formatQuantity(item.stake.locked) }} bloqués</small></span>
        </button>
      </section>

      <section class="staking-detail" :aria-label="'Gérer le staking ' + coin.symbol">
        <div class="staking-detail-head"><div><span class="eyebrow">POSITION SÉLECTIONNÉE</span><h3>{{ coin.name }} · {{ coin.symbol }}</h3></div>
          <span class="staking-yield">{{ rate.toFixed(3) }} %/h</span>
        </div>
        <div class="staking-numbers">
          <div><span>Détenus (total)</span><strong>{{ formatQuantity(held) }} {{ coin.symbol }}</strong></div>
          <div><span>Disponibles</span><strong>{{ formatQuantity(liquid) }} {{ coin.symbol }}</strong></div>
          <div><span>En staking</span><strong>{{ formatQuantity(stake.locked) }} {{ coin.symbol }}</strong></div>
          <div><span>Retrait en cours</span><strong>{{ formatQuantity(stake.unlocking) }} {{ coin.symbol }}</strong></div>
          <div v-if="stake.awaitingCompound"><span>Récompenses à capitaliser</span><strong>{{ formatQuantity(stake.awaitingCompound) }}</strong></div>
          <div><span>Coins gagnés (ce cycle)</span><strong>+{{ formatQuantity(stake.lifetimeRewards) }} {{ coin.symbol }}</strong></div>
          <div><span>Cours actuel</span><strong>{{ formatPrice(state.trading.quotes[coin.id]?.price ?? coin.referencePrice) }}</strong></div>
          <div><span>Rendement de base</span><strong>{{ stakingBaseRate(coin.id).toFixed(3) }} %/h</strong></div>
        </div>
        <p v-if="stake.unlocking > 0" class="staking-pending" role="status">
          Retrait en cours : disponible dans {{ pendingFor(coin.id) }}. Les coins en déblocage ne génèrent plus de récompenses.
        </p>
        <div class="staking-actions" role="group" aria-label="Opérations de staking">
          <button type="button" :aria-pressed="action === 'deposit'" :class="{ 'is-selected': action === 'deposit' }" @click="action = 'deposit'">Placer</button>
          <button type="button" :aria-pressed="action === 'withdraw'" :class="{ 'is-selected': action === 'withdraw' }" @click="action = 'withdraw'">Retirer</button>
        </div>
        <label for="staking-quantity">Quantité à {{ action === 'deposit' ? 'placer' : 'retirer' }}</label>
        <input id="staking-quantity" v-model="quantityText" type="text" autocomplete="off" inputmode="decimal"
          placeholder="0" :disabled="busy" @input="message = ''" />
        <div class="staking-fractions">
          <button v-for="fraction in ([0.25, 0.5, 1] as const)" :key="fraction" type="button"
            :disabled="busy || max <= 0" @click="useMax(fraction)">
            {{ fraction === 1 ? 'MAX' : Math.round(fraction * 100) + ' %' }}
          </button>
        </div>
        <p class="staking-rules">Les coins placés restent dans ton patrimoine, mais ne peuvent pas être vendus. Les récompenses sont ajoutées au portefeuille avec un coût d’acquisition supplémentaire nul et ne génèrent de l’XP qu’à leur vente.</p>
        <p v-if="message" class="staking-message" :class="{ 'is-error': error }" role="status">{{ message }}</p>
        <button type="button" class="staking-submit" :disabled="busy || !validQuantity || (action === 'withdraw' && stake.unlocking > 0)"
          @click="submit">{{ action === 'deposit' ? 'CONFIRMER LE STAKING' : 'LANCER LE RETRAIT' }}</button>
      </section>
    </div>
  </div>
</template>
