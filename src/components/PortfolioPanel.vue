<script setup lang="ts">
import { computed } from 'vue'
import type { CapitalState } from '../capital.ts'
import { getPortfolio } from '../trading/trades.ts'
import { formatCash, formatPerSecond, formatPrice, formatQuantity, formatRate } from '../trading/presentation.ts'
import type { V8CapitalState } from '../exact-state-v8.ts'
import { exactPortfolioSummary } from '../exact-portfolio-v8.ts'

defineEmits<{ 'open-asset': [id: string] }>()
const props = defineProps<{ state: CapitalState; exactState?: V8CapitalState }>()
const portfolio = computed(() => getPortfolio(props.state))
const exactPortfolio = computed(() => props.exactState ? exactPortfolioSummary(props.exactState) : null)
const dividendsPerSecond = computed(() =>
  portfolio.value.positions.reduce((sum, item) => sum + item.annualDividendEstimate / 86400, 0)
)
</script>

<template>
  <div class="portfolio-panel">
    <div class="portfolio-summary">
      <div class="portfolio-total"><span class="eyebrow">PATRIMOINE TOTAL</span><strong>{{ exactPortfolio?.netWorth ?? formatCash(portfolio.netWorth) }}</strong></div>
      <div class="portfolio-stats">
        <div><span>Valeur des positions</span><strong>{{ exactPortfolio?.marketValue ?? formatCash(portfolio.marketValue) }}</strong></div>
        <div><span>Dividendes</span><strong class="portfolio-income">{{ exactPortfolio?.dividendsPerSecond ?? formatPerSecond(dividendsPerSecond) }}</strong></div>
      </div>
    </div>
    <div class="market-list-head">
      <strong>Mes positions <span class="position-count">{{ portfolio.positions.length }}</span></strong>
      <span>RÉALISÉ · {{ exactPortfolio?.realizedNetProfit ?? formatCash(portfolio.realizedNetProfit) }}</span>
    </div>
    <div class="market-list-scroll portfolio-positions">
      <div v-if="portfolio.positions.length === 0" class="market-empty">
        <span class="market-empty-icon" aria-hidden="true">◇</span>
        <strong>Votre portefeuille est vide</strong>
        <p>Consultez les cours dans Actions et Crypto, puis touchez un actif pour acheter vos premières unités.</p>
      </div>
      <button type="button" v-for="position in portfolio.positions" :key="position.asset.id" class="portfolio-position"
        :aria-label="'Consulter la position ' + position.asset.name" @click="$emit('open-asset', position.asset.id)">
        <div class="portfolio-position-header">
          <div><strong>{{ position.asset.name }}</strong><span>{{ position.asset.symbol }} · {{ exactPortfolio?.rows[position.asset.id]?.quantity ?? formatQuantity(position.quantity) }} unités</span></div>
          <div class="portfolio-position-value">
            <strong>{{ exactPortfolio?.rows[position.asset.id]?.marketValue ?? formatCash(position.marketValue) }}</strong>
            <span :class="position.unrealizedNetProfit >= 0 ? 'market-direction-up' : 'market-direction-down'">
              {{ (exactPortfolio?.rows[position.asset.id]?.profitable ?? (position.unrealizedNetProfit > 0)) ? '+' : '' }}{{ exactPortfolio?.rows[position.asset.id]?.netProfit ?? formatCash(position.unrealizedNetProfit) }}
            </span>
          </div>
        </div>
        <div class="portfolio-position-footer">
          <span>Coût moyen {{ exactPortfolio?.rows[position.asset.id]?.averageCost ?? formatPrice(position.averageCost) }}</span>
          <span v-if="position.asset.kind === 'stock'">
            Div. {{ formatRate(state.trading.quotes[position.asset.id]?.dividendYield ?? position.asset.initialDividendYield ?? 0) }}
            · {{ exactPortfolio?.rows[position.asset.id]?.dividendsPerSecond ?? formatPerSecond(position.annualDividendEstimate / 86400) }}
          </span>
        </div>
      </button>
    </div>
  </div>
</template>
