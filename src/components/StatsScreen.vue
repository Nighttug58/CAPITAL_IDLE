<script setup lang="ts">
import { computed, ref } from 'vue'
import type { CapitalState } from '../capital.ts'
import type { EarlyTaxPaymentResult } from '../economy/fiscal.ts'
import { FISCAL_PERIOD_MS, FISCAL_TAX_RATE } from '../economy/state.ts'
import { getCapitalStatsOverview } from '../economy/stats-overview.ts'
import { getFameStatsOverview } from '../prestige/overview.ts'
import {
  MAX_IMPORT_FILE_BYTES, prepareSaveImport, type SaveImportPreview,
} from '../save-transfer.ts'

const props = defineProps<{
  state: CapitalState
  payTaxes: () => EarlyTaxPaymentResult
  exportSave: () => boolean
  importSave: (state: CapitalState) => boolean
  resetSave: () => boolean
}>()

const overview = computed(() => getCapitalStatsOverview(props.state))
const fameOverview = computed(() => getFameStatsOverview(props.state))
const format = new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 2 })
const precise = new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 6 })
const money = (cents: number) => format.format(cents / 100) + ' $'
const cash = (value: number) => format.format(value) + ' $'
const rate = (value: number) => precise.format(value) + ' $/s'
const fameCount = (value: number) => precise.format(value)
const percent = (bps: number) => precise.format(bps / 100) + ' %'
const prestigeFactor = (value: number) => Number.isFinite(value) ? '×' + precise.format(value) : 'Hors limites'
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

const backupFileInput = ref<HTMLInputElement | null>(null)
const pendingImport = ref<SaveImportPreview | null>(null)
const importName = ref('')
const importError = ref('')
const backupNotice = ref('')
const resetConfirming = ref(false)
const resetText = ref('')
const importing = ref(false)

const importErrors: Record<'file-too-large' | 'invalid-json' | 'unsupported-version' | 'invalid-save', string> = {
  'file-too-large': 'Fichier trop volumineux (16 Mo maximum).',
  'invalid-json': 'Ce fichier n’est pas un JSON valide.',
  'unsupported-version': 'Format ou version de sauvegarde incompatible (v4 / v5 / v6).',
  'invalid-save': 'Sauvegarde corrompue ou incohérente : aucune donnée n’a été remplacée.',
}
function openImportChooser() {
  if (!backupFileInput.value) return
  backupFileInput.value.value = ''
  backupFileInput.value.click()
}

async function readImportFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  pendingImport.value = null
  importError.value = ''
  backupNotice.value = ''
  if (!file) return
  importName.value = file.name
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    importError.value = importErrors['file-too-large']
    return
  }
  importing.value = true
  try {
    const contents = await file.text()
    const result = prepareSaveImport(contents)
    if (result.ok) pendingImport.value = result.preview
    else importError.value = importErrors[result.error]
  } catch {
    importError.value = 'Lecture du fichier impossible. La partie actuelle est conservée.'
  } finally {
    importing.value = false
  }
}

