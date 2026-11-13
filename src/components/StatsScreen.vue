<script setup lang="ts">
import { computed, ref } from 'vue'
import type { CapitalState } from '../capital.ts'
import type { EarlyTaxPaymentResult } from '../economy/fiscal.ts'
import { FISCAL_PERIOD_MS, FISCAL_TAX_RATE } from '../economy/state.ts'
import { getLevel } from '../game.ts'
import { getTotalEnterpriseIncomeMicrosPerSecond } from '../economy/enterprises.ts'

const props = defineProps<{
  state: CapitalState
  payTaxes: () => EarlyTaxPaymentResult
}>()
const format = new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 2 })
const money = (cents: number) => format.format(cents / 100) + ' $'
const cash = (value: number) => format.format(value) + ' $'
const dueAt = computed(() => props.state.fiscal.periodStartedAt + FISCAL_PERIOD_MS)
const remaining = computed(() => {
  // La réactivité provient de l'état unique, mis à jour par MarketRuntime.
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
      <p>Votre situation financière et vos obligations fiscales.</p>
    </header>

    <div class="stats-scroll">
      <div class="stats-overview">
        <div><span>NIVEAU</span><strong>{{ getLevel(state.game.lifetimeEarned) }}</strong></div>
        <div><span>SOLDE</span><strong :class="{ 'tax-debt': state.game.balance < 0 }">{{ cash(state.game.balance) }}</strong></div>
        <div><span>GAINS CUMULÉS</span><strong>{{ cash(state.game.lifetimeEarned) }}</strong></div>
        <div><span>ENTREPRISES / S</span><strong>{{ cash(getTotalEnterpriseIncomeMicrosPerSecond(state) / 1_000_000) }}</strong></div>
      </div>

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

      <p class="stats-followup-note">Les statistiques détaillées par source et la gestion des sauvegardes seront ajoutées dans les prochaines passes.</p>
    </div>
  </main>
</template>
