<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import type { CapitalState } from '../capital.ts'
import { getCapitalStatsOverview } from '../economy/stats-overview.ts'
import { ASCENSION_MIN_LEVEL, ASCENSION_MIN_WORTH_USD, eligiblePrestigeWorthFromOverview, previewPrestigePoints } from '../ascension/contracts.ts'
import { ASCENSION_UPGRADES } from '../ascension/catalog.ts'
import { ASCENSION_CATEGORIES, ASCENSION_PRESENTATION } from '../ascension/presentation.ts'
import { getAscensionOffers, type AscensionPurchase, type AscensionShopError } from '../ascension/shop.ts'
import type { AscensionError, AscensionResult } from '../ascension/engine.ts'
import type { AscensionAutomationSettings, AscensionMarketOrder } from '../ascension/contracts.ts'
import type { AutomationActionResult } from '../ascension/automation-orders.ts'
import AutomationPanel from './AutomationPanel.vue'
import { MARKET_SPEEDS, marketSpeed, frenzyActive, type MarketActionResult } from '../ascension/market-effects.ts'

const props = defineProps<{
  state: CapitalState
  purchaseUpgrade: (id: string, currentLevel: number) => AscensionPurchase
  performCycle: () => AscensionResult
  selectSpeed: (speed: number) => MarketActionResult
  activateFrenzy: () => MarketActionResult
  saveAutomation: (patch: Partial<AscensionAutomationSettings>) => AutomationActionResult
  createOrder: (order: Omit<AscensionMarketOrder,'id'|'createdAtRealMs'>) => AutomationActionResult
  cancelOrder: (id: number) => AutomationActionResult
}>()
const emit = defineEmits<{ back: [] }>()

const returnButton = ref<HTMLButtonElement | null>(null)
const confirmField = ref<HTMLInputElement | null>(null)
const confirming = ref(false)
const confirmText = ref('')
const busy = ref(false)
const notice = ref('')
const noticeError = ref(false)

const number = new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 2 })
const integer = new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 0 })
const cash = (amount: number) => number.format(amount) + ' $'
const fmt = (value: number) => integer.format(value)
const overview = computed(() => getCapitalStatsOverview(props.state))
const worth = computed(() => eligiblePrestigeWorthFromOverview(overview.value))
const level = computed(() => overview.value.level)
const pointPreview = computed(() => previewPrestigePoints(worth.value ?? 0, level.value))
const progress = computed(() => props.state.ascension.progress)
const currentSpeed = computed(() => marketSpeed(props.state))
const unlockedSpeedLevel = computed(() => progress.value.upgradeLevels['time-accelerator'])
const hasFrenzy = computed(() => progress.value.upgradeLevels['market-frenzy'] > 0)
const frenzyOn = computed(() => frenzyActive(props.state, props.state.trading.dividendLastPaidAt))
const frenzyRemaining = computed(() => Math.max(0, (props.state.ascension.run.frenzyReadyAtRealMs ?? 0) - props.state.trading.dividendLastPaidAt))
const frenzyTime = computed(() => Math.ceil(frenzyRemaining.value / 60_000))
const offers = computed(() => getAscensionOffers(props.state))
const activeUpgrades = ASCENSION_UPGRADES.filter(item => item.id !== 'market-liquidity' && item.id !== 'liquidity-recovery')
const totalLevels = activeUpgrades.reduce((sum, item) => sum + item.maxLevel, 0)
const purchasedLevels = computed(() => activeUpgrades.reduce((sum, item) => sum + progress.value.upgradeLevels[item.id], 0))
const spentPoints = computed(() => progress.value.lifetimePoints - progress.value.availablePoints)
const toGo = computed(() => totalLevels - purchasedLevels.value)
const affordPrestige = computed(() => level.value >= ASCENSION_MIN_LEVEL &&
  worth.value !== null && worth.value >= ASCENSION_MIN_WORTH_USD)
const worthProgress = computed(() => Math.min(100, Math.max(0, (worth.value ?? 0) / ASCENSION_MIN_WORTH_USD * 100)))
const sections = computed(() => ASCENSION_CATEGORIES.map(category => ({
  ...category,
  rows: ASCENSION_PRESENTATION.filter(item => item.category === category.id && activeUpgrades.some(def => def.id === item.id)).map(item => ({
    item,
    def: ASCENSION_UPGRADES.find(def => def.id === item.id)!,
    offer: offers.value.find(offer => offer.id === item.id)!,
  })),
})))

