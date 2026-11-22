<script setup lang="ts">
import { computed, ref } from 'vue'
import type { CapitalState } from '../capital.ts'
import type { EarlyTaxPaymentResult } from '../economy/fiscal.ts'
import { FISCAL_PERIOD_MS } from '../economy/state.ts'
import { liquidityQuote } from '../trading/liquidity-v8.ts'
import { marginalTaxRateBps } from '../economy/tax-curve.ts'
import { getCapitalStatsOverview } from '../economy/stats-overview.ts'
import { getFameStatsOverview } from '../prestige/overview.ts'
import {MAX_IMPORT_FILE_BYTES} from '../save-transfer.ts'
import {prepareV8SaveImport} from '../exact-persistence-v8.ts'
import type {V8CapitalState} from '../exact-state-v8.ts'
import {getExactLevelProgress} from '../exact-levels.ts'
import {getEnterpriseIncomeMicrosPerSecondExact} from '../economy/catalog.ts'
import {v8BonusBasisPoints} from '../exact-runtime-v8.ts'
import { v8ExactRewardRate } from '../prestige/exact-bonuses-v8.ts'
import { v8AbsoluteFameStatus, FAME_FACTOR_SCALE, formatFameFactor, formatExactBasisPoints } from '../prestige/absolute-v8.ts'
import {getAsset} from '../trading/catalog.ts'
import {exactTradeCost,quoteToExactFraction} from '../exact-trading.ts'
import {getCollectionBookValueCents} from '../prestige/collections-catalog.ts'
import { collectionV3Snapshot, COLLECTION_SET_REWARDS } from '../prestige/collections-v3.ts'
import { COLLECTION_CATEGORIES, type FameBoostId } from '../prestige/catalog.ts'
import {getExactAmount as v} from '../exact-state-v8.ts'
import {v4ReservedTaxCents,v4SpendableCents,v4FiscalReport,V4_TAX_INSTALLMENT_MS} from '../prestige/fame-v4-tax.ts'
import {formatCompactUnits,formatDecimalUnits,formatFameMicros} from '../large-numbers.ts'

const props = defineProps<{
  state: CapitalState
  exactState?: V8CapitalState
  payTaxes: () => EarlyTaxPaymentResult
  startTaxPlan: () => boolean
  exportSave: () => boolean
  importSave: (state: V8CapitalState) => boolean
  resetSave: () => boolean
}>()

const overview = computed(() => getCapitalStatsOverview(props.state))
const collectionV3 = computed(() => collectionV3Snapshot(
  props.exactState?.prestige.ownedCollectionIds ?? props.state.prestige.ownedCollectionIds))
