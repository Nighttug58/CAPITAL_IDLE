<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { getNewsEnvelope, getNewsPressure, getNewsPresentation, getNewsTemplate } from '../trading/news.ts'
import { formatRemaining } from '../trading/presentation.ts'
import type { MarketNews } from '../trading/types.ts'

const props = defineProps<{
  event: MarketNews
  news: readonly MarketNews[]
  now: number
  impactMultiplier: number
}>()
const emit = defineEmits<{ close: []; 'open-asset': [id: string] }>()
const detail = computed(() => getNewsPresentation(props.event))
const template = computed(() => getNewsTemplate(props.event.templateId))
const root = ref<HTMLElement | null>(null)
onMounted(() => root.value?.focus())
const reliability = computed(() => props.event.phase === 'rumor' ? 'Rumeur non confirmée' :
  props.event.phase === 'confirmed' ? 'Information confirmée dans la simulation' :
    props.event.phase === 'denied' ? 'Démenti dans la simulation' : 'Annonce simulée')

// Réutilise les mêmes fonctions que le moteur : la pression affichée
// tient compte du temps, des bonus, des démentis et du cumul plafonné.
const temporalPower = computed(() => getNewsEnvelope(props.event, props.now))
const ownPressure = computed(() => getNewsPressure([props.event], props.now, props.impactMultiplier))
const totalPressure = computed(() => getNewsPressure(props.news, props.now, props.impactMultiplier))
const affected = computed(() => (detail.value?.affectedAssets ?? []).map(asset => ({
  id: asset.id, symbol: asset.symbol, name: asset.name,
  price: totalPressure.value.price[asset.id] ?? 0,
  dividend: asset.kind === 'stock' ? totalPressure.value.dividend[asset.id] ?? 0 : null,
})))
const ownPrice = computed(() => ownPressure.value.price[affected.value[0]?.id ?? ''] ?? 0)
const ownDividend = computed(() => {
  const stock = detail.value?.affectedAssets.find(asset => asset.kind === 'stock')
  return stock ? ownPressure.value.dividend[stock.id] ?? 0 : null
})
const durationMinutes = computed(() => Math.max(0, (props.event.endsAt - props.event.startedAt) / 60_000))
const number = new Intl.NumberFormat('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const indexFormat = new Intl.NumberFormat('fr-CH', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
const percent = (value: number) => number.format(value * 100) + ' %'
const factor = (value: number) => '×' + number.format(value)
const index = (value: number) => (value > 0 ? '+' : '') + indexFormat.format(value)
const sign = (value: number) => value > 0 ? 'news-index-positive' : value < 0 ? 'news-index-negative' : ''
</script>

<template>
  <section ref="root" class="trading-modal trading-news-modal"
    :class="detail ? 'news-' + detail.direction : undefined" role="dialog" aria-modal="true" aria-label="Actualité détaillée" tabindex="-1">
    <div class="trading-modal-header">
      <div class="modal-title-group">
        <span class="eyebrow">ACTUALITÉ · {{ detail?.category.toUpperCase() }}</span>
        <h2>Marchés & News</h2>
      </div>
      <button type="button" class="modal-close" aria-label="Fermer l’actualité" @click="emit('close')">×</button>
    </div>
    <div v-if="detail && template" class="trading-modal-scroll news-detail-content" role="region" aria-label="Contenu de l’actualité" tabindex="0">
      <div class="news-detail-meta">
        <span>{{ reliability }}</span>
        <span>{{ event.manuallyEnded ? 'Terminée manuellement' : event.endsAt > now ? 'Encore ' + formatRemaining(event.endsAt, now) : 'Impact terminé' }}</span>
      </div>
      <h3>{{ detail.headline }}</h3>
      <slot />
      <p>{{ detail.description }}</p>
      <section class="news-impact-panel" aria-label="Impact chiffré de la News">
        <div class="news-impact-panel-head">
          <span class="eyebrow">IMPACT CHIFFRÉ</span>
          <strong :class="sign(ownPrice)">{{ detail.direction === 'bullish' ? 'HAUSSIER' : detail.direction === 'bearish' ? 'BAISSIER' : 'NEUTRE' }}</strong>
        </div>
        <div class="news-impact-grid">
          <div class="news-impact-stat"><span>Intensité initiale</span><strong>{{ percent(Math.abs(event.impact)) }}</strong></div>
          <div class="news-impact-stat"><span>Poids sur le cours</span><strong>{{ factor(template.priceWeight) }}</strong></div>
          <div class="news-impact-stat"><span>Durée totale</span><strong>{{ number.format(durationMinutes) }} min</strong></div>
          <div class="news-impact-stat"><span>Puissance actuelle</span><strong>{{ percent(temporalPower) }}</strong></div>
          <div class="news-impact-stat"><span>Bonus Prestige / Frénésie</span><strong>{{ factor(impactMultiplier) }}</strong></div>
          <div v-if="ownDividend !== null" class="news-impact-stat"><span>Poids sur les dividendes</span><strong>{{ factor(template.dividendWeight) }}</strong></div>
          <div class="news-impact-stat news-impact-highlight">
            <span>Pression cours de cette News</span><strong :class="sign(ownPrice)">{{ index(ownPrice) }}</strong>
          </div>
          <div v-if="ownDividend !== null" class="news-impact-stat news-impact-highlight">
            <span>Pression dividendes de cette News</span><strong :class="sign(ownDividend)">{{ index(ownDividend) }}</strong>
          </div>
        </div>
        <p v-if="event.phase === 'denied'" class="news-impact-note">
          Rumeur démentie : direction inversée avec 65 % de sa force initiale.
        </p>
        <p class="news-impact-note">Ces chiffres sont des <strong>indices de pression</strong>, pas des pourcentages de hausse ou de baisse garantis. Le hasard, la tendance, le momentum et les chocs comptent également.</p>
      </section>
      <div class="news-scenario"><span class="eyebrow">IMPACT POSSIBLE</span><p>{{ detail.scenario }}</p></div>
      <section class="news-aggregate" aria-label="Influence cumulée sur les actifs">
        <div class="news-aggregate-head"><span class="eyebrow">PRESSION CUMULÉE DES NEWS ACTIVES</span>
          <small>{{ affected.length }} actif{{ affected.length > 1 ? 's' : '' }}</small>
        </div>
        <p class="news-impact-note">Somme plafonnée des annonces qui concernent chaque actif, y compris celle-ci.</p>
        <div class="news-aggregate-row news-aggregate-column-head"><span>Actif</span><span>Cours</span><span>Dividendes</span></div>
        <div v-for="asset in affected.slice(0, 5)" :key="asset.id" class="news-aggregate-row">
          <span :title="asset.name">{{ asset.symbol }}</span>
          <strong :class="sign(asset.price)">{{ index(asset.price) }}</strong>
          <strong :class="sign(asset.dividend ?? 0)">{{ asset.dividend === null ? '—' : index(asset.dividend) }}</strong>
        </div>
        <details v-if="affected.length > 5" class="news-aggregate-more">
          <summary>Voir les {{ affected.length - 5 }} autres actifs</summary>
          <div class="news-aggregate-extra">
            <div v-for="asset in affected.slice(5)" :key="asset.id" class="news-aggregate-row">
              <span :title="asset.name">{{ asset.symbol }}</span>
              <strong :class="sign(asset.price)">{{ index(asset.price) }}</strong>
              <strong :class="sign(asset.dividend ?? 0)">{{ asset.dividend === null ? '—' : index(asset.dividend) }}</strong>
            </div>
          </div>
        </details>
      </section>
      <div class="asset-news-related">
        <span class="eyebrow">ACTIFS CONCERNÉS · {{ detail.affectedAssets.length }}</span>
        <div class="news-related-grid">
          <button v-for="asset in detail.affectedAssets.slice(0, 4)" :key="asset.id" type="button" @click="emit('open-asset', asset.id)">
            {{ asset.name }} <span>{{ asset.symbol }} ›</span>
          </button>
        </div>
        <details v-if="detail.affectedAssets.length > 4" class="news-aggregate-more news-related-more">
          <summary>Afficher les {{ detail.affectedAssets.length - 4 }} autres actifs</summary>
          <div class="news-related-grid news-related-extra">
            <button v-for="asset in detail.affectedAssets.slice(4)" :key="asset.id" type="button" @click="emit('open-asset', asset.id)">
              {{ asset.name }} <span>{{ asset.symbol }} ›</span>
            </button>
          </div>
        </details>
      </div>
      <p class="news-simulated-note">Événement inventé, spécifique à cette partie. Les cours et les impacts ne reflètent pas les marchés réels.</p>
    </div>
  </section>
</template>
