<script setup lang="ts">
import { computed, ref } from 'vue'
import type { CapitalState } from '../capital.ts'
import type { EarlyTaxPaymentResult } from '../economy/fiscal.ts'
import { FISCAL_PERIOD_MS, FISCAL_TAX_RATE } from '../economy/state.ts'
import { getCapitalStatsOverview } from '../economy/stats-overview.ts'

const props = defineProps<{
  state: CapitalState
  payTaxes: () => EarlyTaxPaymentResult
}>()

const overview = computed(() => getCapitalStatsOverview(props.state))
const format = new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 2 })
const precise = new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 6 })
const money = (cents: number) => format.format(cents / 100) + ' $'
const cash = (value: number) => format.format(value) + ' $'
const rate = (value: number) => precise.format(value) + ' $/s'
const hours = (ms: number) => {
  const totalMinutes = Math.floor(ms / 60_000)
  const d = Math.floor(totalMinutes / 1440)
  const h = Math.floor(totalMinutes / 60) % 24
  const m = totalMinutes % 60
  return d ? `${d} j ${h} h ${m} min` : `${h} h ${m} min`
}

const dueAt = computed(() => props.state.fiscal.periodStartedAt + FISCAL_PERIOD_MS)
const remaining = computed(() => {
  // La réactivité provient du MarketRuntime déjà présent dans l'application.
  const ms = Math.max(0, dueAt.value - Date.now())
  const total = Math.ceil(ms / 1000)
  const d = Math.floor(total / 86400)
  const h = Math.floor(total / 3600) % 24
  const m = Math.floor(total / 60) % 60
  return `${d}j ${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`
})

const confirming = ref(false)
const notice = ref('')
const sources = [
  { id: 'enterprises', label: 'Entreprises' },
  { id: 'stocks', label: 'Actions' },
  { id: 'crypto', label: 'Cryptomonnaies' },
  { id: 'memecoins', label: 'Memecoins' },
] as const

function pay() {
  const result = props.payTaxes()
  confirming.value = false
  notice.value = result.ok
    ? `Paiement de ${money(result.amountCents)} effectué. Nouvelle échéance dans 72 h.`
    : result.error === 'nothing-due'
      ? 'Aucune taxe à payer pour cette période.'
      : 'Paiement impossible pour le moment. Vérifiez votre horloge ou votre sauvegarde.'
}
</script>

