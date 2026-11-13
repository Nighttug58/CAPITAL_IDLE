<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import type { CapitalState } from '../capital.ts'
import { FAME_BOOSTS } from '../prestige/catalog.ts'
import { getBonusBreakdown } from '../prestige/bonuses.ts'
import { getFameShopOffers, type FameShopError, type FameShopPurchase } from '../prestige/shop.ts'
import { FAME_MICROS } from '../prestige/state.ts'

const props = defineProps<{
  state: CapitalState
  purchaseBoost: (id: string, currentLevel: number) => FameShopPurchase
}>()
const emit = defineEmits<{ close: [] }>()
const closeButton = ref<HTMLButtonElement | null>(null)
const dialog = ref<HTMLElement | null>(null)
const notice = ref('')
const noticeError = ref(false)
const numeric = new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 2 })
const fame = (micros: number) => numeric.format(micros / FAME_MICROS)
const percentage = (basisPoints: number) => numeric.format(basisPoints / 100) + ' %'
const offers = computed(() => getFameShopOffers(props.state))
const rows = computed(() => FAME_BOOSTS.map((boost, index) => ({
  boost, offer: offers.value[index]!, collectionBonus: getBonusBreakdown(props.state, boost.id).collectionBps,
})))
const purchasedLevels = computed(() => offers.value.reduce((total, offer) => total + offer.currentLevel, 0))

const errors: Record<FameShopError, string> = {
  'unknown-boost': 'Cette amélioration est introuvable.',
  'invalid-state': 'Le solde Fame est incohérent. Aucun achat effectué.',
  'stale-level': 'Le palier a changé. Vérifiez le nouveau prix.',
  'max-level': 'Ce bonus a atteint son niveau maximum.',
  'insufficient-fame': 'Fame insuffisante pour cet achat.',
}

function purchase(id: string, currentLevel: number) {
  const result = props.purchaseBoost(id, currentLevel)
  noticeError.value = !result.ok
  notice.value = result.ok
    ? 'Amélioration achetée : niveau ' + result.receipt.newLevel + '/20 · −' + result.receipt.costFame + ' Fame.'
    : errors[result.error]
}

function close() { emit('close') }
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
  }
}

function trapFocus(event: KeyboardEvent) {
  if (event.key !== 'Tab' || !dialog.value) return
  const controls = Array.from(dialog.value.querySelectorAll<HTMLElement>(
    'button:not(:disabled), [href], input:not(:disabled), [tabindex]:not([tabindex="-1"])',
  )).filter((el) => el.getClientRects().length > 0 || typeof window === 'undefined')
  // JSDOM does not expose layout rectangles; production focus stays within the dialog.
  if (controls.length === 0) return
  const first = controls[0]!
  const last = controls[controls.length - 1]!
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}
onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  void nextTick(() => closeButton.value?.focus())
})
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="prestige-overlay" @click.self="close">
    <section ref="dialog" class="prestige-dialog fame-shop-dialog" role="dialog" aria-modal="true"
      aria-labelledby="fame-shop-title" @keydown="trapFocus">
      <header class="prestige-dialog-head fame-shop-head">
        <div class="prestige-dialog-heading">
          <span class="prestige-eyebrow"><span aria-hidden="true">✦</span> MONNAIE DE PRESTIGE</span>
          <h2 id="fame-shop-title">Fame Shop</h2>
          <p>Améliorations permanentes · 20 niveaux par bonus</p>
        </div>
        <button ref="closeButton" type="button" class="prestige-close" aria-label="Fermer Fame Shop" @click="close">×</button>
      </header>

      <div class="fame-shop-summary">
        <div>
          <span>SOLDE FAME</span>
          <strong><span aria-hidden="true">✦</span> {{ fame(state.prestige.fameMicros) }}</strong>
        </div>
        <div>
          <span>PALIERS ACHETÉS</span>
          <strong>{{ purchasedLevels }} / 120</strong>
        </div>
      </div>

      <div class="prestige-dialog-scroll fame-shop-scroll" aria-label="Améliorations Fame disponibles">
        <article v-for="row in rows" :key="row.boost.id" class="fame-boost-card" :data-boost="row.boost.id">
          <div class="fame-boost-heading">
            <div class="fame-boost-heading-main">
              <strong>{{ row.boost.label }}</strong>
              <p>{{ row.boost.description }}</p>
            </div>
            <span class="fame-boost-level">NIV. {{ row.offer.currentLevel }}/20</span>
          </div>
          <div class="fame-boost-track" role="progressbar" :aria-label="'Niveau de ' + row.boost.label"
            :aria-valuenow="row.offer.currentLevel" aria-valuemin="0" aria-valuemax="20">
            <span :style="{ width: (row.offer.currentLevel * 5) + '%' }"></span>
          </div>
          <div class="fame-boost-meta">
            <span>Shop : <b>+{{ percentage(row.offer.currentBonusBps) }}</b></span>
            <span v-if="row.collectionBonus > 0">Collection : <b>+{{ percentage(row.collectionBonus) }}</b></span>
            <span v-if="row.offer.nextBonusBps !== null">Prochain : <b>+{{ percentage(row.offer.nextBonusBps) }}</b></span>
            <span v-else class="fame-boost-max">Bonus au maximum</span>
          </div>
          <div class="fame-boost-footer">
            <div class="fame-boost-cost">
              <span>PROCHAIN PALIER</span>
              <strong>{{ row.offer.nextCostFame === null ? 'NIVEAU MAX' : row.offer.nextCostFame + ' ✦ Fame' }}</strong>
            </div>
            <button type="button" class="fame-buy-button" :disabled="!row.offer.canAfford"
              :aria-label="'Améliorer ' + row.boost.label + ' au niveau ' + (row.offer.currentLevel + 1)"
              @click="purchase(row.boost.id, row.offer.currentLevel)">
              {{ row.offer.nextCostFame === null ? 'MAX' : row.offer.canAfford ? 'ACHETER' : 'FAME INSUFF.' }}
            </button>
          </div>
        </article>
      </div>
      <footer class="prestige-dialog-footer">
        <p class="fame-shop-note">La Fame provient des niveaux et des collections. Les bonus sont permanents et les achats ne sont pas remboursables.</p>
        <p v-if="notice" role="status" class="prestige-notice" :class="{ 'prestige-notice-error': noticeError }">{{ notice }}</p>
      </footer>
    </section>
  </div>
</template>
