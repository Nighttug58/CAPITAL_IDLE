<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  LEVEL_THRESHOLDS,
  getClickValue,
  getLevel,
  getNextLevelThreshold,
  getNextUpgrade,
  purchaseUpgrade,
  type GameState,
} from './game.ts'
import { loadCapitalState, replaceCapitalSave, saveCapitalState } from './persistence.ts'
import { createCapitalState } from './capital.ts'
import { createSaveExport, exportFileName } from './save-transfer.ts'
import type { CapitalState } from './capital.ts'
import { createMarketRuntime } from './trading/runtime.ts'
import { buyAsset, sellAsset } from './trading/trades.ts'
import type { TradeResult, TradeSide } from './trading/trades.ts'
import TradingScreen from './components/TradingScreen.vue'
import EnterpriseScreen from './components/EnterpriseScreen.vue'
import StatsScreen from './components/StatsScreen.vue'
import { advanceFiscalEconomy, payFiscalBalanceNow } from './economy/clock.ts'
import type { EarlyTaxPaymentResult } from './economy/fiscal.ts'
import { earnCapitalClick, recordActivePlay } from './economy/stats-ledger.ts'
import { buyEnterprise, upgradeEnterprise } from './economy/enterprises.ts'
import type { EnterpriseAction, EnterpriseResult } from './economy/enterprises.ts'

interface FloatingGain {
  id: number
  amount: number
  x: number
  y: number
}

const capital = ref<CapitalState>(loadCapitalState())
const game = computed<GameState>({
  get: () => capital.value.game,
  set: (updated) => { capital.value = { ...capital.value, game: updated } },
})
const level = computed(() => getLevel(game.value.lifetimeEarned))
const clickValue = computed(() => getClickValue(game.value.purchasedUpgrades))
const nextLevel = computed(() => getNextLevelThreshold(game.value.lifetimeEarned))
const nextUpgrade = computed(() => getNextUpgrade(game.value))
const upgradeUnlocked = computed(() => !!nextUpgrade.value && level.value >= nextUpgrade.value.requiredLevel)
const upgradeAffordable = computed(() => upgradeUnlocked.value && !!nextUpgrade.value && game.value.balance >= nextUpgrade.value.price)
const page = ref<'home' | 'trading' | 'enterprises' | 'stats'>('home')
const isFullscreen = ref(false)
const supportsFullscreen = typeof document !== 'undefined' && typeof document.documentElement.requestFullscreen === 'function'
const floatingGains = ref<FloatingGain[]>([])
const tapAnimationId = ref(0)
let nextGainId = 0
let marketRuntime: ReturnType<typeof createMarketRuntime> | null = null
let applyingMarket = false
let activeSince: number | null = null

const progressStart = computed(() => LEVEL_THRESHOLDS[level.value - 1] ?? 0)
const progressPercent = computed(() => {
  if (nextLevel.value === null) return 100
  const range = nextLevel.value - progressStart.value
  return range > 0 ? Math.min(100, Math.max(0, ((game.value.lifetimeEarned - progressStart.value) / range) * 100)) : 0
})

const numberFormatter = new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 2 })
const formatMoney = (value: number) => `${numberFormatter.format(value)} $`

function click(event: MouseEvent) {
  const updated = earnCapitalClick(capital.value)
  if (updated === capital.value) return
  const gained = updated.game.balance - capital.value.game.balance
  applyingMarket = true
  try { capital.value = updated } finally { applyingMarket = false }
  persist()
  if (gained <= 0) return

  const target = event.currentTarget
  if (!(target instanceof HTMLElement)) return
  const bounds = target.getBoundingClientRect()
  const pointerClick = event.detail !== 0
  const pointerX = pointerClick ? event.clientX - bounds.left : bounds.width / 2
  const pointerY = pointerClick ? event.clientY - bounds.top : bounds.height / 2

  // Le texte reste lisible même si le joueur touche tout près du bord.
  const x = Math.max(19, Math.min(81, (pointerX / Math.max(bounds.width, 1)) * 100))
  const y = Math.max(24, Math.min(74, (pointerY / Math.max(bounds.height, 1)) * 100))
  floatingGains.value = [
    ...floatingGains.value.slice(-11),
    { id: ++nextGainId, amount: gained, x, y },
  ]
  // Relance le rebond visuel après chaque clic, même si le doigt est déjà relevé.
  tapAnimationId.value++
}