<template>
  <main id="stats" class="stats-screen" aria-label="Statistiques et fiscalité">
    <header class="stats-heading">
      <span class="eyebrow">CAPITAL · VOTRE PROGRESSION</span>
      <h1>Statistiques</h1>
      <p>Progression, patrimoine, gains par source et obligations fiscales.</p>
    </header>

    <div class="stats-scroll">
      <section class="stats-overview" aria-label="Vue d’ensemble du joueur">
        <div><span>NIVEAU</span><strong>{{ overview.level }} / 50</strong></div>
        <div><span>FORTUNE NETTE</span><strong :class="{ 'tax-debt': overview.netWorth < 0 }">{{ cash(overview.netWorth) }}</strong></div>
        <div><span>SOLDE DISPONIBLE</span><strong :class="{ 'tax-debt': state.game.balance < 0 }">{{ cash(overview.cash) }}</strong></div>
        <div><span>GAINS POUR LA PROGRESSION</span><strong>{{ cash(overview.lifetimeEarned) }}</strong></div>
      </section>

      <section class="stats-section stats-progress" aria-label="Progression">
        <div class="stats-section-heading"><h2>Progression</h2><span>{{ overview.nextLevelAt === null ? 'NIVEAU MAX' : 'PROCHAIN NIVEAU ' + (overview.level + 1) }}</span></div>
        <div class="stats-progress-meter" role="progressbar" aria-label="Progression du niveau joueur"
          :aria-valuenow="Math.round(overview.levelProgressPercent)" aria-valuemin="0" aria-valuemax="100">
          <div :style="{ width: overview.levelProgressPercent + '%' }"></div>
        </div>
        <div class="stats-progress-description">
          <span>{{ cash(overview.lifetimeEarned) }} XP</span>
          <span>{{ overview.nextLevelAt === null ? 'Palier final atteint' : cash(overview.nextLevelAt) + ' XP requis' }}</span>
        </div>
        <div class="stats-mini-grid">
          <div><span>CLICS EFFECTUÉS</span><strong>{{ overview.clickCount.toLocaleString('fr-CH') }}</strong></div>
          <div><span>TEMPS DE JEU ACTIF</span><strong>{{ hours(overview.activePlayMs) }}</strong></div>
        </div>
        <p class="stats-footnote">Le temps actif compte lorsque l’application est au premier plan. Les gains de progression ne comprennent jamais le capital récupéré à la vente.</p>
      </section>

      <section class="stats-section stats-sources" aria-label="Gains et pertes par source">
        <div class="stats-section-heading"><h2>Gains par source</h2><span>CUMULS ENCAISSÉS</span></div>
        <p class="stats-footnote">Profits réalisés uniquement pour les ventes. Les fluctuations latentes des titres ne sont pas comptées. Les plus-values positives et les pertes sont présentées séparément.</p>
        <div class="stats-source-list">
          <div v-for="source in overview.sources" :key="source.id" class="stats-source" :data-source="source.id">
            <div class="stats-source-top">
              <strong>{{ source.label }}</strong>
              <span>{{ cash(source.gains) }}</span>
            </div>
            <div class="stats-source-track" aria-hidden="true">
              <div :style="{ width: (source.fraction * 100) + '%' }"></div>
            </div>
            <div v-if="source.losses > 0" class="stats-source-loss">
              <span>Pertes réalisées</span><strong>−{{ cash(source.losses) }}</strong>
            </div>
          </div>
        </div>
        <div class="stats-totals">
          <div><span>Total des recettes positives ventilées</span><strong>{{ cash(overview.totalPositiveSources) }}</strong></div>
          <div><span>Plus-values réalisées positives</span><strong>{{ cash(overview.totalRealizedTradingProfit) }}</strong></div>
          <div><span>Pertes réalisées (actions et cryptos)</span><strong class="tax-debt">−{{ cash(overview.totalRealizedTradingLoss) }}</strong></div>
        </div>
        <p class="stats-footnote">« Historique non ventilé » : revenus issus d’une ancienne sauvegarde, impossibles à répartir avec certitude. Les recettes par source ne sont pas additionnables directement à l’XP, dont le Trading protège les niveaux contre le double crédit après une perte.</p>
      </section>

      <section class="stats-section stats-enterprises" aria-label="Statistiques des entreprises">
        <div class="stats-section-heading"><h2>Entreprises</h2><span>{{ overview.enterpriseCount }} / 20</span></div>
        <div class="stats-mini-grid">
          <div><span>NIVEAUX ACQUIS</span><strong>{{ overview.enterpriseLevels }}</strong></div>
          <div><span>REVENU BRUT / SECONDE</span><strong class="stats-income-value">{{ rate(overview.enterpriseIncomePerSecond) }}</strong></div>
          <div><span>REVENUS CUMULÉS</span><strong>{{ cash(state.stats.earnedBySource.enterprises) }}</strong></div>
          <div><span>VALEUR COMPTABLE</span><strong>{{ cash(overview.enterpriseBookValue) }}</strong></div>
        </div>
        <p class="stats-footnote">La valeur comptable correspond au montant investi. Les entreprises ne peuvent jamais être revendues.</p>
      </section>

      <section class="stats-section stats-assets" aria-label="Patrimoine">
        <div class="stats-section-heading"><h2>Patrimoine</h2><span>BILAN ACTUEL</span></div>
        <div class="stats-balance-list">
          <div><span>Liquidités (découvert inclus)</span><strong :class="{ 'tax-debt': overview.cash < 0 }">{{ cash(overview.cash) }}</strong></div>
          <div><span>Actions et cryptos · valeur de marché</span><strong>{{ cash(overview.assetMarketValue) }}</strong></div>
          <div><span>Entreprises · valeur comptable</span><strong>{{ cash(overview.enterpriseBookValue) }}</strong></div>
          <div><span>Taxes encore dues</span><strong class="tax-debt">−{{ cash(overview.taxesDue) }}</strong></div>
          <div class="stats-balance-result"><span>Fortune nette</span><strong :class="{ 'tax-debt': overview.netWorth < 0 }">{{ cash(overview.netWorth) }}</strong></div>
        </div>
        <p class="stats-footnote">Plus-value latente du portefeuille : {{ cash(overview.unrealizedTradingProfit) }} (déjà intégrée à la valeur de marché, pas ajoutée une seconde fois). Les taxes payées sont déjà déduites du solde.</p>
      </section>

      <section class="stats-tax-panel" aria-label="Fiscalité">
        <div class="stats-tax-title"><h2>Administration fiscale</h2><span>Taux {{ Math.round(FISCAL_TAX_RATE * 100) }} %</span></div>
        <div class="stats-tax-due">
          <span>TAXES ACCUMULÉES</span>
          <strong>{{ money(state.fiscal.taxesDueCents) }}</strong>
          <span>Prochain prélèvement automatique : <b>{{ remaining }}</b></span>
        </div>
        <div class="stats-tax-sources">
          <div v-for="source in sources" :key="source.id">
            <span>{{ source.label }}</span>
            <strong>{{ money(state.fiscal.dueBySourceCents[source.id]) }}</strong>
          </div>
          <div class="stats-tax-total">
            <span>Toutes taxes déjà payées</span>
            <strong>{{ money(state.fiscal.taxesPaidCents) }}</strong>
          </div>
        </div>
        <p class="stats-tax-help">Les taxes s'accumulent sans prélèvement immédiat. À chaque échéance de 72 heures réelles, elles sont débitées automatiquement, même si le solde devient négatif.</p>
        <button type="button" class="stats-tax-pay" :disabled="state.fiscal.taxesDueCents === 0" @click="confirming = true">
          Payer les taxes maintenant
        </button>
        <div v-if="confirming" class="stats-tax-confirm" role="alertdialog" aria-modal="false" aria-label="Confirmer le paiement fiscal">
          <strong>Confirmer le paiement anticipé ?</strong>
          <p>Montant total : {{ money(state.fiscal.taxesDueCents) }}. Le solde peut devenir négatif. Le compteur repartira de 72 heures.</p>
          <div>
            <button type="button" @click="confirming = false">Annuler</button>
            <button type="button" class="stats-tax-confirm-pay" @click="pay">Confirmer le paiement</button>
          </div>
        </div>
        <p v-if="notice" class="stats-tax-notice" role="status">{{ notice }}</p>
      </section>

      <p class="stats-followup-note">Import, export et réinitialisation de la sauvegarde : passe 7.</p>
    </div>
  </main>
</template>
