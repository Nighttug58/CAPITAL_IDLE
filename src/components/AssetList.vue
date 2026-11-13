<script setup lang="ts">
import { computed } from 'vue'
import { formatChange, formatPrice, getAssetRows } from '../trading/presentation.ts'
import type { TradingState } from '../trading/types.ts'

const props = defineProps<{
  kind: 'stock' | 'crypto'
  quotes: TradingState['quotes']
  history: TradingState['history']
}>()
const rows = computed(() => getAssetRows(props.kind, props.quotes, props.history))
const title = computed(() => props.kind === 'stock' ? '20 entreprises' : '15 cryptos · 10 memecoins')
</script>

<template>
  <div class="asset-panel">
    <div class="market-list-head"><strong>{{ title }}</strong><span>COURS SIMULÉS · 1 H</span></div>
    <div class="market-list-scroll" role="list" :aria-label="kind === 'stock' ? 'Cours des actions' : 'Cours des cryptomonnaies'">
      <article v-for="row in rows" :key="row.asset.id" class="market-asset-row" role="listitem">
        <span class="market-symbol" :class="'market-symbol-' + row.asset.kind" aria-hidden="true">{{ row.asset.symbol.slice(0, 2) }}</span>
        <span class="market-asset-name">
          <strong>{{ row.asset.name }}</strong>
          <span>{{ row.asset.symbol }} · {{ row.asset.kind === 'memecoin' ? 'MEME' : row.asset.kind === 'stock' ? 'ACTION' : 'CRYPTO' }}</span>
        </span>
        <svg class="sparkline" :class="'market-direction-' + row.direction" viewBox="0 0 112 34" preserveAspectRatio="none" aria-hidden="true">
          <line x1="2" y1="17" x2="110" y2="17" class="sparkline-baseline" />
          <polyline v-if="row.sparkline" :points="row.sparkline" />
        </svg>
        <span class="market-asset-values">
          <strong>{{ formatPrice(row.price) }}</strong>
          <span :class="'market-direction-' + row.direction">{{ formatChange(row.changePercent) }}</span>
        </span>
      </article>
    </div>
  </div>
</template>
