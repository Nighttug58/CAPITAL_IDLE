<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  earnClick,
  getClickValue,
  getLevel,
  getNextLevelThreshold,
  getNextUpgrade,
  purchaseUpgrade,
  type GameState,
} from './game.ts'
import { loadGame, saveGame } from './persistence.ts'

const game = ref<GameState>(loadGame())
const level = computed(() => getLevel(game.value.lifetimeEarned))
const clickValue = computed(() => getClickValue(game.value.purchasedUpgrades))
const nextLevel = computed(() => getNextLevelThreshold(game.value.lifetimeEarned))
const nextUpgrade = computed(() => getNextUpgrade(game.value))
const upgradeUnlocked = computed(() => !!nextUpgrade.value && level.value >= nextUpgrade.value.requiredLevel)
const upgradeAffordable = computed(() => upgradeUnlocked.value && !!nextUpgrade.value && game.value.balance >= nextUpgrade.value.price)
const isFullscreen = ref(false)
const supportsFullscreen = typeof document !== 'undefined' && typeof document.documentElement.requestFullscreen === 'function'

const numberFormatter = new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 0 })
const formatMoney = (value: number) => `${numberFormatter.format(value)} $`

function click() {
  game.value = earnClick(game.value)
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
    // Le navigateur peut refuser le plein écran : aucun impact sur le jeu.
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
      <h1>CAPITAL_IDLE</h1>
      <button
        v-if="supportsFullscreen"
        class="fullscreen-button"
        type="button"
        :title="isFullscreen ? 'Quitter le plein écran' : 'Plein écran'"
        :aria-label="isFullscreen ? 'Quitter le plein écran' : 'Activer le plein écran'"
        @click="toggleFullscreen"
      >
        <svg v-if="!isFullscreen" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5" />
        </svg>
        <svg v-else width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path d="M3 8h5V3M21 8h-5V3M3 16h5v5M21 16h-5v5" />
        </svg>
      </button>
    </header>

    <main class="game-panel">
      <section class="balance-panel" aria-label="Argent disponible">
        <div class="field-label">SOLDE</div>
        <div class="balance-value" aria-live="off">{{ formatMoney(game.balance) }}</div>
      </section>

      <div class="stats-row">
        <div class="stat">
          <span class="field-label">NIVEAU</span>
          <strong>{{ level }}</strong>
        </div>
        <div class="stat stat-right">
          <span class="field-label">TOTAL GAGNÉ</span>
          <strong>{{ formatMoney(game.lifetimeEarned) }}</strong>
        </div>
      </div>

      <div class="next-level" aria-live="polite">
        {{ nextLevel === null ? 'Niveau maximum atteint' : `Prochain niveau : ${formatMoney(nextLevel)}` }}
      </div>

      <button class="click-button" type="button" @click="click">
        <span>CLIQUER</span>
        <small>+{{ formatMoney(clickValue) }} / clic</small>
      </button>

      <section class="upgrade-panel" aria-label="Amélioration du clic">
        <div class="upgrade-details">
          <span class="field-label">AMÉLIORATION</span>
          <strong v-if="nextUpgrade">{{ formatMoney(nextUpgrade.clickValue) }} / clic</strong>
          <strong v-else>MAXIMUM</strong>
        </div>
        <button
          class="upgrade-button"
          type="button"
          :disabled="!upgradeAffordable"
          @click="buy"
        >
          <template v-if="!nextUpgrade">TERMINÉ</template>
          <template v-else-if="!upgradeUnlocked">NIV. {{ nextUpgrade.requiredLevel }}</template>
          <template v-else>ACHETER · {{ formatMoney(nextUpgrade.price) }}</template>
        </button>
      </section>
    </main>
  </div>
</template>