const exactAbsolute = computed(() => props.exactState ? v8AbsoluteFameStatus(props.exactState) : null)
const exactAbsoluteText = computed(() => exactAbsolute.value ? formatFameFactor(exactAbsolute.value.factorUnits).replace('.', ',') : '')
const exactCapText = computed(() => exactAbsolute.value ? formatFameFactor(exactAbsolute.value.capUnits).replace('.', ',') : '')
const exactStepText = computed(() => exactAbsolute.value ? formatCompactUnits(exactAbsolute.value.fameSteps,0,'') : '')
const exactNextFame = computed(() => exactAbsolute.value ? formatFameMicros(exactAbsolute.value.nextStepAtFameMicros) : '')
const exactBonusPercent = (id:FameBoostId) => {
  if(!props.exactState)return ''
  const rate=v8ExactRewardRate(props.exactState,id)
  return formatExactBasisPoints((rate.numerator-rate.denominator)*10_000n,rate.denominator)
}
const exactShopPercent = (level:number) => {
  if(!exactAbsolute.value)return ''
  return formatExactBasisPoints(BigInt(level*500)*exactAbsolute.value.factorUnits,FAME_FACTOR_SCALE)
}
const fameOverview = computed(() => {
  const legacy = getFameStatsOverview(props.state)
  if (!props.exactState) return legacy
  const summary = collectionV3.value
  return { ...legacy, boosts: legacy.boosts.map(boost => {
    const key = boost.id as FameBoostId
    const collectionBps = summary.originalBps[key] + summary.rarityBps[key] +
      summary.setBps[key] + ((key === 'click' || key === 'enterprise' || key === 'dividend' || key === 'trading')
        ? summary.museumIncomeBps : 0)
    return { ...boost, collectionBps, totalBps: v8BonusBasisPoints(props.exactState!, key) }
  }) }
})
const format = new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 2 })
const precise = new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 6 })
const money = (cents: number) => format.format(cents / 100) + ' $'
const importMoney = (text:string) => {
  const cents=v(text)
  const whole=cents<0n?-cents:cents
  if(whole <= 10_000_000_000_000n)return format.format(Number(formatDecimalUnits(cents,2)))+' $'
  return formatCompactUnits(cents)
}
const cash = (value: number) => format.format(value) + ' $'
const exactProgress = computed(() => props.exactState ? getExactLevelProgress(v(props.exactState.prestige.experienceCents)) : null)
const exactBalance = computed(() => {
  const state=props.exactState
  if(!state)return null
  const invested=Object.values(state.enterprises.owned).reduce((sum,item)=>sum+v(item.investedCents),0n)
  const collection=BigInt(getCollectionBookValueCents(state.prestige.ownedCollectionIds)??0)
  let market=0n
  let marketNet=0n
  let basis=0n
  for(const [id,item] of Object.entries(state.trading.positions)){
    const asset=getAsset(id)
    if(!asset)continue
    const price=state.trading.quotes[id]?.price??asset.referencePrice
    const units=v(item.quantity)
    const liquidation=liquidityQuote(asset,price,units,'sell',units)
    const quote=liquidation&&quoteToExactFraction(liquidation.executionPrice)
    if(!quote)continue
    const gross=exactTradeCost(quote,v(item.quantity),asset.quantityDecimals,0n,'sell')
    const fee=exactTradeCost(quote,v(item.quantity),asset.quantityDecimals,
      asset.kind==='stock'?50n:asset.kind==='crypto'?100n:150n,'sell')
    market+=gross?.grossCents??0n
    marketNet+=fee?.proceedsCents??0n
    basis+=v(item.costBasis)
  }
  const free=v(state.game.balance),due=v(state.fiscal.taxesDueCents)
  return {cash:free,market,invested,collection,due,net:free+market+invested+collection-due,
    unrealized:marketNet-basis}
})
const exactDisplay = (amount:bigint|undefined,fallback:number) =>
  amount===undefined ? cash(fallback) : importMoney(amount.toString())
const exactIncome = (id:string,value:number) => {
  const state=props.exactState
  const sources=state?.stats.earnedBySource
  const losses=state?.stats.realizedLossesBySource
  const amount=id.startsWith('loss:') ? losses?.[id.slice(5) as keyof typeof losses] :
    sources?.[id as keyof typeof sources]
  return amount!==undefined ? importMoney(amount) : cash(value)
}
const exactTradingTotal = (losses=false): string | null => {
  const state=props.exactState
  if(!state)return null
  const source=losses?state.stats.realizedLossesBySource:state.stats.earnedBySource
  return ['stocks','crypto','memecoins'].reduce((sum,key)=>sum+v(source[key as 'stocks'|'crypto'|'memecoins']),0n).toString()
}
const exactFame = (key:'fameMicros'|'lifetimeFameMicros'|'levelFameMicros'|'collectionFameMicros'|'cycleEarnedFameMicros'|'cycleLevelFameMicros'|'cycleCollectionFameMicros'|'fameSpentMicros',fallback:number) =>
  props.exactState ? formatFameMicros(v(props.exactState.prestige[key])) :
    formatFameMicros(BigInt(Math.round(fallback * 1_000_000)))