function confirmImport() {
  if (!pendingImport.value) return
  const imported = pendingImport.value
  if (props.importSave(imported.state)) {
    backupNotice.value = 'Sauvegarde importée. La progression et les échéances ont été restaurées.'
    pendingImport.value = null
    importError.value = ''
  } else {
    importError.value = 'Impossible d’écrire la sauvegarde : aucune partie n’a été remplacée.'
  }
}
function exportBackup() {
  backupNotice.value = props.exportSave()
    ? 'Sauvegarde exportée en fichier JSON.'
    : 'Export impossible sur cet appareil.'
}
function confirmReset() {
  if (resetText.value !== 'RESET') return
  if (props.resetSave()) {
    backupNotice.value = 'Nouvelle partie créée. Tous les compteurs ont été réinitialisés.'
    resetConfirming.value = false
    resetText.value = ''
    pendingImport.value = null
  } else {
    backupNotice.value = 'Réinitialisation impossible : la sauvegarde actuelle a été conservée.'
  }
}
function closeReset() {
  resetText.value = ''
  resetConfirming.value = false
}

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
        <div><span>NIVEAU</span><strong>{{ overview.level }}</strong></div>
        <div><span>FORTUNE NETTE</span><strong :class="{ 'tax-debt': overview.netWorth < 0 }">{{ cash(overview.netWorth) }}</strong></div>
        <div><span>SOLDE DISPONIBLE</span><strong :class="{ 'tax-debt': state.game.balance < 0 }">{{ cash(overview.cash) }}</strong></div>
        <div><span>REVENUS CUMULÉS</span><strong>{{ cash(overview.lifetimeEarned) }}</strong></div>
      </section>

      <section class="stats-section stats-progress" aria-label="Progression">
        <div class="stats-section-heading"><h2>Progression</h2><span>{{ overview.nextLevelAt === null ? 'NIVEAU MAX' : 'PROCHAIN NIVEAU ' + (overview.level + 1) }}</span></div>
        <div class="stats-progress-meter" role="progressbar" aria-label="Progression du niveau joueur"
          :aria-valuenow="Math.round(overview.levelProgressPercent)" aria-valuemin="0" aria-valuemax="100">
          <div :style="{ width: overview.levelProgressPercent + '%' }"></div>
        </div>
        <div class="stats-progress-description">
          <span>{{ cash(overview.experience) }} XP</span>
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
          <div><span>Collections · valeur comptable</span><strong>{{ cash(overview.collectionBookValue) }}</strong></div>
          <div><span>Taxes encore dues</span><strong class="tax-debt">−{{ cash(overview.taxesDue) }}</strong></div>
          <div class="stats-balance-result"><span>Fortune nette</span><strong :class="{ 'tax-debt': overview.netWorth < 0 }">{{ cash(overview.netWorth) }}</strong></div>
        </div>
        <p class="stats-footnote">Plus-value latente du portefeuille : {{ cash(overview.unrealizedTradingProfit) }} (déjà intégrée à la valeur de marché, pas ajoutée une seconde fois). Les taxes payées sont déjà déduites du solde.</p>
      </section>

      <section class="stats-section stats-prestige" aria-label="Fame, collections et Prestige absolu">
        <div class="stats-section-heading"><h2>Fame & Prestige</h2>
          <span>{{ fameOverview.absolute.purchasedLevels }} / 120 PALIERS</span>
        </div>
        <div class="stats-prestige-summary">
          <div><span>FAME DISPONIBLE</span><strong>✦ {{ fameCount(fameOverview.available) }}</strong></div>
          <div><span>FAME TOTALE OBTENUE</span><strong>{{ fameCount(fameOverview.earned) }}</strong></div>
          <div><span>GAGNÉE PAR NIVEAUX</span><strong>{{ fameCount(fameOverview.fromLevels) }}</strong></div>
          <div><span>GAGNÉE PAR COLLECTIONS</span><strong>{{ fameCount(fameOverview.fromCollections) }}</strong></div>
          <div><span>DÉPENSÉE EN BOOSTS</span><strong>{{ fameCount(fameOverview.spent) }}</strong></div>
          <div><span>OBJETS ACQUIS</span><strong>{{ fameOverview.ownedCollections }} / {{ fameOverview.totalCollections }}</strong></div>
        </div>
        <div class="stats-absolute-panel" :class="{ 'is-unlocked': fameOverview.absolute.unlocked }">
          <div class="stats-absolute-heading">
            <strong>Prestige absolu</strong>
            <span>{{ fameOverview.absolute.unlocked ? 'DÉBLOQUÉ' : 'VERROUILLÉ' }}</span>
          </div>
          <template v-if="fameOverview.absolute.unlocked">
            <strong class="stats-absolute-factor">{{ prestigeFactor(fameOverview.absolute.factor) }}</strong>
            <p>{{ fameOverview.absolute.fameSteps }} tranches de 100 Fame disponibles · prochaine tranche à
              {{ fameCount(fameOverview.absolute.nextStepAtFame) }} Fame.</p>
          </template>
          <p v-else>Débloqué gratuitement à 120/120 paliers. Encore
            {{ fameOverview.absolute.requiredLevels - fameOverview.absolute.purchasedLevels }} niveaux à acheter.</p>
          <p>Multiplicateur appliqué aux seuls bonus du Fame Shop, jamais aux collections.</p>
        </div>
        <div class="stats-prestige-boosts">
          <strong>Vos six bonus permanents</strong>
          <div v-for="boost in fameOverview.boosts" :key="boost.id" class="stats-prestige-boost" :data-boost="boost.id">
            <div><strong>{{ boost.name }}</strong><span>Niveau {{ boost.level }}/20</span></div>
            <p>Shop : +{{ percent(boost.rawShopBps) }}
              <span v-if="fameOverview.absolute.unlocked"> · avec Prestige : +{{ percent(boost.prestigeShopBps) }}</span>
              · Collection : +{{ percent(boost.collectionBps) }}</p>
            <strong class="stats-prestige-total">Total : +{{ percent(boost.totalBps) }}</strong>
          </div>
        </div>
        <p class="stats-footnote">Les bonus s'ajoutent aux sources éligibles et ne recalculent jamais les gains antérieurs. Les objets de collection restent valorisés au prix d'achat dans le patrimoine.</p>
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

      <section class="stats-section stats-backup" aria-label="Gestion de la sauvegarde">
        <div class="stats-section-heading">
          <h2>Gestion de la sauvegarde</h2><span>LOCAL · JSON</span>
        </div>
        <p class="stats-footnote">Conservez une copie de votre partie ou restaurez un fichier sauvegardé. La sauvegarde automatique continue de fonctionner normalement.</p>
        <button type="button" class="backup-action backup-export" @click="exportBackup">
          <span class="backup-action-icon" aria-hidden="true">↓</span>
          <span><strong>Exporter la sauvegarde</strong><small>Télécharger toutes les données en .json</small></span>
        </button>
        <button type="button" class="backup-action backup-import" :disabled="importing" @click="openImportChooser">
          <span class="backup-action-icon" aria-hidden="true">↑</span>
          <span><strong>Importer une sauvegarde</strong><small>Vérification et confirmation avant remplacement</small></span>
        </button>
        <input ref="backupFileInput" class="backup-hidden" type="file" accept=".json,application/json"
          aria-label="Choisir un fichier de sauvegarde JSON" @change="readImportFile">
        <p v-if="importing" class="stats-footnote" role="status">Vérification du fichier en cours…</p>
        <p v-if="importError" class="backup-error" role="alert">{{ importError }}</p>

        <div v-if="pendingImport" class="backup-confirm" role="alertdialog" aria-modal="true" aria-label="Confirmer l'import de sauvegarde">
          <strong>Remplacer la partie actuelle ?</strong>
          <p>Le fichier <b>{{ importName }}</b> contient une sauvegarde v{{ pendingImport.sourceVersion }}. Les données actuelles seront remplacées.</p>
          <div class="backup-import-details">
            <span>Argent de la sauvegarde</span><strong>{{ cash(pendingImport.state.game.balance) }}</strong>
            <span>Entreprises possédées</span><strong>{{ Object.keys(pendingImport.state.enterprises.owned).length }} / 20</strong>
            <span>Taxes accumulées</span><strong>{{ money(pendingImport.state.fiscal.taxesDueCents) }}</strong>
            <span>Date d’export</span>
            <strong>{{ pendingImport.exportedAt === null ? 'Ancien format' : new Date(pendingImport.exportedAt).toLocaleString('fr-CH') }}</strong>
          </div>
          <p class="backup-warning">Après import, les revenus hors ligne et les échéances fiscales écoulées seront calculés normalement. Cette action écrasera la partie en cours.</p>
          <div class="backup-confirm-actions">
            <button type="button" @click="pendingImport = null">Annuler</button>
            <button type="button" class="backup-confirm-primary" @click="confirmImport">Confirmer l’import</button>
          </div>
        </div>

        <div class="backup-danger">
          <strong>Zone dangereuse</strong>
          <p>Réinitialiser supprimera définitivement votre progression, vos investissements, vos statistiques et vos taxes.</p>
          <button type="button" class="backup-action backup-reset" @click="resetConfirming = true">
            Réinitialiser la sauvegarde
          </button>
        </div>
        <div v-if="resetConfirming" class="backup-confirm backup-reset-confirm" role="alertdialog"
          aria-modal="true" aria-label="Confirmer la réinitialisation">
          <strong>Supprimer définitivement la partie ?</strong>
          <p>Cette opération est irréversible. Écrivez exactement <b>RESET</b> pour confirmer.</p>
          <label for="reset-code">Confirmation de sécurité</label>
          <input id="reset-code" v-model="resetText" type="text" autocomplete="off" spellcheck="false"
            placeholder="Écrivez RESET" maxlength="5" @keydown.esc="closeReset">
          <div class="backup-confirm-actions">
            <button type="button" @click="closeReset">Annuler</button>
            <button type="button" class="backup-confirm-danger" :disabled="resetText !== 'RESET'"
              @click="confirmReset">Supprimer la sauvegarde</button>
          </div>
        </div>
        <p v-if="backupNotice" class="stats-tax-notice" role="status">{{ backupNotice }}</p>
      </section>
    </div>
  </main>
</template>
