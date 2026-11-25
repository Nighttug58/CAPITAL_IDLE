<script setup lang="ts">
import { computed } from 'vue'
import { formatChange, formatPrice, getAssetRows } from '../trading/presentation.ts'
import type { TradingState } from '../trading/types.ts'

const emit = defineEmits<{ 'open-asset': [id: string] }>()
const props = defineProps<{
  batterySaver?:boolean
  kind: 'stock' | 'crypto'
  quotes: TradingState['quotes']
  history: TradingState['history']
}>()
// Stable computed inputs avoid rescanning all series on wallet-only state updates.
const quotes = computed(()=>props.quotes)
const history = computed(()=>props.history)
const rows = computed(() => getAssetRows(props.kind, quotes.value, history.value,!props.batterySaver))
const title = computed(() => props.kind === 'stock' ? '20 entreprises' : '15 cryptos · 10 memecoins')
</script>

<template>
  <div class="asset-panel">
    <div class="market-list-head"><strong>{{ title }}</strong><span>COURS SIMULÉS · 1 H</span></div>
    <div class="market-list-scroll" role="list" :aria-label="kind === 'stock' ? 'Cours des actions' : 'Cours des cryptomonnaies'">
      <button type="button" v-for="row in rows" :key="row.asset.id" v-memo="[row.price,row.changePercent,row.direction,row.sparkline,batterySaver]" class="market-asset-row" :class="{'market-asset-row-lite':batterySaver}"
        :aria-label="'Voir et trader ' + row.asset.name" @click="emit('open-asset', row.asset.id)">
        <span class="market-symbol" :class="'market-symbol-' + row.asset.kind" aria-hidden="true">{{ row.asset.symbol.slice(0, 2) }}</span>
        <span class="market-asset-name">
          <strong>{{ row.asset.name }}</strong>
          <span>{{ row.asset.symbol }} · {{ row.asset.kind === 'memecoin' ? 'MEME' : row.asset.kind === 'stock' ? 'ACTION' : 'CRYPTO' }}</span>
        </span>
        <svg v-if="!batterySaver" class="sparkline" :class="'market-direction-' + row.direction" viewBox="0 0 112 34" preserveAspectRatio="none" aria-hidden="true">
          <line x1="2" y1="17" x2="110" y2="17" class="sparkline-baseline" />
          <polyline v-if="row.sparkline" :points="row.sparkline" />
        </svg>
        <span class="market-asset-values">
          <strong>{{ formatPrice(row.price) }}</strong>
          <span :class="'market-direction-' + row.direction">{{ formatChange(row.changePercent) }}</span>
        </span>
      </button>
    </div>
  </div>
</template>
