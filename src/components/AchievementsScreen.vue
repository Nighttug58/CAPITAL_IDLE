<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import type { CapitalState } from '../capital.ts'
import { ACHIEVEMENTS, getAchievementOffers, type AchievementBatchResult, type AchievementMetric } from '../achievements.ts'
import { formatCompactUnits } from '../large-numbers.ts'

const props = defineProps<{
  state: CapitalState
  claimRewards: (groupId?: AchievementMetric) => AchievementBatchResult
}>()
const emit = defineEmits<{ back: [] }>()
const backButton = ref<HTMLButtonElement | null>(null)
const notice = ref('')
const noticeError = ref(false)
const offers = computed(() => getAchievementOffers(props.state))
const rows = computed(() => ACHIEVEMENTS.map(group => {
  const tiers = offers.value.filter(offer => offer.group === group.id)
  const progress = tiers[0]?.progress ?? 0
  const reached = tiers.filter(offer => progress >= offer.target).length
  const received = tiers.filter(offer => offer.claimed).length
  const pending = tiers.filter(offer => offer.claimable).length
  const next = tiers[reached]
  const previous = reached ? tiers[reached - 1]!.target : 0
  const percent = next ? Math.min(100, Math.max(0, (progress - previous) / (next.target - previous) * 100)) : 100
  return { ...group, progress, reached, received, pending, next, percent }
}))
const claimed = computed(() => offers.value.filter(offer => offer.claimed).length)
const claimable = computed(() => offers.value.filter(offer => offer.claimable).length)
const total = computed(() => offers.value.length)
const numeric = new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 2 })
const money = (cents: number) => numeric.format(cents / 100) + ' $'
const reward = (cents: bigint) => formatCompactUnits(cents, 2, '$')
const target = (value: number, unit: string) => numeric.format(value) + (unit === '$' ? ' $' : ' ' + unit)

function claim(groupId?: AchievementMetric) {
  const result = props.claimRewards(groupId)
  noticeError.value = !result.ok
  notice.value = result.ok
    ? result.count + ' cadeau(x) récupéré(s) : +' + reward(result.rewardCents) + ' !'
    : result.error === 'storage-error' ? 'Sauvegarde impossible. Aucun cadeau versé.'
      : 'Aucun cadeau disponible à récupérer.'
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
      <p>Un seul achievement par catégorie, avec niveaux et progression vers le prochain palier.</p>
      <div class="achievements-summary">
        <span><strong>{{ claimed }} / {{ total }}</strong> cadeaux récupérés</span>
        <span class="achievements-ready"><strong>{{ claimable }}</strong> disponibles</span>
      </div>
      <button type="button" class="achievements-claim-all" :disabled="claimable === 0"
        @click="claim()">Récupérer tout <span v-if="claimable">({{ claimable }})</span></button>
      <p v-if="notice" class="achievements-notice" :class="{ 'is-error': noticeError }" role="status">{{ notice }}</p>
    </header>
    <div class="achievements-content">
      <section v-for="group in rows" :key="group.id" class="achievements-group"
        :class="{ 'is-ready': group.pending > 0 }" :data-group="group.id">
        <div class="achievements-group-head">
          <div><h2>{{ group.title }}</h2><p>{{ group.description }}</p></div>
          <strong class="achievement-level">Niveau {{ group.reached }} / {{ group.tiers.length }}</strong>
        </div>
        <div class="achievement-current">
          <span>{{ target(group.progress, group.unit) }}</span>
          <span v-if="group.next">Objectif : {{ target(group.next.target, group.unit) }}</span>
          <span v-else>Tous les paliers atteints</span>
        </div>
        <div class="achievement-track" role="progressbar"
          :aria-label="'Progression de ' + group.title"
          :aria-valuenow="Math.round(group.percent)" aria-valuemin="0" aria-valuemax="100">
          <span :style="{ width: group.percent + '%' }"></span>
        </div>
        <div class="achievement-footer">
          <small v-if="group.next">Prochain cadeau : +{{ money(group.next.rewardCents) }}</small>
          <small v-else>Récompenses récupérées : {{ group.received }} / {{ group.tiers.length }}</small>
          <button v-if="group.pending" type="button" class="achievement-claim"
            :aria-label="'Récupérer ' + group.pending + ' cadeaux de ' + group.title"
            @click="claim(group.id)">Récupérer ({{ group.pending }})</button>
          <span v-else class="achievement-state">{{ group.reached ? 'À jour' : 'À débloquer' }}</span>
        </div>
      </section>
      <p class="achievements-footnote">Chaque palier se réclame une fois, même après Prestige. Les cadeaux donnent uniquement du cash, sans XP, Fame ni taxe. Les niveaux et cadeaux existants sont conservés depuis les anciennes sauvegardes.</p>
    </div>
  </main>
</template>
