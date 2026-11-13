<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { getNewsPresentation } from '../trading/news.ts'
import { formatRemaining } from '../trading/presentation.ts'
import type { MarketNews } from '../trading/types.ts'
const props = defineProps<{ event: MarketNews; now: number }>()
const emit = defineEmits<{ close: []; 'open-asset': [id: string] }>()
const detail = computed(() => getNewsPresentation(props.event))
const root = ref<HTMLElement | null>(null)
onMounted(() => root.value?.focus())
const reliability = computed(() => props.event.phase === 'rumor' ? 'Rumeur non confirmée' :
  props.event.phase === 'confirmed' ? 'Information confirmée dans la simulation' :
    props.event.phase === 'denied' ? 'Démenti dans la simulation' : 'Annonce simulée')
</script>
<template>
  <section ref="root" class="trading-modal trading-news-modal" role="dialog" aria-modal="true" aria-label="Actualité détaillée" tabindex="-1">
    <div class="trading-modal-header">
      <div class="modal-title-group">
        <span class="eyebrow">ACTUALITÉ · {{ detail?.category.toUpperCase() }}</span>
        <h2>Marchés & News</h2>
      </div>
      <button type="button" class="modal-close" aria-label="Fermer l’actualité" @click="emit('close')">×</button>
    </div>
    <div v-if="detail" class="trading-modal-scroll news-detail-content">
      <div class="news-detail-meta">
        <span>{{ reliability }}</span>
        <span>{{ event.endsAt > now ? 'Encore ' + formatRemaining(event.endsAt, now) : 'Impact terminé' }}</span>
      </div>
      <h3>{{ detail.headline }}</h3>
      <p>{{ detail.description }}</p>
      <div class="news-scenario"><span class="eyebrow">IMPACT POSSIBLE</span><p>{{ detail.scenario }}</p></div>
      <div class="asset-news-related">
        <span class="eyebrow">ACTIFS CONCERNÉS · {{ detail.affectedAssets.length }}</span>
        <button v-for="asset in detail.affectedAssets" :key="asset.id" type="button" @click="emit('open-asset', asset.id)">
          {{ asset.name }} <span>{{ asset.symbol }} ›</span>
        </button>
      </div>
      <p class="news-simulated-note">Événement inventé, spécifique à cette partie. Les cours et les impacts ne reflètent pas les marchés réels.</p>
    </div>
  </section>
</template>
