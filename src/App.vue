<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  LEVEL_THRESHOLDS,
  earnClick,
  getClickValue,
  getLevel,
  getNextLevelThreshold,
  getNextUpgrade,
  purchaseUpgrade,
  type GameState,
} from './game.ts'
import { loadGame, saveGame } from './persistence.ts'

interface FloatingGain {
  id: number
  amount: number
  x: number
  y: number
}

const game = ref<GameState>(loadGame())
const level = computed(() => getLevel(game.value.lifetimeEarned))
const clickValue = computed(() => getClickValue(game.value.purchasedUpgrades))
const nextLevel = computed(() => getNextLevelThreshold(game.value.lifetimeEarned))
const nextUpgrade = computed(() => getNextUpgrade(game.value))
const upgradeUnlocked = computed(() => !!nextUpgrade.value && level.value >= nextUpgrade.value.requiredLevel)
const upgradeAffordable = computed(() => upgradeUnlocked.value && !!nextUpgrade.value && game.value.balance >= nextUpgrade.value.price)
const isFullscreen = ref(false)
const supportsFullscreen = typeof document !== 'undefined' && typeof document.documentElement.requestFullscreen === 'function'
const floatingGains = ref<FloatingGain[]>([])
let nextGainId = 0

const progressStart = computed(() => LEVEL_THRESHOLDS[level.value - 1] ?? 0)
const progressPercent = computed(() => {
  if (nextLevel.value === null) return 100
  const range = nextLevel.value - progressStart.value
  return range > 0 ? Math.min(100, Math.max(0, ((game.value.lifetimeEarned - progressStart.value) / range) * 100)) : 0
})

const numberFormatter = new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 0 })
const formatMoney = (value: number) => `${numberFormatter.format(value)} $`

function click(event: MouseEvent) {
  const previousBalance = game.value.balance
  game.value = earnClick(game.value)
  const gained = game.value.balance - previousBalance
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
}

function removeFloatingGain(id: number) {
  floatingGains.value = floatingGains.value.filter((gain) => gain.id !== id)
}

function buy() {
  game.value = purchaseUpgrade(game.value)
}

function persist() {
  saveGame(game.value)
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

watch(game, persist, { flush: 'sync' })

onMounted(() => {
  document.addEventListener('fullscreenchange', syncFullscreen)
  document.addEventListener('visibilitychange', persist)
})

onUnmounted(() => {
  document.removeEventListener('fullscreenchange', syncFullscreen)
  document.removeEventListener('visibilitychange', persist)
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

    <main id="accueil" class="home-screen">
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
          <span class="banknotes" aria-hidden="true">💵</span>
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

    <nav class="bottom-nav" aria-label="Navigation principale">
      <a href="#accueil" class="nav-home" aria-current="page">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" />
        </svg>
        <span>Accueil</span>
      </a>
    </nav>
  </div>
</template>