const shopErrors: Record<AscensionShopError, string> = {
  'unknown-upgrade': 'Amélioration introuvable.',
  'invalid-state': 'Les points Prestige enregistrés sont incohérents.',
  'stale-level': 'Ce niveau a déjà changé : vérifie le prix actualisé.',
  'max-level': 'Cette amélioration est au niveau maximum.',
  'insufficient-points': 'Points Prestige insuffisants.',
  'storage-error': 'Sauvegarde impossible : aucun PP n’a été dépensé.',
}
const cycleErrors: Record<AscensionError, string> = {
  'invalid-clock': 'Horloge incohérente. Réessaie une fois le jeu synchronisé.',
  'pending-market-replay': 'Le marché et les dividendes terminent leur rattrapage. Réessaie dans un instant.',
  'insufficient-level': 'Le niveau 100 est nécessaire pour chaque Prestige.',
  'insufficient-worth': 'Il faut au moins 100 millions $ de patrimoine éligible.',
  'money-overflow': 'Montants ou calcul économique non représentables. Le cycle est conservé.',
  'storage-error': 'La sauvegarde a échoué : ton empire et tes PP restent inchangés.',
}

function buy(id: string, expected: number) {
  if (busy.value || confirming.value) return
  busy.value = true
  try {
    const result = props.purchaseUpgrade(id, expected)
    noticeError.value = !result.ok
    const label = ASCENSION_PRESENTATION.find(row => row.id === id)?.label ?? id
    notice.value = result.ok
      ? label + ' : niveau ' + result.receipt.newLevel + ' acheté pour ' + fmt(result.receipt.costPoints) + ' PP.'
      : shopErrors[result.error]
  } finally { busy.value = false }
}

function changeMarketSpeed(speed: number) {
  if (busy.value || confirming.value) return
  const result = props.selectSpeed(speed)
  noticeError.value = !result.ok
  notice.value = result.ok ? 'Vitesse du marché : ×' + speed + ' activée.'
    : result.error === 'locked' ? 'Cette vitesse doit être débloquée dans la boutique.'
    : result.error === 'pending-replay' ? 'Le marché doit finir son rattrapage avant de changer la vitesse.'
    : 'Impossible de sauvegarder la nouvelle vitesse.'
}
function launchFrenzy() {
  if (busy.value || confirming.value) return
  const result = props.activateFrenzy()
  noticeError.value = !result.ok
  notice.value = result.ok ? 'Frénésie activée : news ±50 % pendant 60 secondes réelles.'
    : result.error === 'cooldown' ? 'Le pouvoir est encore en recharge.'
    : result.error === 'locked' ? 'Achète Frénésie boursière pour débloquer le pouvoir.'
    : result.error === 'pending-replay' ? 'Le marché doit finir son rattrapage avant d’activer le pouvoir.'
    : 'Pouvoir temporairement indisponible.'
}

function openConfirmation() {
  if (!affordPrestige.value || busy.value) return
  notice.value = ''
  confirmText.value = ''
  confirming.value = true
  void nextTick(() => confirmField.value?.focus())
}

function closeConfirmation() {
  if (busy.value) return
  confirming.value = false
  confirmText.value = ''
  void nextTick(() => returnButton.value?.focus())
}

function confirmPrestige() {
  if (busy.value || !confirming.value || confirmText.value !== 'PRESTIGE') return
  busy.value = true
  try {
    const result = props.performCycle()
    noticeError.value = !result.ok
    notice.value = result.ok
      ? 'Prestige n°' + fmt(result.receipt.cycle) + ' réalisé : +' + fmt(result.receipt.earnedPoints) +
        ' PP permanents.' + (result.receipt.taxesSettledCents > 0
          ? ' Impôts soldés : ' + cash(result.receipt.taxesSettledCents / 100) + '.' : '')
      : cycleErrors[result.error]
    if (result.ok) {
      confirming.value = false
      confirmText.value = ''
      void nextTick(() => returnButton.value?.focus())
    }
  } finally { busy.value = false }
}

function keyboard(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  event.preventDefault()
  if (confirming.value) closeConfirmation()
  else if (!busy.value) emit('back')
}

onMounted(() => {
  window.addEventListener('keydown', keyboard)
  void nextTick(() => returnButton.value?.focus())
})
onUnmounted(() => window.removeEventListener('keydown', keyboard))
</script>

