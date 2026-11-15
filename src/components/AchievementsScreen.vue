<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import type { CapitalState } from '../capital.ts'
import { ACHIEVEMENTS, getAchievementOffers, type AchievementClaimResult } from '../achievements.ts'

const props = defineProps<{
  state: CapitalState
  claimReward: (id: string) => AchievementClaimResult
}>()
const emit = defineEmits<{ back: [] }>()
const backButton = ref<HTMLButtonElement | null>(null)
const notice = ref('')
const noticeError = ref(false)
const offers = computed(() => getAchievementOffers(props.state))
const rows = computed(() => ACHIEVEMENTS.map(group => ({
  ...group,
  progress: offers.value.find(offer => offer.group === group.id)?.progress ?? 0,
  tiers: offers.value.filter(offer => offer.group === group.id),
})))
const claimed = computed(() => offers.value.filter(offer => offer.claimed).length)
const claimable = computed(() => offers.value.filter(offer => offer.claimable).length)
const total = computed(() => offers.value.length)
const numeric = new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 2 })
const cash = (cents: number) => numeric.format(cents / 100) + ' $'
const target = (value: number, unit: string) => numeric.format(value) + (unit === '$' ? ' $' : ' ' + unit)

function claim(id: string) {
  const result = props.claimReward(id)
  noticeError.value = !result.ok
  notice.value = result.ok
    ? 'Cadeau récupéré : +' + cash(result.rewardCents) + ' !'
    : result.error === 'storage-error' ? 'Sauvegarde impossible. Aucun cadeau versé.'
      : result.error === 'money-overflow' ? 'Solde trop élevé pour recevoir ce cadeau.'
        : 'Ce cadeau est indisponible ou déjà récupéré.'
}
onMounted(() => { void nextTick(() => backButton.value?.focus()) })
</script>

<template>
  <main id="achievements" class="achievements-screen" aria-label="Achievements et récompenses">
    <header class="achievements-header">
      <button ref="backButton" class="achievements-back" type="button" @click="emit('back')">
        <span aria-hidden="true">←</span> Accueil
      </button>
      <div class="achievements-heading">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <circle cx="12" cy="8" r="5"/><path d="m8.3 11.3-1.1 9 4.8-2.9 4.8 2.9-1.1-9"/>
        </svg>
        <div><span class="eyebrow">CADEAUX ET PROGRESSION</span><h1>Achievements</h1></div>
      </div>
      <p>Atteins des paliers et récupère leurs récompenses en cash. Ta progression existante est prise en compte.</p>
      <div class="achievements-summary">
        <span><strong>{{ claimed }} / {{ total }}</strong> récompenses récupérées</span>
        <span class="achievements-ready"><strong>{{ claimable }}</strong> à récupérer</span>
      </div>
      <p v-if="notice" class="achievements-notice" :class="{ 'is-error': noticeError }" role="status">{{ notice }}</p>
    </header>
    <div class="achievements-content">
      <section v-for="group in rows" :key="group.id" class="achievements-group" :data-group="group.id">
        <div class="achievements-group-head">
          <div><h2>{{ group.title }}</h2><p>{{ group.description }}</p></div>
          <strong>{{ target(group.progress, group.unit) }}</strong>
        </div>
        <div class="achievements-tiers">
          <article v-for="offer in group.tiers" :key="offer.id" class="achievement-tier"
            :class="{ 'is-claimed': offer.claimed, 'is-ready': offer.claimable }" :data-achievement="offer.id">
            <div class="achievement-tier-info">
              <span class="achievement-target">{{ target(offer.target, group.unit) }}</span>
              <strong>+{{ cash(offer.rewardCents) }}</strong>
              <div class="achievement-track" role="progressbar"
                :aria-label="'Progression vers ' + target(offer.target, group.unit)"
                :aria-valuenow="Math.min(offer.progress, offer.target)"
                aria-valuemin="0" :aria-valuemax="offer.target">
                <span :style="{ width: Math.min(100, offer.progress / offer.target * 100) + '%' }"></span>
              </div>
            </div>
            <button v-if="offer.claimable" class="achievement-claim" type="button"
              :aria-label="'Récupérer ' + cash(offer.rewardCents) + ' pour ' + target(offer.target, group.unit)"
              @click="claim(offer.id)">Récupérer</button>
            <span v-else class="achievement-state" :class="{ 'is-complete': offer.claimed }">
              {{ offer.claimed ? 'Récupéré' : 'À débloquer' }}
            </span>
          </article>
        </div>
      </section>
      <p class="achievements-footnote">Un cadeau se réclame une seule fois, même après un Prestige. Il ajoute du cash sans générer d’XP, de Fame ou de taxe. Les clics, revenus et entreprises concernent le cycle actuel ; le record de niveau, les collections et les Prestiges survivent aux cycles.</p>
    </div>
  </main>
</template>
