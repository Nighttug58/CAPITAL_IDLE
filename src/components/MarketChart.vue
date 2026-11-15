<script setup lang="ts">
import { computed, ref } from 'vue'
import type { PriceSample, MarketNews } from '../trading/types.ts'
import { formatChange, formatPrice, formatRate } from '../trading/presentation.ts'
import { getNewsPresentation } from '../trading/news.ts'

const props = defineProps<{samples: PriceSample[], news: MarketNews[], average?: number, yieldMode?: boolean}>()
defineEmits<{'open-news':[id:string]}>()
const period = ref(15)
const candles = ref(false)
const inspected = ref<number>()
const end = computed(() => props.samples.at(-1)?.at ?? 0)
const points = computed(() => props.samples.filter(p => !period.value || p.at >= end.value - period.value * 60000))
const start = computed(() => points.value[0]?.at ?? end.value)
const last = computed(() => points.value.at(-1)?.price ?? 0)
const prices = computed(() => points.value.map(p => p.price))
const min = computed(() => Math.min(...prices.value))
const max = computed(() => Math.max(...prices.value))
const low = computed(() => Math.min(min.value, props.average ?? min.value))
const high = computed(() => Math.max(max.value, props.average ?? max.value))
const x = (at:number) => 2 + 304 * (at-start.value)/Math.max(1,end.value-start.value)
const y = (v:number) => high.value === low.value ? 55 : 9 + 92*(high.value-v)/(high.value-low.value)
const line = computed(() => points.value.map(p => [x(p.at), y(p.price)].join(',')).join(' '))
const format = (v:number) => props.yieldMode ? formatRate(v) : formatPrice(v)
const time = (at:number) => new Date(at).toLocaleTimeString('fr-CH',{hour:'2-digit',minute:'2-digit'})
const delta = computed(() => last.value-(prices.value[0] ?? 0))
const variation = computed(() => props.yieldMode ? (delta.value*100).toLocaleString('fr-CH',{signDisplay:'exceptZero',maximumFractionDigits:2})+' pt' : formatChange(prices.value[0] ? delta.value/prices.value[0]*100 : null))
const visibleNews = computed(() => props.news.filter(n => n.startedAt >= start.value && n.startedAt <= end.value))
const groups = computed(() => {
  const bins = new Map<number,number[]>()
  for(const p of points.value){
    const bucket = Math.floor((x(p.at)-2)/15)
    const values = bins.get(bucket) ?? []
    values.push(p.price)
    bins.set(bucket,values)
  }
  return Array.from(bins, ([bucket,values]) => ({x:Math.min(305,5+bucket*15),open:values[0]!,close:values.at(-1)!,high:Math.max(...values),low:Math.min(...values)}))
})
const selected = computed(() => inspected.value === undefined ? undefined : points.value.reduce<PriceSample|undefined>((best,p) => !best || Math.abs(p.at-inspected.value!) < Math.abs(best.at-inspected.value!) ? p : best,undefined))
function inspect(e:PointerEvent){
  const svg = e.currentTarget as SVGSVGElement
  const matrix = svg.getScreenCTM()
  if (!matrix) return
  const local = new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse())
  inspected.value = start.value+(end.value-start.value)*Math.max(0,Math.min(1,(local.x-2)/304))
}
</script>
<template>
<div class="market-chart">
  <div class="chart-tools"><button v-for="n in [1,5,15,60,0]" :key="n" type="button" :aria-pressed="period===n" @click="period=n; inspected=undefined">{{ n===60?'1 h':n?n+' min':'Tout' }}</button>
  <button v-if="!yieldMode" type="button" :aria-pressed="candles" @click="candles=!candles">Chandeliers</button></div>
  <svg v-if="points.length" viewBox="0 0 432 136" aria-label="Historique du marché" role="img" @pointermove="inspect" @pointerdown="inspect" @pointerleave="inspected=undefined">
    <g v-for="v in [...new Set([min,max])]" :key="v"><line x1="2" x2="306" :y1="y(v)" :y2="y(v)" class="guide"/><text v-if="Math.abs(y(v)-y(last))>12" x="313" :y="y(v)+4">{{format(v)}}</text></g>
    <g :color="delta<0?'#ff928e':'#72dcac'">
    <template v-if="!candles"><polygon :points="'2,108 '+line+' 306,108'" fill="currentColor" opacity=".09"/><polyline :points="line" fill="none" stroke="currentColor" stroke-width="1.8"/></template>
    <g v-else v-for="g in groups" :key="g.x" :stroke="g.close>=g.open?'#72dcac':'#ff928e'"><line :x1="g.x" :x2="g.x" :y1="y(g.high)" :y2="y(g.low)"/><line :x1="g.x" :x2="g.x" :y1="y(g.open)" :y2="y(g.close)+0.2" stroke-width="5"/></g>
    <line x1="2" x2="310" :y1="y(last)" :y2="y(last)" stroke="currentColor" stroke-dasharray="2 4"/>
    <text x="313" :y="y(last)+4" fill="currentColor">{{format(last)}}</text></g>
    <line v-if="average!==undefined" x1="2" x2="306" :y1="y(average)" :y2="y(average)" stroke="#ebc674" stroke-dasharray="6 3"/>
    <text x="2" y="135">{{time(start)}}</text><text x="306" y="135" text-anchor="end">{{time(end)}}</text>
    <g v-for="n in visibleNews" :key="n.id" class="news-pin" tabindex="0" role="button" :aria-label="getNewsPresentation(n)?.headline" @click="$emit('open-news',n.id)" @keydown.enter="$emit('open-news',n.id)"><title>{{getNewsPresentation(n)?.headline}}</title><circle :cx="x(n.startedAt)" cy="115" r="5" :fill="n.impact<0?'#ff928e':'#72dcac'"/></g>
    <g v-if="selected" pointer-events="none"><line :x1="x(selected.at)" :x2="x(selected.at)" y1="2" y2="109" class="guide"/><circle :cx="x(selected.at)" :cy="y(selected.price)" r="3" fill="white"/></g>
  </svg>
  <p v-else>Historique en préparation</p>
  <div v-if="points.length" class="chart-stats"><span v-if="selected">{{new Date(selected.at).toLocaleString('fr-CH')}} · {{format(selected.price)}}</span><template v-else>Min {{format(min)}} · Max {{format(max)}} · {{variation}}</template><span v-if="average!==undefined" class="avg"> Achat moyen {{format(average)}}</span></div>
</div>
</template>
<style scoped>
.market-chart{background:#111b1c;border:1px solid #37403b;border-radius:10px;padding:6px 9px;color:#c8d4ce}
.chart-tools{display:flex;flex-wrap:wrap;gap:3px}.chart-tools button{background:transparent;color:inherit;border:0;border-radius:4px;font:inherit;font-size:11px;padding:4px 6px;cursor:pointer}.chart-tools button[aria-pressed=true]{background:#364c42;color:#fff}
svg{width:100%;display:block;height:clamp(108px,19vh,162px);color:#cad4d0}text{font-size:11px;fill:currentColor}.guide{stroke:#4a5b56;stroke-dasharray:3 5}.chart-stats{font-size:11px;min-height:16px}.avg{color:#ebc674}.news-pin{cursor:pointer}polyline{stroke-linejoin:round}
</style>
