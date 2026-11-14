<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import type { CapitalState } from '../capital.ts'
import { FAME_BOOSTS } from '../prestige/catalog.ts'
import { getBonusBreakdown } from '../prestige/bonuses.ts'
import { getAbsolutePrestigeStatus } from '../prestige/absolute.ts'
import { getFameShopOffers, type FameShopError, type FameShopPurchase } from '../prestige/shop.ts'
import { FAME_MICROS } from '../prestige/state.ts'

const props = defineProps<{
  state: CapitalState
  purchaseBoost: (id: string, currentLevel: number) => FameShopPurchase
}>()
const emit = defineEmits<{ back: [] }>()
const returnButton = ref<HTMLButtonElement | null>(null)
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
const absolute = computed(() => getAbsolutePrestigeStatus(props.state))
const factorText = computed(() => absolute.value.overflowed
  ? 'HORS LIMITE'
  : '×' + new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 6 }).format(absolute.value.factor))
const remainingSteps = computed(() => Math.max(0, absolute.value.requiredLevels - absolute.value.purchasedLevels))

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

function returnHome() { emit('back') }
onMounted(() => { void nextTick(() => returnButton.value?.focus()) })
</script>

<template>
  <main id="fame-shop" class="fame-shop-screen" aria-label="Boutique Fame">
      <header class="fame-shop-page-header">
        <button ref="returnButton" type="button" class="fame-shop-return" aria-label="Retour à l'accueil" @click="returnHome">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M19 12H5m7 7-7-7 7-7"/>
          </svg>
          <span>Accueil</span>
        </button>
        <div class="prestige-dialog-heading fame-shop-page-heading">
          <span class="prestige-eyebrow"><span aria-hidden="true">✦</span> MONNAIE DE PRESTIGE</span>
          <h1 id="fame-shop-title">Fame Shop</h1>
          <p>Améliorations permanentes · 20 niveaux par bonus</p>
        </div>
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

      <div class="fame-shop-page-scroll fame-shop-scroll" aria-label="Améliorations Fame disponibles">
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
            <span v-if="absolute.unlocked">Shop avec Prestige : <b>+{{ percentage(row.offer.currentBonusBps * absolute.factor) }}</b></span>
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
        <article class="absolute-prestige-card" :class="{ 'absolute-prestige-unlocked': absolute.unlocked }"
          data-boost="absolute">
          <div class="absolute-prestige-heading">
            <div>
              <span class="prestige-eyebrow">✦ ULTIME AMÉLIORATION</span>
              <h3>Prestige absolu</h3>
            </div>
            <span class="absolute-prestige-state">{{ absolute.unlocked ? 'DÉBLOQUÉ' : 'VERROUILLÉ' }}</span>
          </div>
          <p v-if="!absolute.unlocked">
            Déblocage automatique et gratuit après les 120 niveaux du Fame Shop.
            Encore {{ remainingSteps }} {{ remainingSteps === 1 ? 'palier' : 'paliers' }} à acheter.
          </p>
          <template v-else>
            <strong class="absolute-prestige-factor">{{ factorText }}</strong>
            <p>Chaque tranche entière de 100 Fame <b>disponibles</b> multiplie uniquement les bonus du Fame Shop par ×1,01.</p>
            <div class="absolute-prestige-details">
              <span>{{ absolute.fameSteps }} tranches actives</span>
              <span>Prochaine tranche : {{ absolute.nextStepAtFame }} Fame</span>
            </div>
            <p v-if="absolute.overflowed" class="prestige-notice prestige-notice-error">
              Facteur trop élevé pour être représenté : les gains dépassant les limites monétaires sont refusés.
            </p>
          </template>
          <p class="absolute-prestige-footnote">Les bonus de collection ne sont jamais multipliés. Aucun achat supplémentaire.</p>
        </article>
      </div>
      <footer class="fame-shop-page-footer">
        <p class="fame-shop-note">La Fame provient des niveaux et des collections. Les bonus sont permanents et les achats ne sont pas remboursables.</p>
        <p v-if="notice" role="status" class="prestige-notice" :class="{ 'prestige-notice-error': noticeError }">{{ notice }}</p>
      </footer>
  </main>
</template>