function removeFloatingGain(id: number) {
  floatingGains.value = floatingGains.value.filter((gain) => gain.id !== id)
}

function buy() {
  game.value = purchaseUpgrade(game.value)
}

// Achat/vente déclenchés par l'UI : solde et portefeuille mis à jour ensemble.
// La validation vient du moteur métier, jamais d'une formule du composant Vue.
function executeTrade(side: TradeSide, assetId: string, quantity: number): TradeResult {
  settleEconomyNow()
  const result = side === 'buy'
    ? buyAsset(capital.value, assetId, quantity)
    : sellAsset(capital.value, assetId, quantity)
  if (result.ok) {
    capital.value = result.state
    persist()
  }
  return result
}

function executeEnterprise(action: EnterpriseAction, id: string): EnterpriseResult {
  settleEconomyNow()
  const result = action === 'buy'
    ? buyEnterprise(capital.value, id)
    : upgradeEnterprise(capital.value, id)
  if (result.ok) {
    // Une seule écriture : ne pas déclencher en parallèle le watcher du clicker.
    applyingMarket = true
    try { capital.value = result.state } finally { applyingMarket = false }
    persist()
    marketRuntime?.wake()
  }
  return result
}

function persist() {
  // Une seule horloge (celle du jeu) ; le temps masqué ne compte jamais dans
  // le temps de jeu actif. Aucun setInterval additionnel pour la page Stats.
  if (activeSince !== null) {
    const now = Date.now()
    const withSession = recordActivePlay(capital.value, Math.max(0, now - activeSince))
    activeSince = now
    if (withSession !== capital.value) {
      applyingMarket = true
      try { capital.value = withSession } finally { applyingMarket = false }
    }
  }
  saveCapitalState(capital.value)
}

function settleEconomyNow() {
  const updated = advanceFiscalEconomy(capital.value, Date.now())
  if (updated !== capital.value) {
    applyingMarket = true
    try { capital.value = updated } finally { applyingMarket = false }
    persist()
  }
}

function payTaxes(): EarlyTaxPaymentResult {
  const payment = payFiscalBalanceNow(capital.value, Date.now())
  if (payment.state !== capital.value) {
    applyingMarket = true
    try { capital.value = payment.state } finally { applyingMarket = false }
    persist()
    marketRuntime?.wake()
  }
  return payment
}

/**
 * Le runtime est stoppé avant une importation ou un reset. Son éventuelle
 * dernière sauvegarde concerne encore l'ancienne partie ; l'écriture
 * atomique v5 est donc faite seulement APRÈS cet arrêt.
 */
function startMarketRuntime() {
  marketRuntime = createMarketRuntime({
    getState: () => capital.value,
    setState: (updated) => {
      applyingMarket = true
      try { capital.value = updated } finally { applyingMarket = false }
    },
    persist,
  })
  marketRuntime.start()
  if (document.hidden) marketRuntime.pause()
}

function replaceWholeSave(next: CapitalState): boolean {
  marketRuntime?.stop()
  marketRuntime = null
  if (!replaceCapitalSave(next)) {
    startMarketRuntime() // échec d'écriture : continuer exactement l'ancienne partie
    return false
  }
  applyingMarket = true
  try {
    capital.value = next
    floatingGains.value = []
    tapAnimationId.value = 0
    nextGainId = 0
  } finally { applyingMarket = false }
  activeSince = document.hidden ? null : Date.now()
  startMarketRuntime() // rattrapage horodaté de la sauvegarde importée
  return true
}

