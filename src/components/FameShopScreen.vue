<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import type { CapitalState } from '../capital.ts'
import { FAME_BOOSTS, getV2NextFameBoostCost, FAME_BOOST_BPS_PER_LEVEL, type FameBoostId } from '../prestige/catalog.ts'
import type { V8CapitalState } from '../exact-state-v8.ts'
import { getExactAmount } from '../exact-state-v8.ts'
import { formatFameMicros } from '../large-numbers.ts'
import { getBonusBreakdown } from '../prestige/bonuses.ts'
import { getAbsolutePrestigeStatus } from '../prestige/absolute.ts'
import { v8AbsoluteFameStatus, FAME_FACTOR_SCALE, formatFameFactor, formatExactBasisPoints } from '../prestige/absolute-v8.ts'
import { collectionV3Snapshot, collectionV3BonusBps } from '../prestige/collections-v3.ts'
import { formatCompactUnits } from '../large-numbers.ts'
import { getFameShopOffers, type FameShopError, type FameShopPurchase } from '../prestige/shop.ts'

const props = defineProps<{
  state: CapitalState
  exactState?: V8CapitalState
  purchaseBoost: (id: string, currentLevel: number) => FameShopPurchase
}>()
const emit = defineEmits<{ back: [] }>()
const returnButton = ref<HTMLButtonElement | null>(null)
const notice = ref('')
const noticeError = ref(false)
const numeric = new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 2 })
const fame = (micros: number) => formatFameMicros(BigInt(Math.round(micros)))
const fameBalance = computed(() => props.exactState
  ? formatFameMicros(getExactAmount(props.exactState.prestige.fameMicros))
  : fame(props.state.prestige.fameMicros))
const percentage = (basisPoints: number) => numeric.format(basisPoints / 100) + ' %'
const offers = computed(() => props.exactState ? FAME_BOOSTS.map(boost => {
  const currentLevel = props.exactState!.prestige.boosts[boost.id]
  const nextCostFame = getV2NextFameBoostCost(boost.id, currentLevel)
  return {
    boostId: boost.id, currentLevel, maxLevel: 20 as const,
    currentBonusBps: currentLevel * FAME_BOOST_BPS_PER_LEVEL,
    nextBonusBps: nextCostFame === null ? null : (currentLevel + 1) * FAME_BOOST_BPS_PER_LEVEL,
    nextCostFame,
    canAfford: nextCostFame !== null &&
      getExactAmount(props.exactState!.prestige.fameMicros) >= BigInt(nextCostFame) * 1_000_000n,
  }
}) : getFameShopOffers(props.state))
const rows = computed(() => FAME_BOOSTS.map((boost, index) => ({
  boost, offer: offers.value[index]!, collectionBonus: props.exactState ?
    collectionV3BonusBps(collectionV3Snapshot(props.exactState.prestige.ownedCollectionIds), boost.id) :
    getBonusBreakdown(props.state, boost.id).collectionBps,
})))
const purchasedLevels = computed(() => offers.value.reduce((total, offer) => total + offer.currentLevel, 0))
const absolute = computed(() => getAbsolutePrestigeStatus(props.state))
const exactAbsolute = computed(() => props.exactState ? v8AbsoluteFameStatus(props.exactState) : null)
const absoluteUnlocked = computed(() => exactAbsolute.value?.unlocked ?? absolute.value.unlocked)
const absoluteCapped = computed(() => exactAbsolute.value?.capped ?? absolute.value.capped)
const factorText = computed(() => exactAbsolute.value ?
  '×' + formatFameFactor(exactAbsolute.value.factorUnits) + (exactAbsolute.value.capped ? ' · MAX' : '') :
  '×' + new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 6 }).format(absolute.value.factor) +
    (absolute.value.capped ? ' · MAX' : ''))
const capText = computed(() => exactAbsolute.value ?
  '×' + formatFameFactor(exactAbsolute.value.capUnits) :
  '×' + numeric.format(100 + (props.state.ascension?.progress.prestigeCount ?? 0)))
const fameStepsText = computed(() => exactAbsolute.value ?
  formatCompactUnits(exactAbsolute.value.fameSteps, 0, '') : numeric.format(absolute.value.fameSteps))
const nextStepText = computed(() => exactAbsolute.value ?
  formatFameMicros(exactAbsolute.value.nextStepAtFameMicros) : numeric.format(absolute.value.nextStepAtFame))
const exactShopBonus = (boost: FameBoostId, baseBps:number) => {
  const status=exactAbsolute.value
  if(!status || !props.exactState)return percentage(baseBps*absolute.value.factor)
  return formatExactBasisPoints(BigInt(baseBps)*status.factorUnits, FAME_FACTOR_SCALE)
}
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
          <strong><span aria-hidden="true">✦</span> {{ fameBalance }}</strong>
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
            <span v-if="absoluteUnlocked">Shop avec Prestige : <b>+{{ exactShopBonus(row.boost.id, row.offer.currentBonusBps) }}</b></span>
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
        <article class="absolute-prestige-card" :class="{ 'absolute-prestige-unlocked': absoluteUnlocked }"
          data-boost="absolute">
          <div class="absolute-prestige-heading">
            <div>
              <span class="prestige-eyebrow">✦ ULTIME AMÉLIORATION</span>
              <h3>Prestige absolu</h3>
            </div>
            <span class="absolute-prestige-state">{{ absoluteUnlocked ? 'DÉBLOQUÉ' : 'VERROUILLÉ' }}</span>
          </div>
          <p v-if="!absoluteUnlocked">
            Déblocage automatique et gratuit après les 120 niveaux du Fame Shop.
            Encore {{ remainingSteps }} {{ remainingSteps === 1 ? 'palier' : 'paliers' }} à acheter.
          </p>
          <template v-else>
            <strong class="absolute-prestige-factor">{{ factorText }}</strong>
            <p>Chaque tranche entière de 100 Fame <b>disponibles</b> multiplie uniquement les bonus du Fame Shop par ×1,01. Plafond actuel : <b>{{ capText }}</b> (100 + Prestiges terminés).</p>
            <div class="absolute-prestige-details">
              <span>{{ fameStepsText }} tranches actives</span>
              <span v-if="!absoluteCapped">Prochaine tranche : {{ nextStepText }} Fame</span>
              <span v-else>Plafond de sécurité atteint · Fame conservée</span>
            </div>
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
