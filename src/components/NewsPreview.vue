<script setup lang="ts">
import { computed } from 'vue'
import { getNewsPresentation } from '../trading/news.ts'
import { formatRemaining } from '../trading/presentation.ts'
import type { MarketNews } from '../trading/types.ts'
defineEmits<{ 'open-news': [id: string] }>()
const props = defineProps<{ news: readonly MarketNews[]; now: number }>()
const entries = computed(() =>
  props.news.slice(-10).reverse().map((event) => ({ event, presentation: getNewsPresentation(event) }))
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
      <div v-if="entries.length === 0" class="market-empty">
        <span class="market-empty-icon" aria-hidden="true">◷</span>
        <strong>Aucune actualité pour le moment</strong>
        <p>Un événement fictif apparaît toutes les 2 à 8 minutes.</p>
      </div>
      <button type="button" v-for="entry in entries" :key="entry.event.id" class="news-preview-row"
        :aria-label="'Lire ' + entry.presentation!.headline" @click="$emit('open-news', entry.event.id)">
        <div class="news-preview-meta">
          <span>{{ entry.presentation!.category.toUpperCase() }}</span>
          <span :class="entry.event.endsAt > now ? 'news-active' : 'news-ended'">
            {{ entry.event.endsAt > now ? 'ACTIF · ' + formatRemaining(entry.event.endsAt, now) : 'TERMINÉ' }}
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