function exportSave(): boolean {
  let url: string | null = null
  try {
    settleEconomyNow()
    persist()
    const at = Date.now()
    const json = createSaveExport(capital.value, at)
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
    url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = exportFileName(at)
    document.body.appendChild(link)
    try { link.click() } finally { link.remove() }
    const exportedUrl = url
    setTimeout(() => URL.revokeObjectURL(exportedUrl), 2_000)
    return true
  } catch {
    if (url !== null) URL.revokeObjectURL(url)
    return false
  }
}
function importSave(next: CapitalState): boolean {
  return replaceWholeSave(next)
}
function resetSave(): boolean {
  return replaceWholeSave(createCapitalState(undefined, Date.now()))
}

function syncMarketVisibility() {
  if (document.hidden) {
    marketRuntime?.pause()
    persist()
    activeSince = null
  } else {
    activeSince = Date.now()
    marketRuntime?.resume()
  }
}

function syncMarketPageShow() {
  activeSince = document.hidden ? null : Date.now()
  marketRuntime?.resume()
}

function syncMarketPageHide() {
  marketRuntime?.pause()
  persist()
  activeSince = null
}

function syncFullscreen() {
  isFullscreen.value = !!document.fullscreenElement
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen()
    } else {
      await document.documentElement.requestFullscreen()
    }
  } catch {
    // Le plein écran est facultatif, et peut être refusé par le navigateur.
  }
}

// Les clics sont sauvegardés aussitôt ; les centaines de ticks de rattrapage
// ne déclenchent pas une écriture localStorage à chaque tranche.
watch(game, () => { if (!applyingMarket) persist() }, { flush: 'sync' })

onMounted(() => {
  activeSince = document.hidden ? null : Date.now()
  startMarketRuntime()

  document.addEventListener('fullscreenchange', syncFullscreen)
  document.addEventListener('visibilitychange', syncMarketVisibility)
  window.addEventListener('pagehide', syncMarketPageHide)
  window.addEventListener('pageshow', syncMarketPageShow)
})