const rate = (value: number) => precise.format(value) + ' $/s'
const enterpriseRate = computed(() => {
  const state=props.exactState
  if(!state)return rate(overview.value.enterpriseIncomePerSecond)
  let total=0n
  for(const [id, holding] of Object.entries(state.enterprises.owned))
    total += getEnterpriseIncomeMicrosPerSecondExact(id, holding.level) ?? 0n
  const bonus = v8ExactRewardRate(state, 'enterprise')
  const boosted = total * bonus.numerator / bonus.denominator
  return boosted < 1_000_000_000n ? rate(Number(boosted) / 1_000_000)
    : formatCompactUnits(boosted, 6, '$/s')
})
// Stable Swiss digit grouping across ICU versions (Node/jsdom vs browsers).
const fameCount = (value: number) => precise.format(value).replace(/[\u00a0\u202f ](?=\d{3}(?:\D|$))/g, "'")
const percent = (bps: number) => precise.format(bps / 100) + ' %'
const prestigeFactor = (value: number) => Number.isFinite(value) ? '×' + precise.format(value) : 'Hors limites'
const hours = (ms: number) => {
  const totalMinutes = Math.floor(ms / 60_000)
  const d = Math.floor(totalMinutes / 1440)
  const h = Math.floor(totalMinutes / 60) % 24
  const m = totalMinutes % 60
  return d ? `${d} j ${h} h ${m} min` : `${h} h ${m} min`
}

const dueAt = computed(() => (props.exactState?.fiscal.periodStartedAt??props.state.fiscal.periodStartedAt) + FISCAL_PERIOD_MS)
const remaining = computed(() => {
  // La réactivité provient du MarketRuntime déjà présent dans l'application.
  const ms = Math.max(0, dueAt.value - Date.now())
  const total = Math.ceil(ms / 1000)
  const d = Math.floor(total / 86400)
  const h = Math.floor(total / 3600) % 24
  const m = Math.floor(total / 60) % 60
  return `${d}j ${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`
})

const fiscalRank=(id:number):number=>props.exactState?.prestige.fameV4?.levels[
  ('fame-v4-'+String(id).padStart(2,'0')) as keyof NonNullable<V8CapitalState['prestige']['fameV4']>['levels']
]??0
const fiscalV4=computed(()=>props.exactState?.fiscal.fameV4Tax)
const reserveCents=computed(()=>props.exactState?v4ReservedTaxCents(props.exactState):0n)
const spendableCents=computed(()=>props.exactState?v4SpendableCents(props.exactState):0n)
const taxReport=computed(()=>props.exactState&&fiscalRank(27)>0?v4FiscalReport(props.exactState):null)
const installmentPlan=computed(()=>fiscalV4.value?.plan)
const planFee=computed(()=>props.exactState ? (v(props.exactState.fiscal.taxesDueCents)+50n)/100n:0n)
const planPossible=computed(()=>{
  const st=props.exactState
  if(!st||fiscalRank(26)<1||installmentPlan.value||fiscalV4.value?.eligiblePeriodAt!==null&&
    fiscalV4.value?.eligiblePeriodAt!==undefined||v(st.fiscal.taxesDueCents)<=0n)return false
  const n=Math.min(6,fiscalRank(26)+1)
  return st.enterprises.lastAccruedAt+n*V4_TAX_INSTALLMENT_MS<=
    st.fiscal.periodStartedAt+FISCAL_PERIOD_MS&&v4SpendableCents(st)>=planFee.value
})
const confirmingPlan=ref(false)
function activatePlan(){
  const ok=props.startTaxPlan()
  confirmingPlan.value=false
  notice.value=ok?'Échelonnement fiscal activé. Frais de gestion débités une seule fois.':
    'Impossible de démarrer le plan : échéance trop proche, remise en attente ou liquidités insuffisantes.'
}
const confirming = ref(false)
const notice = ref('')
const sources = [
  { id: 'enterprises', label: 'Entreprises' },
  { id: 'stocks', label: 'Actions' },
  { id: 'crypto', label: 'Cryptomonnaies' },
  { id: 'memecoins', label: 'Memecoins' },
] as const

const backupFileInput = ref<HTMLInputElement | null>(null)
const pendingImport = ref<{state:V8CapitalState;sourceVersion:4|5|6|7|8;exportedAt:number|null}|null>(null)
const importName = ref('')
const importError = ref('')
const backupNotice = ref('')
const resetConfirming = ref(false)
const resetText = ref('')
const importing = ref(false)

