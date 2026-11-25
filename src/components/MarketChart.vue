<script setup lang="ts">
import { computed, ref } from 'vue'
import type { PriceSample, MarketNews } from '../trading/types.ts'
import { formatChange, formatPrice, historyLowerBound, nearestPriceSample, priceExtremes } from '../trading/presentation.ts'
import { getNewsPresentation } from '../trading/news.ts'

const props = defineProps<{samples: readonly PriceSample[], news: MarketNews[], average?: number}>()
defineEmits<{'open-news':[id:string]}>()
const period = ref(15)
const cursorX = ref(2)
const inspected = ref<number>()
const end = computed(() => props.samples.at(-1)?.at ?? 0)
const points = computed(() => !period.value ? props.samples : props.samples.slice(historyLowerBound(props.samples,end.value-period.value*60000)))
const start = computed(() => points.value[0]?.at ?? end.value)
const last = computed(() => points.value.at(-1)?.price ?? 0)
const extremes = computed(()=>priceExtremes(points.value))
const min = computed(() => extremes.value.min)
const max = computed(() => extremes.value.max)
const firstPrice = computed(()=>points.value[0]?.price ?? 0)
const low = computed(() => Math.min(min.value, props.average ?? min.value))
const high = computed(() => Math.max(max.value, props.average ?? max.value))
const x = (at:number) => 2 + 304 * (at-start.value)/Math.max(1,end.value-start.value)
const y = (v:number) => high.value === low.value ? 55 : 9 + 92*(high.value-v)/(high.value-low.value)
const line = computed(() => points.value.map(p => [x(p.at), y(p.price)].join(',')).join(' '))
const format = (v:number) => formatPrice(v)
const time = (at:number) => new Date(at).toLocaleTimeString('fr-CH',{hour:'2-digit',minute:'2-digit'})
const delta = computed(() => last.value-firstPrice.value)
const variation = computed(() => formatChange(firstPrice.value ? delta.value/firstPrice.value*100 : null))
const visibleNews = computed(() => props.news.filter(n => n.startedAt >= start.value && n.startedAt <= end.value))
const selected = computed(() => inspected.value === undefined ? undefined : nearestPriceSample(points.value,inspected.value))
function inspect(e:PointerEvent){
  const svg = e.currentTarget as SVGSVGElement
  const matrix = svg.getScreenCTM()
  if (!matrix) return
  const local = new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse())
  cursorX.value = Math.max(2,Math.min(306,local.x))
  inspected.value = start.value+(end.value-start.value)*Math.max(0,Math.min(1,(local.x-2)/304))
}
</script>
<template>
<div class="market-chart">
  <div class="chart-tools"><button v-for="n in [1,5,15,60,0]" :key="n" type="button" :aria-pressed="period===n" @click="period=n; inspected=undefined">{{ n===60?'1 h':n?n+' min':'Tout' }}</button>
</div>
  <svg v-if="points.length" viewBox="0 0 432 136" aria-label="Historique du marché" role="img" @pointermove="inspect" @pointerdown="inspect" @pointerleave="inspected=undefined">
    <g v-for="v in [...new Set([min,max])]" :key="v"><line x1="2" x2="306" :y1="y(v)" :y2="y(v)" class="guide"/><text v-if="Math.abs(y(v)-y(last))>12" x="313" :y="y(v)+4">{{format(v)}}</text></g>
    <g v-memo="[line, last, low, high, delta]" :color="delta<0?'#ff928e':'#72dcac'">
    <polygon :points="'2,108 '+line+' 306,108'" fill="currentColor" opacity=".09"/><polyline :points="line" fill="none" stroke="currentColor" stroke-width="1.8"/>
    <line x1="2" x2="310" :y1="y(last)" :y2="y(last)" stroke="currentColor" stroke-dasharray="2 4"/>
    <text x="313" :y="y(last)+4" fill="currentColor">{{format(last)}}</text></g>
    <line v-if="average!==undefined" x1="2" x2="306" :y1="y(average)" :y2="y(average)" stroke="#ebc674" stroke-dasharray="6 3"/>
    <text x="2" y="135">{{time(start)}}</text><text x="306" y="135" text-anchor="end">{{time(end)}}</text>
    <g v-for="n in visibleNews" :key="n.id" class="news-pin" :data-news-id="n.id" tabindex="0" role="button" :aria-label="getNewsPresentation(n)?.headline" @click="$emit('open-news',n.id)" @keydown.enter="$emit('open-news',n.id)"><title>{{getNewsPresentation(n)?.headline}}</title><circle :cx="x(n.startedAt)" cy="115" r="12" fill="transparent"/><circle :cx="x(n.startedAt)" cy="115" r="5" :fill="getNewsPresentation(n)?.direction==='bearish'?'#ff928e':'#72dcac'"/></g>
    <g v-if="selected" pointer-events="none"><line :x1="cursorX" :x2="cursorX" y1="1" y2="123" stroke="#e1eada" stroke-dasharray="3 3"/><circle :cx="x(selected.at)" :cy="y(selected.price)" r="3" fill="white"/>
      <rect x="310" :y="y(selected.price)-8" width="122" height="17" rx="3" fill="#24423b"/><text x="313" :y="y(selected.price)+4">{{format(selected.price)}}</text>
      <rect :x="Math.max(2,Math.min(cursorX-22,262))" y="122" width="44" height="14" fill="#24423b"/><text :x="Math.max(24,Math.min(cursorX,284))" y="134" text-anchor="middle">{{time(selected.at)}}</text></g>
  </svg>
  <p v-else>Historique en préparation</p>
  <div v-if="points.length" class="chart-stats"><span v-if="selected">{{new Date(selected.at).toLocaleString('fr-CH')}} · {{format(selected.price)}}</span><template v-else>Min {{format(min)}} · Max {{format(max)}} · {{variation}}</template><span v-if="average!==undefined" class="avg"> Achat moyen {{format(average)}}</span></div>
</div>
</template>
<style scoped>
.market-chart{background:#111b1c;border:1px solid #37403b;border-radius:10px;padding:6px 9px;color:#c8d4ce}
.chart-tools{display:flex;flex-wrap:wrap;gap:3px}.chart-tools button{background:transparent;color:inherit;border:0;border-radius:4px;font:inherit;font-size:11px;min-height:30px;padding:4px 8px;cursor:pointer}.chart-tools button[aria-pressed=true]{background:#364c42;color:#fff}
svg{touch-action:pan-y;width:100%;display:block;height:clamp(108px,19vh,162px);color:#cad4d0}text{font-size:11px;fill:currentColor}.guide{stroke:#4a5b56;stroke-dasharray:3 5}.chart-stats{font-size:11px;min-height:16px}.avg{color:#ebc674}.news-pin{cursor:pointer}polyline{stroke-linejoin:round}
</style>
