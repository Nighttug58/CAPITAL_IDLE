<script setup lang="ts">
import { computed } from 'vue'
import { getNewsPresentation } from '../trading/news.ts'
import type { peekUpcomingNews } from '../ascension/market-effects.ts'
import { formatRemaining } from '../trading/presentation.ts'
import type { MarketNews } from '../trading/types.ts'
defineEmits<{ 'open-news': [id: string] }>()
const props = defineProps<{
  news: readonly MarketNews[]
  now: number
  upcoming?: ReturnType<typeof peekUpcomingNews>
}>()
const entries = computed(() =>
  props.news.filter((event, index) => index >= props.news.length - 10 || event.endsAt > props.now).reverse().map((event) => ({ event, presentation: getNewsPresentation(event) }))
    .filter((entry) => entry.presentation !== null)
)
</script>

<template>
  <div class="news-panel">
    <div class="market-list-head">
      <strong>Fil d'actualité</strong>
      <span>{{ news.filter((event) => event.endsAt > now).length }} EN COURS</span>
    </div>
    <div class="market-list-scroll news-scroll">
      <slot />
      <div v-if="upcoming" class="news-future-preview" :class="'news-' + upcoming.presentation.direction"
        aria-label="Vision anticipée">
        <span>VISION ANTICIPÉE · DANS {{ upcoming.secondsRemaining }} s</span>
        <strong>{{ upcoming.presentation.headline }}</strong>
        <p>{{ upcoming.presentation.description }}</p>
        <small>Annonce future déterminée · ses effets resteront incertains</small>
      </div>
      <div v-if="entries.length === 0" class="market-empty">
        <span class="market-empty-icon" aria-hidden="true">◷</span>
        <strong>Aucune actualité pour le moment</strong>
        <p>Un événement fictif apparaît toutes les 5 à 10 minutes (hors bonus Prestige).</p>
      </div>
      <button type="button" v-for="entry in entries" :key="entry.event.id" class="news-preview-row"
        :class="'news-' + entry.presentation!.direction"
        :aria-label="'Lire ' + entry.presentation!.headline + ' · ' +
          (entry.presentation!.direction === 'bullish' ? 'news haussière' :
            entry.presentation!.direction === 'bearish' ? 'news baissière' : 'news neutre')"
        @click="$emit('open-news', entry.event.id)">
        <div class="news-preview-meta">
          <span>{{ entry.presentation!.category.toUpperCase() }}</span>
          <span :class="entry.event.endsAt > now ? 'news-active' : 'news-ended'">
            {{ entry.event.manuallyEnded ? 'Terminée manuellement' : entry.event.endsAt > now ? 'ACTIF · ' + formatRemaining(entry.event.endsAt, now) : 'TERMINÉ' }}
          </span>
        </div>
        <strong>{{ entry.presentation!.headline }}</strong>
        <p>{{ entry.presentation!.description }}</p>
        <span class="news-preview-tickers">
          {{ entry.presentation!.affectedAssets.slice(0, 3).map((asset) => asset.symbol).join(' · ') }}
          {{ entry.presentation!.affectedAssets.length > 3 ? ' · +' + (entry.presentation!.affectedAssets.length - 3) : '' }}
        </span>
      </button>
    </div>
  </div>
</template>
