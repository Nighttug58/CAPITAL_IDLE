<script setup lang="ts">
import { computed } from 'vue'
import type { CapitalState } from '../capital.ts'
import { getPortfolio } from '../trading/trades.ts'
import { formatCash, formatPerSecond, formatPrice, formatQuantity, formatRate } from '../trading/presentation.ts'

const props = defineProps<{ state: CapitalState }>()
const portfolio = computed(() => getPortfolio(props.state))
const dividendsPerSecond = computed(() =>
  portfolio.value.positions.reduce((sum, item) => sum + item.annualDividendEstimate / 86400, 0)
)
</script>

<template>
  <div class="portfolio-panel">
    <div class="portfolio-summary">
      <div class="portfolio-total"><span class="eyebrow">PATRIMOINE TOTAL</span><strong>{{ formatCash(portfolio.netWorth) }}</strong></div>
      <div class="portfolio-stats">
        <div><span>Valeur des positions</span><strong>{{ formatCash(portfolio.marketValue) }}</strong></div>
        <div><span>Dividendes</span><strong class="portfolio-income">{{ formatPerSecond(dividendsPerSecond) }}</strong></div>
      </div>
    </div>
    <div class="market-list-head">
      <strong>Mes positions <span class="position-count">{{ portfolio.positions.length }}</span></strong>
      <span>RÉALISÉ · {{ formatCash(portfolio.realizedNetProfit) }}</span>
    </div>
    <div class="market-list-scroll portfolio-positions">
      <div v-if="portfolio.positions.length === 0" class="market-empty">
        <span class="market-empty-icon" aria-hidden="true">◇</span>
        <strong>Votre portefeuille est vide</strong>
        <p>Consultez les cours dans Actions et Crypto. Les achats et ventes arrivent lors de la prochaine passe.</p>
      </div>
      <article v-for="position in portfolio.positions" :key="position.asset.id" class="portfolio-position">
        <div class="portfolio-position-header">
          <div><strong>{{ position.asset.name }}</strong><span>{{ position.asset.symbol }} · {{ formatQuantity(position.quantity) }} unités</span></div>
          <div class="portfolio-position-value">
            <strong>{{ formatCash(position.marketValue) }}</strong>
            <span :class="position.unrealizedNetProfit >= 0 ? 'market-direction-up' : 'market-direction-down'">
              {{ position.unrealizedNetProfit > 0 ? '+' : '' }}{{ formatCash(position.unrealizedNetProfit) }}
            </span>
          </div>
        </div>
        <div class="portfolio-position-footer">
          <span>Coût moyen {{ formatPrice(position.averageCost) }}</span>
          <span v-if="position.asset.kind === 'stock'">
            Div. {{ formatRate(state.trading.quotes[position.asset.id]?.dividendYield ?? position.asset.initialDividendYield ?? 0) }}
            · {{ formatPerSecond(position.annualDividendEstimate / 86400) }}
          </span>
        </div>
      </article>
    </div>
  </div>
</template>