<template>
  <main class="ascension-screen" aria-label="Boutique Prestige" id="prestige-shop">
    <header class="ascension-page-header">
      <button ref="returnButton" type="button" class="ascension-return"
        aria-label="Retour à l'accueil depuis Prestige" @click="emit('back')">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M19 12H5m7 7-7-7 7-7"/>
        </svg>
        Accueil
      </button>
      <div>
        <span class="ascension-eyebrow">EMPIRE FINANCIER · PROGRESSION PERMANENTE</span>
        <h1>Prestige</h1>
        <p>Réinitialise ton empire pour obtenir des Points de Prestige et débloquer des mécaniques inédites.</p>
      </div>
    </header>

    <section class="ascension-summary" aria-label="Points et cycles de Prestige">
      <div><span>POINTS DISPONIBLES</span><strong>{{ fmt(progress.availablePoints) }} <small>PP</small></strong></div>
      <div><span>CYCLES PRESTIGE</span><strong>{{ fmt(progress.prestigeCount) }}</strong></div>
      <div><span>AMÉLIORATIONS</span><strong>{{ purchasedLevels }} / {{ totalLevels }}</strong></div>
      <div><span>PP DÉPENSÉS</span><strong>{{ fmt(spentPoints) }}</strong></div>
    </section>

    <div class="ascension-scroll">
      <section class="ascension-prestige-panel" aria-label="Effectuer un nouveau Prestige">
        <div class="ascension-panel-title">
          <div><span class="ascension-eyebrow">PROCHAIN CYCLE</span><h2>Recommencer plus fort</h2></div>
          <strong>+{{ fmt(pointPreview) }} PP</strong>
        </div>
        <div class="ascension-checks">
          <div><span>Niveau du cycle</span><strong :class="{ 'ascension-good': level >= ASCENSION_MIN_LEVEL }">{{ level }} / {{ ASCENSION_MIN_LEVEL }}</strong></div>
          <div><span>Patrimoine éligible (net des taxes, hors collections)</span><strong>{{ worth === null ? 'Non disponible' : cash(worth) }}</strong></div>
          <div><span>Seuil de patrimoine</span><strong>{{ cash(ASCENSION_MIN_WORTH_USD) }}</strong></div>
          <div><span>Taxes soldées automatiquement au Prestige</span><strong :class="{ 'ascension-good': state.fiscal.taxesDueCents === 0 }">{{ cash(state.fiscal.taxesDueCents / 100) }}</strong></div>
        </div>
        <div class="ascension-worth-track" role="progressbar" aria-label="Progression du patrimoine Prestige"
          :aria-valuenow="Math.round(worthProgress)" aria-valuemin="0" aria-valuemax="100">
          <span :style="{ width: worthProgress + '%' }"></span>
        </div>
        <p class="ascension-help">Aucun paiement manuel nécessaire : les taxes dues sont prélevées à la confirmation. Elles sont déjà déduites du patrimoine servant au calcul des PP. Le calendrier fiscal de 72 h réelles continue sans remise à zéro.</p>
        <button type="button" class="ascension-reset-launch" :disabled="!affordPrestige || busy"
          @click="openConfirmation">
          {{ affordPrestige ? 'EFFECTUER LE PRESTIGE' : 'PRESTIGE VERROUILLÉ' }}
        </button>
      </section>

      <section class="ascension-powers" aria-label="Commandes Prestige des marchés">
        <div class="ascension-panel-title"><div><span class="ascension-eyebrow">BONUS ACTIFS · TRADING</span><h2>Contrôles du marché</h2></div></div>
        <p>L’accélérateur modifie uniquement la vitesse des cours. Impôts, dividendes, news et cooldowns continuent en temps réel.</p>
        <div class="ascension-speed-row" role="group" aria-label="Vitesse du marché">
          <button v-for="(speed, index) in MARKET_SPEEDS" :key="speed" type="button"
            class="ascension-speed-button" :class="{ 'is-selected': currentSpeed === speed }"
            :aria-pressed="currentSpeed === speed" :disabled="index > unlockedSpeedLevel || busy || confirming"
            @click="changeMarketSpeed(speed)">×{{ speed }}</button>
        </div>
        <div class="ascension-frenzy-row">
          <div><strong>Frénésie boursière</strong><small>{{ frenzyOn ? 'ACTIF · news plus fortes' : hasFrenzy ? '60 secondes réelles · recharge 30 minutes' : 'Disponible après achat de l’upgrade' }}</small></div>
          <button type="button" class="ascension-frenzy-button"
            :disabled="!hasFrenzy || frenzyRemaining > 0 || busy || confirming"
            @click="launchFrenzy">{{ frenzyOn ? 'ACTIF' : frenzyRemaining > 0 ? frenzyTime + ' min' : 'ACTIVER' }}</button>
        </div>
      </section>

      <AutomationPanel :state="state" :save-automation="saveAutomation"
        :create-order="createOrder" :cancel-order="cancelOrder" />
      <section class="ascension-shop-heading" aria-label="Catalogue des améliorations Prestige">
        <div><span class="ascension-eyebrow">BOUTIQUE PERMANENTE</span><h2>Améliorations Prestige</h2></div>
        <span>{{ toGo }} niveaux restants</span>
      </section>

      <section v-for="section in sections" :key="section.id" class="ascension-category"
        :aria-label="section.label">
        <h3>{{ section.label }}</h3>
        <article v-for="row in section.rows" :key="row.item.id" class="ascension-upgrade"
          :data-upgrade="row.item.id">
          <div class="ascension-upgrade-top">
            <div><strong>{{ row.item.label }}</strong><p>{{ row.item.description }}</p></div>
            <span class="ascension-upgrade-level">NIV. {{ row.offer.currentLevel }}/{{ row.def.maxLevel }}</span>
          </div>
          <div class="ascension-upgrade-track" role="progressbar" :aria-label="'Niveau de ' + row.item.label"
            :aria-valuenow="row.offer.currentLevel" aria-valuemin="0" :aria-valuemax="row.def.maxLevel">
            <span :style="{ width: (row.offer.currentLevel / row.def.maxLevel * 100) + '%' }"></span>
          </div>
          <div class="ascension-upgrade-effect">
            <span>Au maximum : <strong>{{ row.item.effect }}</strong></span>
            <span class="ascension-phase">Effet disponible</span>
          </div>
          <div class="ascension-upgrade-footer">
            <span class="ascension-upgrade-cost">{{ row.offer.nextCost === null ? 'TERMINÉ' : fmt(row.offer.nextCost) + ' PP · prochain niveau' }}</span>
            <button type="button" class="ascension-buy" :disabled="!row.offer.canAfford || busy || confirming"
              :aria-label="'Acheter ' + row.item.label + ' niveau ' + (row.offer.currentLevel + 1)"
              @click="buy(row.item.id, row.offer.currentLevel)">
              {{ row.offer.nextCost === null ? 'MAX' : row.offer.canAfford ? 'ACHETER' : 'PP INSUFF.' }}
            </button>
          </div>
        </article>
      </section>
      <p class="ascension-endnote">Les achats sont permanents et non remboursables. Les améliorations débloquées fonctionnent dès leur achat et leur activation éventuelle ; le Fame et ses bonus restent distincts.</p>
    </div>

    <footer class="ascension-footer">
      <p v-if="notice" class="ascension-notice" :class="{ 'is-error': noticeError }" role="status">{{ notice }}</p>
      <p v-else>Prestige obtenu : {{ fmt(progress.lifetimePoints) }} PP au total. Les collections et les boosts Fame sont conservés.</p>
    </footer>

    <div v-if="confirming" class="ascension-confirm-overlay" @click.self="closeConfirmation">
      <section class="ascension-confirm" role="dialog" aria-modal="true" aria-labelledby="ascension-confirm-title">
        <div class="ascension-confirm-body">
          <span class="ascension-eyebrow">CONFIRMATION IRRÉVERSIBLE</span>
          <h2 id="ascension-confirm-title">Confirmer le Prestige ?</h2>
          <p>Tu vas recommencer au <strong>niveau 1</strong> et perdre le cash, les actions, les cryptos, les entreprises et les améliorations de clic du cycle.</p>
          <p>La <strong>Fame</strong>, les collections, leurs bonus, les PP et les améliorations Prestige sont conservés. Les échéances fiscales continuent.</p>
           <p v-if="state.fiscal.taxesDueCents > 0">Les taxes actuelles de <strong>{{ cash(state.fiscal.taxesDueCents / 100) }}</strong> seront réglées automatiquement dans l’opération de Prestige. Aucun impôt n’est effacé.</p>
          <div class="ascension-confirm-reward">Récompense de ce cycle : <strong>+{{ fmt(pointPreview) }} PP</strong></div>
          <p v-if="notice && noticeError" class="ascension-modal-error" role="alert">{{ notice }}</p>
          <label for="ascension-confirm-input">Écris <strong>PRESTIGE</strong> pour confirmer :</label>
          <input id="ascension-confirm-input" ref="confirmField" v-model="confirmText" type="text"
            autocomplete="off" spellcheck="false" maxlength="8" :disabled="busy" />
        </div>
        <div class="ascension-confirm-actions">
          <button type="button" class="ascension-cancel" :disabled="busy" @click="closeConfirmation">Annuler</button>
          <button type="button" class="ascension-confirm-submit" :disabled="busy || confirmText !== 'PRESTIGE'"
            @click="confirmPrestige">Confirmer le Prestige</button>
        </div>
      </section>
    </div>
  </main>
</template>