const importErrors: Record<'file-too-large' | 'invalid-json' | 'unsupported-version' | 'invalid-save', string> = {
  'file-too-large': 'Fichier trop volumineux (16 Mo maximum).',
  'invalid-json': 'Ce fichier n’est pas un JSON valide.',
  'unsupported-version': 'Format ou version de sauvegarde incompatible (v4 / v5 / v6 / v7 / v8).',
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
    const result = prepareV8SaveImport(contents)
    if (result.ok) {
      const raw=JSON.parse(contents) as Record<string,unknown>
      pendingImport.value={state:result.state,sourceVersion:result.sourceVersion,
        exportedAt:typeof raw.exportedAt==='number'?raw.exportedAt:null}
    }
    else importError.value = importErrors[result.reason]
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
  const before=props.exactState?v(props.exactState.fiscal.taxesPaidCents):0n
  const result = props.payTaxes()
  confirming.value = false
  const actual=props.exactState?v(props.exactState.fiscal.taxesPaidCents)-before:null
  notice.value = result.ok
    ? `Paiement de ${actual!==null ? importMoney(actual.toString()) : money(result.amountCents)} effectué. Nouvelle échéance dans 72 h.`
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
        <div><span>NIVEAU</span><strong>{{ exactProgress?.level ?? overview.level }}</strong></div>
        <div><span>FORTUNE NETTE</span><strong :class="{ 'tax-debt': (exactBalance ? exactBalance.net < 0n : overview.netWorth < 0) }">{{ exactDisplay(exactBalance?.net,overview.netWorth) }}</strong></div>
        <div><span>SOLDE DISPONIBLE</span><strong :class="{ 'tax-debt': (exactBalance ? exactBalance.cash < 0n : state.game.balance < 0) }">{{ exactDisplay(exactBalance?.cash,overview.cash) }}</strong></div>
        <div><span>REVENUS CUMULÉS</span><strong>{{ exactState ? importMoney(exactState.game.lifetimeEarned) : cash(overview.lifetimeEarned) }}</strong></div>
      </section>

      <section class="stats-section stats-progress" aria-label="Progression">
        <div class="stats-section-heading"><h2>Progression</h2><span>{{ exactProgress ? 'PROCHAIN NIVEAU ' + (exactProgress.level + 1) : overview.nextLevelAt === null ? 'NIVEAU MAX' : 'PROCHAIN NIVEAU ' + (overview.level + 1) }}</span></div>
        <div class="stats-progress-meter" role="progressbar" aria-label="Progression du niveau joueur"
          :aria-valuenow="Math.round(exactProgress ? exactProgress.fractionBasisPoints/100 : overview.levelProgressPercent)" aria-valuemin="0" aria-valuemax="100">
          <div :style="{ width: (exactProgress ? exactProgress.fractionBasisPoints/100 : overview.levelProgressPercent) + '%' }"></div>
        </div>
        <div class="stats-progress-description">
          <span>{{ exactState ? importMoney(exactState.prestige.experienceCents).replace(' $','') : format.format(overview.experience) }} XP</span>
          <span>{{ exactProgress ? importMoney((exactProgress.nextCents).toString()).replace(' $','') + ' XP requis' : overview.nextLevelAt === null ? 'Palier final atteint' : format.format(overview.nextLevelAt) + ' XP requis' }}</span>
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
              <span>{{ exactIncome(source.id,source.gains) }}</span>
            </div>
            <div class="stats-source-track" aria-hidden="true">
              <div :style="{ width: (source.fraction * 100) + '%' }"></div>
            </div>
            <div v-if="source.losses > 0" class="stats-source-loss">
              <span>Pertes réalisées</span><strong>−{{ exactIncome('loss:'+source.id,source.losses) }}</strong>
            </div>
          </div>
        </div>
        <div class="stats-totals">
          <div><span>Total des recettes positives ventilées</span><strong>{{ exactState ? importMoney(Object.values(exactState.stats.earnedBySource).reduce((sum,val)=>sum+v(val),0n).toString()) : cash(overview.totalPositiveSources) }}</strong></div>
          <div><span>Plus-values réalisées positives</span><strong>{{ exactTradingTotal(false)!==null ? importMoney(exactTradingTotal(false)!) : cash(overview.totalRealizedTradingProfit) }}</strong></div>
          <div><span>Pertes réalisées (actions et cryptos)</span><strong class="tax-debt">−{{ exactTradingTotal(true)!==null ? importMoney(exactTradingTotal(true)!) : cash(overview.totalRealizedTradingLoss) }}</strong></div>
        </div>
        <p class="stats-footnote">« Historique non ventilé » : revenus issus d’une ancienne sauvegarde, impossibles à répartir avec certitude. Les recettes par source ne sont pas additionnables directement à l’XP, dont le Trading protège les niveaux contre le double crédit après une perte.</p>
      </section>

      <section class="stats-section stats-enterprises" aria-label="Statistiques des entreprises">
        <div class="stats-section-heading"><h2>Entreprises</h2><span>{{ overview.enterpriseCount }} / 20</span></div>
        <div class="stats-mini-grid">
          <div><span>NIVEAUX ACQUIS</span><strong>{{ overview.enterpriseLevels }}</strong></div>
          <div><span>REVENU BRUT / SECONDE</span><strong class="stats-income-value">{{ enterpriseRate }}</strong></div>
          <div><span>REVENUS CUMULÉS</span><strong>{{ exactIncome('enterprises',state.stats.earnedBySource.enterprises) }}</strong></div>
          <div><span>VALEUR COMPTABLE</span><strong>{{ exactDisplay(exactBalance?.invested,overview.enterpriseBookValue) }}</strong></div>
        </div>
        <p class="stats-footnote">La valeur comptable correspond au montant investi. Les entreprises ne peuvent jamais être revendues.</p>
      </section>

      <section class="stats-section stats-assets" aria-label="Patrimoine">
        <div class="stats-section-heading"><h2>Patrimoine</h2><span>BILAN ACTUEL</span></div>
        <div class="stats-balance-list">
          <div><span>Liquidités (découvert inclus)</span><strong :class="{ 'tax-debt': overview.cash < 0 }">{{ exactDisplay(exactBalance?.cash,overview.cash) }}</strong></div>
          <div><span>Actions et cryptos · valeur de marché</span><strong>{{ exactDisplay(exactBalance?.market,overview.assetMarketValue) }}</strong></div>
          <div><span>Entreprises · valeur comptable</span><strong>{{ exactDisplay(exactBalance?.invested,overview.enterpriseBookValue) }}</strong></div>
          <div><span>Collections · valeur comptable</span><strong>{{ exactDisplay(exactBalance?.collection,overview.collectionBookValue) }}</strong></div>
          <div><span>Taxes encore dues</span><strong class="tax-debt">−{{ exactDisplay(exactBalance?.due,overview.taxesDue) }}</strong></div>
          <div class="stats-balance-result"><span>Fortune nette</span><strong :class="{ 'tax-debt': (exactBalance ? exactBalance.net < 0n : overview.netWorth < 0) }">{{ exactDisplay(exactBalance?.net,overview.netWorth) }}</strong></div>
        </div>
        <p class="stats-footnote">Plus-value latente du portefeuille : {{ exactDisplay(exactBalance?.unrealized,overview.unrealizedTradingProfit) }} (déjà intégrée à la valeur de marché, pas ajoutée une seconde fois). Les taxes payées sont déjà déduites du solde.</p>
      </section>

      <section class="stats-section stats-prestige" aria-label="Fame, collections et Prestige absolu">
        <div class="stats-section-heading"><h2>Fame & Prestige</h2>
          <span>{{ fameOverview.absolute.purchasedLevels }} / 120 PALIERS</span>
        </div>
        <div class="stats-prestige-summary">
          <div><span>FAME DISPONIBLE</span><strong>✦ {{ exactFame('fameMicros',fameOverview.available) }}</strong></div>
          <div><span>FAME OBTENUE CE CYCLE</span><strong>{{ exactFame('cycleEarnedFameMicros',fameOverview.earned) }}</strong></div>
          <div><span>GAGNÉE PAR NIVEAUX (CYCLE)</span><strong>{{ exactFame('cycleLevelFameMicros',fameOverview.fromLevels) }}</strong></div>
          <div><span>GAGNÉE PAR COLLECTIONS (CYCLE)</span><strong>{{ exactFame('cycleCollectionFameMicros',fameOverview.fromCollections) }}</strong></div>
          <div><span>DÉPENSÉE EN BOOSTS</span><strong>{{ exactFame('fameSpentMicros', fameOverview.spent) }}</strong></div>
          <div><span>OBJETS ACQUIS</span><strong>{{ fameOverview.ownedCollections }} / {{ fameOverview.totalCollections }}</strong></div>
        </div>
        <div class="stats-absolute-panel" :class="{ 'is-unlocked': fameOverview.absolute.unlocked }">
          <div class="stats-absolute-heading">
            <strong>Prestige absolu</strong>
            <span>{{ (exactAbsolute?.unlocked ?? fameOverview.absolute.unlocked) ? 'DÉBLOQUÉ' : 'VERROUILLÉ' }}</span>
          </div>
          <template v-if="exactAbsolute?.unlocked ?? fameOverview.absolute.unlocked">
            <strong class="stats-absolute-factor">{{ exactAbsolute ? '×'+exactAbsoluteText : prestigeFactor(fameOverview.absolute.factor) }}</strong>
            <p>{{ exactAbsolute ? exactStepText : fameOverview.absolute.fameSteps }} tranches de 100 Fame disponibles · plafond actuel {{ exactAbsolute ? '×'+exactCapText : '×'+(100+(state.ascension?.progress.prestigeCount??0)) }}.
              <span v-if="!(exactAbsolute?.capped ?? fameOverview.absolute.capped)">Prochaine tranche à {{ exactAbsolute ? exactNextFame : fameCount(fameOverview.absolute.nextStepAtFame) }} Fame.</span>
              <span v-else>Plafond atteint ; votre Fame reste disponible.</span></p>
          </template>
          <p v-else>Débloqué gratuitement à 120/120 paliers. Encore
            {{ fameOverview.absolute.requiredLevels - fameOverview.absolute.purchasedLevels }} niveaux à acheter.</p>
          <p>Multiplicateur appliqué aux seuls bonus du Fame Shop, jamais aux collections.</p>
        </div>
        <div class="stats-collections-v3" aria-label="Bonus des collections V3">
          <strong>Collections V3 · {{ collectionV3.owned }}/100</strong>
          <p>Musée impérial : {{ collectionV3.museumComplete ? 'COMPLET · +100 % revenus éligibles et +25 % PP futurs' : 'non débloqué · complétez 100 pièces' }}</p>
          <div v-for="entry in COLLECTION_CATEGORIES" :key="entry.id" class="stats-collection-set">
            <span>{{ entry.label }} : {{ collectionV3.categories[entry.id] }}/20</span>
            <strong>{{ collectionV3.categories[entry.id] === 20 ? 'ACTIF' : 'EN ATTENTE' }} · +{{ percent(COLLECTION_SET_REWARDS[entry.id].bonusBps) }}</strong>
          </div>
          <p>Bonus d’objet et de rareté additionnés à ceux des catégories. Les achats anciens sont conservés.</p>
        </div>
        <div class="stats-prestige-boosts">
          <strong>Vos six bonus permanents</strong>
          <div v-for="boost in fameOverview.boosts" :key="boost.id" class="stats-prestige-boost" :data-boost="boost.id">
            <div><strong>{{ boost.name }}</strong><span>Niveau {{ boost.level }}/20</span></div>
            <p>Shop : +{{ percent(boost.rawShopBps) }}
              <span v-if="exactAbsolute?.unlocked ?? fameOverview.absolute.unlocked"> · avec Prestige : +{{ exactAbsolute ? exactShopPercent(boost.level) : percent(boost.prestigeShopBps) }}</span>
              · Collections V3 : +{{ percent(boost.collectionBps) }}</p>
            <strong class="stats-prestige-total">Total : +{{ exactState ? exactBonusPercent(boost.id as FameBoostId) : percent(boost.totalBps) }}</strong>
          </div>
        </div>
        <p class="stats-footnote">Les bonus s'ajoutent aux sources éligibles et ne recalculent jamais les gains antérieurs. Les objets de collection restent valorisés au prix d'achat dans le patrimoine.</p>
      </section>

      <section class="stats-tax-panel" aria-label="Fiscalité">
        <div class="stats-tax-title"><h2>Administration fiscale</h2><span>Taux marginal {{ Number(marginalTaxRateBps(exactState ? v(exactState.game.lifetimeEarned) : BigInt(Math.round(state.game.lifetimeEarned * 100)))) / 100 }} %</span></div>
        <div class="stats-tax-due">
          <span>TAXES ACCUMULÉES</span>
          <strong>{{ exactState ? importMoney(exactState.fiscal.taxesDueCents) : money(state.fiscal.taxesDueCents) }}</strong>
          <span>Prochain prélèvement automatique : <b>{{ remaining }}</b></span>
        </div>
        <div class="stats-tax-sources">
          <div v-for="source in sources" :key="source.id">
            <span>{{ source.label }}</span>
            <strong>{{ exactState ? importMoney(exactState.fiscal.dueBySourceCents[source.id]) : money(state.fiscal.dueBySourceCents[source.id]) }}</strong>
          </div>
          <div class="stats-tax-total">
            <span>Toutes taxes déjà payées</span>
            <strong>{{ exactState ? importMoney(exactState.fiscal.taxesPaidCents) : money(state.fiscal.taxesPaidCents) }}</strong>
          </div>
        </div>
        <div v-if="exactState && [24,25,26,27].some(id=>fiscalRank(id)>0)" class="stats-tax-v4" aria-label="Fiscalité Fame V4">
          <div class="stats-section-heading"><h3>Fiscalité Fame V4</h3><span>POUVOIRS ACTIFS</span></div>
          <div v-if="fiscalRank(24)>0" class="stats-mini-grid">
            <div><span>RÉSERVE PROTÉGÉE ({{ fiscalRank(24)*20 }} %)</span>
              <strong>{{ importMoney(reserveCents.toString()) }}</strong></div>
            <div><span>CASH UTILISABLE POUR ACHATS</span>
              <strong>{{ importMoney(spendableCents.toString()) }}</strong></div>
          </div>
          <p v-if="fiscalRank(24)>0" class="stats-footnote">La réserve bloque les achats, sans retirer d'argent ni augmenter la fortune. Les prélèvements fiscaux peuvent toujours rendre le solde négatif.</p>
          <div v-if="fiscalRank(25)>0" class="stats-mini-grid">
            <div><span>FIDÉLITÉ FISCALE</span><strong>−{{ fiscalRank(25) }} % sur l'échéance admissible</strong></div>
            <div><span>REMISE FUTURE</span><strong>{{ fiscalV4?.eligiblePeriodAt===exactState.fiscal.periodStartedAt?'ACQUISE · NON UTILISÉE':'NON ACQUISE' }}</strong></div>
            <div><span>REMISES ACCORDÉES</span><strong>{{ importMoney(fiscalV4?.discountsGrantedCents??'0') }}</strong></div>
          </div>
          <p v-if="fiscalRank(25)>0" class="stats-footnote">Pour débloquer la remise sur la prochaine période : paiement anticipé d’au moins 1 M$ effectué 24 h avant l’échéance. Une qualification maximum par 72 h réelles. Jamais de remise rétroactive.</p>
          <div v-if="fiscalRank(26)>0" class="stats-mini-grid">
            <div><span>ÉCHELONNEMENT</span>
              <strong>{{ installmentPlan ? (installmentPlan.paidCount+'/'+installmentPlan.installments+' versements') : 'AUCUN PLAN ACTIF' }}</strong></div>
            <div><span>FRAIS DE GESTION CUMULÉS</span><strong>{{ importMoney(fiscalV4?.managementFeesPaidCents??'0') }}</strong></div>
          </div>
          <p v-if="installmentPlan" class="stats-footnote">Prochain versement : {{ new Date(installmentPlan.startedAt+(installmentPlan.paidCount+1)*V4_TAX_INSTALLMENT_MS).toLocaleString('fr-CH') }}. Les nouveaux impôts restent dus à l’échéance de 72 h ; le Prestige solde tout.</p>
          <button v-else-if="fiscalRank(26)>0" type="button" class="stats-tax-pay" :disabled="!planPossible" @click="confirmingPlan=true">
            Activer {{ fiscalRank(26)+1 }} versements de 12 h · frais {{ importMoney(planFee.toString()) }}
          </button>
          <div v-if="confirmingPlan" class="stats-tax-confirm" role="alertdialog" aria-label="Confirmer l'échelonnement fiscal">
            <strong>Créer un plan fiscal irréversible ?</strong>
            <p>La dette actuelle sera fractionnée en {{ fiscalRank(26)+1 }} versements espacés de 12 h. Frais de 1 % débités immédiatement, sans XP/Fame. Aucun report de l’échéance de 72 h.</p>
            <div><button type="button" @click="confirmingPlan=false">Annuler</button>
              <button type="button" class="stats-tax-confirm-pay" @click="activatePlan">Confirmer</button></div>
          </div>
          <div v-if="taxReport" class="stats-tax-sources" aria-label="Optimisation patrimoniale : bilan exact">
            <div class="stats-section-heading"><h3>Optimisation patrimoniale</h3><span>BILAN V8</span></div>
            <div><span>Gains cumulés enregistrés (trading net de frais)</span><strong>{{ importMoney(taxReport.recordedIncomeCents.toString()) }}</strong></div>
            <div><span>Pertes trading réalisées</span><strong>−{{ importMoney(taxReport.recordedTradingLossCents.toString()) }}</strong></div>
            <div><span>Taxes déjà réglées</span><strong>−{{ importMoney(taxReport.recordedTaxCents.toString()) }}</strong></div>
            <div><span>Frais d'échelonnement enregistrés</span><strong>−{{ importMoney(taxReport.feesCents.toString()) }}</strong></div>
            <div><span>Revenu comptable net de ces charges</span><strong>{{ importMoney(taxReport.estimatedNetCents.toString()) }}</strong></div>
            <div><span>Dette fiscale restante</span><strong>{{ importMoney(taxReport.dueCents.toString()) }}</strong></div>
            <div><span>Simulation : prochaine dette avec remise théorique</span><strong>{{ importMoney(taxReport.simulatedNextTaxCents.toString()) }}</strong></div>
            <p class="stats-footnote">Simulation pure, non prédictive : elle suppose la dette constante et une remise admissible. Les frais historiques de trading étaient déjà inclus dans les plus-values nettes, et ne sont pas disponibles séparément dans les anciennes sauvegardes. Aucun montant n'est ajouté à la progression.</p>
          </div>
        </div>
        <p class="stats-tax-help">Barème progressif de 15 à 70 % sur les gains du cycle. Seuls les revenus d'entreprises et les bénéfices réalisés du trading sont taxés. La dette s'accumule et est prélevée toutes les 72 heures réelles, même en cas de solde négatif.</p>
        <button type="button" class="stats-tax-pay" :disabled="(exactState ? v(exactState.fiscal.taxesDueCents) === 0n : state.fiscal.taxesDueCents === 0)" @click="confirming = true">
          Payer les taxes maintenant
        </button>
        <div v-if="confirming" class="stats-tax-confirm" role="alertdialog" aria-modal="false" aria-label="Confirmer le paiement fiscal">
          <strong>Confirmer le paiement anticipé ?</strong>
          <p>Montant total : {{ exactState ? importMoney(exactState.fiscal.taxesDueCents) : money(state.fiscal.taxesDueCents) }}. Le solde peut devenir négatif. Le compteur repartira de 72 heures.</p>
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
            <span>Argent de la sauvegarde</span><strong>{{ importMoney(pendingImport.state.game.balance) }}</strong>
            <span>Entreprises possédées</span><strong>{{ Object.keys(pendingImport.state.enterprises.owned).length }} / 20</strong>
            <span>Taxes accumulées</span><strong>{{ importMoney(pendingImport.state.fiscal.taxesDueCents) }}</strong>
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