onUnmounted(() => {
  document.removeEventListener('fullscreenchange', syncFullscreen)
  document.removeEventListener('visibilitychange', syncMarketVisibility)
  window.removeEventListener('pagehide', syncMarketPageHide)
  window.removeEventListener('pageshow', syncMarketPageShow)
  marketRuntime?.stop()
  marketRuntime = null
  persist()
  activeSince = null
})
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="brand" aria-label="CAPITAL_IDLE">
        <span class="brand-mark" aria-hidden="true">C</span>
        <span class="brand-name">CAPITAL<span>IDLE</span></span>
      </div>
      <button
        v-if="supportsFullscreen"
        class="fullscreen-button"
        type="button"
        :title="isFullscreen ? 'Quitter le plein écran' : 'Plein écran'"
        :aria-label="isFullscreen ? 'Quitter le plein écran' : 'Activer le plein écran'"
        @click="toggleFullscreen"
      >
        <svg v-if="!isFullscreen" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true">
          <path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5" />
        </svg>
        <svg v-else width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true">
          <path d="M3 8h5V3M21 8h-5V3M3 16h5v5M21 16h-5v5" />
        </svg>
      </button>
    </header>

    <main v-show="page === 'home'" id="accueil" class="home-screen">
      <section class="wallet" aria-label="Votre argent">
        <div class="eyebrow wallet-label"><span class="gold-dot" aria-hidden="true"></span> SOLDE DISPONIBLE</div>
        <div class="balance-value">{{ numberFormatter.format(game.balance) }} <span>$</span></div>
        <div class="lifetime-value">Total gagné <span>{{ formatMoney(game.lifetimeEarned) }}</span></div>
      </section>

      <section class="level-panel" aria-label="Progression du niveau">
        <div class="level-heading">
          <span class="level-label">NIVEAU <strong>{{ level }}</strong></span>
          <span class="level-goal">{{ nextLevel === null ? 'NIVEAU MAX' : `SUIVANT · ${formatMoney(nextLevel)}` }}</span>
        </div>
        <div
          class="progress-frame"
          role="progressbar"
          :aria-label="`Progression du niveau ${level}`"
          :aria-valuenow="Math.round(progressPercent)"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <div class="progress-track">
            <div class="progress-fill" :style="{ width: `${progressPercent}%` }"></div>
          </div>
        </div>
      </section>

      <button
        class="tap-zone"
        type="button"
        :aria-label="`Gagner ${formatMoney(clickValue)} en cliquant`"
        @click="click"
      >
        <span class="tap-content">
          <span :key="tapAnimationId" class="banknotes" :class="{ 'banknotes-popping': tapAnimationId > 0 }" aria-hidden="true">💵</span>
          <span class="tap-action">TOUCHER POUR GAGNER</span>
          <span class="tap-reward">+ {{ formatMoney(clickValue) }} <span>/ CLIC</span></span>
        </span>
        <span
          v-for="gain in floatingGains"
          :key="gain.id"
          class="floating-gain"
          :style="{ left: `${gain.x}%`, top: `${gain.y}%` }"
          aria-hidden="true"
          @animationend="removeFloatingGain(gain.id)"
        >+{{ formatMoney(gain.amount) }}</span>
      </button>

      <section class="upgrade-card" aria-label="Amélioration du clic">
        <div class="upgrade-copy">
          <span class="eyebrow">PROCHAINE AMÉLIORATION</span>
          <strong>{{ nextUpgrade ? '+1 $ / clic' : 'NIVEAU MAX' }}</strong>
          <span class="upgrade-price">{{ nextUpgrade ? `Coût · ${formatMoney(nextUpgrade.price)}` : 'Tout est débloqué' }}</span>
        </div>
        <button class="upgrade-button" type="button" :disabled="!upgradeAffordable" @click="buy">
          {{ !nextUpgrade ? 'MAX' : !upgradeUnlocked ? `NIV. ${nextUpgrade.requiredLevel}` : 'ACHETER' }}
          <svg v-if="upgradeAffordable" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
        </button>
      </section>
    </main>

    <TradingScreen v-show="page === 'trading'" :state="capital" :execute-trade="executeTrade" />
    <EnterpriseScreen v-show="page === 'enterprises'" :state="capital" :execute-enterprise="executeEnterprise" />
    <StatsScreen v-show="page === 'stats'" :state="capital" :pay-taxes="payTaxes"
      :export-save="exportSave" :import-save="importSave" :reset-save="resetSave" />

    <nav class="bottom-nav" aria-label="Navigation principale">
      <button type="button" class="nav-home" :class="{ 'is-active': page === 'home' }"
        :aria-current="page === 'home' ? 'page' : undefined" @click="page = 'home'">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />
        </svg>
        <span>Accueil</span>
      </button>
      <button type="button" class="nav-home" :class="{ 'is-active': page === 'trading' }"
        :aria-current="page === 'trading' ? 'page' : undefined" @click="page = 'trading'">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3 17l6-6 4 4 8-9M16 6h5v5" />
          <path d="M3 21h18" />
        </svg>
        <span>Trading</span>
      </button>
      <button type="button" class="nav-home" :class="{ 'is-active': page === 'enterprises' }"
        :aria-current="page === 'enterprises' ? 'page' : undefined" @click="page = 'enterprises'">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="3" y="10" width="18" height="11" rx="1" />
          <path d="M3 10 6 4h12l3 6M9 21v-7h6v7M3 10h18" />
        </svg>
        <span>Entreprises</span>
      </button>
      <button type="button" class="nav-home" :class="{ 'is-active': page === 'stats' }"
        :aria-current="page === 'stats' ? 'page' : undefined" @click="page = 'stats'">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3 3v18h18M7 15l4-4 3 2 5-6" />
        </svg>
        <span>Stats</span>
      </button>
    </nav>
  </div>
</template>
