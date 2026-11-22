<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import type { CapitalState } from '../capital.ts'
import { FAME_BOOSTS, getV2NextFameBoostCost, FAME_BOOST_BPS_PER_LEVEL, type FameBoostId } from '../prestige/catalog.ts'
import type { V8CapitalState } from '../exact-state-v8.ts'
import { getExactAmount } from '../exact-state-v8.ts'
import { formatFameMicros, formatCompactUnits } from '../large-numbers.ts'
import { getBonusBreakdown } from '../prestige/bonuses.ts'
import { getAbsolutePrestigeStatus } from '../prestige/absolute.ts'
import { v8AbsoluteFameStatus, exactAbsoluteFameStatus, FAME_FACTOR_SCALE,
  formatFameFactor, formatExactBasisPoints } from '../prestige/absolute-v8.ts'
import { prestigeCycleCount } from '../ascension/prestige-count-v8.ts'
import { collectionV3Snapshot, collectionV3BonusBps } from '../prestige/collections-v3.ts'
import { getFameShopOffers, type FameShopError, type FameShopPurchase } from '../prestige/shop.ts'
import { quoteV8FameBoostMax } from '../exact-runtime-v8.ts'
import { FAME_V4_CATALOG, FAME_V4_TOTAL_LEVELS, fameV4NextCost } from '../prestige/fame-v4-catalog.ts'
import { quoteFameV4Max } from '../prestige/fame-v4-ledger.ts'
import { FAME_V4_PRESENTATION, FAME_V4_GROUP_TABS, fameV4RankPreview,
  type FameV4Tab } from '../prestige/fame-v4-presentation.ts'

const props = defineProps<{
  state: CapitalState
  exactState?: V8CapitalState
  purchaseBoost: (id: string, currentLevel: number) => FameShopPurchase
  purchaseBoostMax?: (id: string, currentLevel: number) => {levels:number;costFame:bigint}|null
  purchaseV4?: (id: string, currentLevel: number) => boolean
  purchaseV4Max?: (id: string, currentLevel: number) => {levels:number;costFame:bigint}|null
}>()
const emit = defineEmits<{ back: [] }>()
const returnButton = ref<HTMLButtonElement | null>(null)
const activeTab = ref<FameV4Tab>('classic')
const notice = ref('')
const noticeError = ref(false)
const numeric = new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 2 })
const integer = new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 0 })
const formatCost = (amount:bigint|null) => amount===null?'NIVEAU MAX':integer.format(amount)+' Fame'
const fame = (micros: number) => formatFameMicros(BigInt(Math.round(micros)))
const fameBalance = computed(() => props.exactState
  ? formatFameMicros(getExactAmount(props.exactState.prestige.fameMicros))
  : fame(props.state.prestige.fameMicros))
const fameAvailable = computed(() => props.exactState ? getExactAmount(props.exactState.prestige.fameMicros) : 0n)
const percentage = (basisPoints: number) => numeric.format(basisPoints / 100) + ' %'
const offers = computed(() => props.exactState ? FAME_BOOSTS.map(boost => {
  const currentLevel = props.exactState!.prestige.boosts[boost.id]
  const nextCostFame = getV2NextFameBoostCost(boost.id, currentLevel)
  return {
    boostId: boost.id, currentLevel, maxLevel: 20 as const,
    currentBonusBps: currentLevel * FAME_BOOST_BPS_PER_LEVEL,
    nextBonusBps: nextCostFame === null ? null : (currentLevel + 1) * FAME_BOOST_BPS_PER_LEVEL,
    nextCostFame,
    canAfford: nextCostFame !== null && fameAvailable.value >= BigInt(nextCostFame) * 1_000_000n,
  }
}) : getFameShopOffers(props.state))
const rows = computed(() => FAME_BOOSTS.map((boost, index) => ({
  boost, offer: offers.value[index]!,
  collectionBonus: props.exactState ?
    collectionV3BonusBps(collectionV3Snapshot(props.exactState.prestige.ownedCollectionIds), boost.id) :
    getBonusBreakdown(props.state, boost.id).collectionBps,
  maxQuote: props.exactState ? quoteV8FameBoostMax(props.exactState,boost.id,props.exactState.prestige.boosts[boost.id]) : null,
})))
const purchasedLevels = computed(() => offers.value.reduce((total, offer) => total + offer.currentLevel, 0))
const v4Levels = computed(() => props.exactState?.prestige.fameV4?.levels)
const purchasedV4 = computed(() => FAME_V4_CATALOG.reduce((sum,item) => sum+(v4Levels.value?.[item.id] ?? 0),0))
const purchasedAll = computed(() => purchasedLevels.value+purchasedV4.value)
const v4Rows = computed(() => activeTab.value==='classic' ? [] :
  FAME_V4_CATALOG.filter(item=>item.group===activeTab.value).map(item=>{
    const level=v4Levels.value?.[item.id] ?? 0
    const cost=fameV4NextCost(item.id,level)
    const maxQuote=props.exactState ? quoteFameV4Max(props.exactState,item.id,level) : null
    return {item,level,cost,maxQuote,canAfford:cost!==null&&fameAvailable.value>=cost*1_000_000n,
      presentation:FAME_V4_PRESENTATION[item.id]}
  }))
const currentTab = computed(() => FAME_V4_GROUP_TABS.find(tab=>tab.id===activeTab.value)!)
const tabCounts = (id:FameV4Tab) => id==='classic' ? 6 :
  FAME_V4_CATALOG.filter(item=>item.group===id).length
const tabOwned = (id:FameV4Tab) => id==='classic' ? purchasedLevels.value :
  FAME_V4_CATALOG.filter(item=>item.group===id).reduce((sum,item)=>sum+(v4Levels.value?.[item.id]??0),0)
const tabMax = (id:FameV4Tab) => id==='classic' ? 120 :
  FAME_V4_CATALOG.filter(item=>item.group===id).reduce((sum,item)=>sum+item.maxLevel,0)

const absolute = computed(() => getAbsolutePrestigeStatus(props.state))
const exactAbsolute = computed(() => props.exactState ? v8AbsoluteFameStatus(props.exactState) : null)
const absoluteUnlocked = computed(() => exactAbsolute.value?.unlocked ?? absolute.value.unlocked)
const absoluteCapped = computed(() => exactAbsolute.value?.capped ?? absolute.value.capped)
const factorText = computed(() => exactAbsolute.value ?
  '×' + formatFameFactor(exactAbsolute.value.factorUnits).replace('.', ',') + (exactAbsolute.value.capped ? ' · MAX' : '') :
  '×' + new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 6 }).format(absolute.value.factor) +
    (absolute.value.capped ? ' · MAX' : ''))
const capText = computed(() => exactAbsolute.value ?
  '×' + formatFameFactor(exactAbsolute.value.capUnits).replace('.', ',') :
  '×' + numeric.format(100 + (props.state.ascension?.progress.prestigeCount ?? 0)))
const fameStepsText = computed(() => exactAbsolute.value ?
  formatCompactUnits(exactAbsolute.value.fameSteps, 0, '') : numeric.format(absolute.value.fameSteps))
const nextStepText = computed(() => exactAbsolute.value ?
  formatFameMicros(exactAbsolute.value.nextStepAtFameMicros).replace(/\.0$/, '') : numeric.format(absolute.value.nextStepAtFame))
const exactShopBonus = (baseBps:number) => {
  const status=exactAbsolute.value
  if(!status || !props.exactState)return percentage(baseBps*absolute.value.factor)
  return formatExactBasisPoints(BigInt(baseBps)*status.factorUnits, FAME_FACTOR_SCALE)
}
const remainingSteps = computed(() => Math.max(0, absolute.value.requiredLevels - absolute.value.purchasedLevels))
/** Before/after is calculated in exact fixed-point units, NEVER with floating Fame.
 * V4 previews only change available Fame, not the 120-rank absolute unlock. */
function factorAfter(costFame:bigint|null,legacyId?:FameBoostId,newLevel?:number):string {
  const exact=props.exactState
  if(!exact || costFame===null || fameAvailable.value<costFame*1_000_000n)return ''
  const levels={...exact.prestige.boosts}
  if(legacyId!==undefined && newLevel!==undefined)levels[legacyId]=newLevel
  const status=exactAbsoluteFameStatus(levels,fameAvailable.value-costFame*1_000_000n,
    prestigeCycleCount(exact.ascension.progress))
  return '×'+formatFameFactor(status.factorUnits).replace('.',',')
}
const errors: Record<FameShopError, string> = {
  'unknown-boost': 'Cette amélioration est introuvable.',
  'invalid-state': 'La sauvegarde Fame est incohérente. Aucun achat effectué.',
  'stale-level': 'Le palier a changé. Vérifiez le nouveau prix.',
  'max-level': 'Ce bonus a atteint son niveau maximum.',
  'insufficient-fame': 'Fame insuffisante pour cet achat.',
}
function report(text:string,error=false){notice.value=text;noticeError.value=error}
function purchase(id:string,level:number){
  const result=props.purchaseBoost(id,level)
  report(result.ok
    ? 'Amélioration classique achetée : niveau '+result.receipt.newLevel+'/20 · −'+result.receipt.costFame+' Fame.'
    : errors[result.error],!result.ok)
}
function purchaseClassicMax(id:string,level:number){
  const result=props.purchaseBoostMax?.(id,level)
  report(result ? 'MAX classique : +'+result.levels+' niveaux · −'+formatCost(result.costFame)+'.'
    : 'Aucun palier MAX acheté. Vérifiez le solde ou la sauvegarde.',!result)
}
function purchaseNew(id:string,level:number){
  const success=props.purchaseV4?.(id,level)??false
  report(success
    ? 'Fame V4 : niveau '+(level+1)+' acheté. '+(FAME_V4_CATALOG.find(x=>x.id===id)?.group==='trading'?'Pouvoir Trading actif.':'Effet prévu pour une prochaine passe.')+''
    : 'Achat V4 impossible. Vérifiez le prix, le niveau et la sauvegarde.',!success)
}
function purchaseNewMax(id:string,level:number){
  const result=props.purchaseV4Max?.(id,level)
  report(result ? 'MAX V4 : +'+result.levels+' niveaux achetés · −'+formatCost(result.costFame)+'. Effet prévu.'
    : 'Aucun palier V4 acheté. Vérifiez le solde ou la sauvegarde.',!result)
}
function changeTab(tab:FameV4Tab){activeTab.value=tab;notice.value='';noticeError.value=false}
function returnHome(){emit('back')}
onMounted(()=>{void nextTick(()=>returnButton.value?.focus())})
</script>

<template>
  <main id="fame-shop" class="fame-shop-screen" aria-label="Boutique Fame">
    <header class="fame-shop-page-header">
      <button ref="returnButton" type="button" class="fame-shop-return" aria-label="Retour à l'accueil" @click="returnHome">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M19 12H5m7 7-7-7 7-7"/>
        </svg>
        <span>Accueil</span>
      </button>
      <div class="prestige-dialog-heading fame-shop-page-heading">
        <span class="prestige-eyebrow"><span aria-hidden="true">✦</span> MONNAIE DE PRESTIGE · V4</span>
        <h1 id="fame-shop-title">Fame Shop</h1>
        <p>36 pouvoirs permanents · 7 catégories</p>
      </div>
    </header>

    <div class="fame-shop-summary">
      <div><span>SOLDE FAME</span><strong><span aria-hidden="true">✦</span> {{ fameBalance }}</strong></div>
      <div><span>PROGRESSION GLOBALE</span><strong data-fame-v4-total>{{ purchasedAll }} / {{ 120 + FAME_V4_TOTAL_LEVELS }}</strong>
        <small>Classique {{ purchasedLevels }} / 120 · V4 {{ purchasedV4 }} / 196</small>
      </div>
    </div>

    <div class="fame-v4-tabs" role="tablist" aria-label="Catégories du Fame Shop" data-no-page-swipe>
      <button v-for="tab in FAME_V4_GROUP_TABS" :key="tab.id" type="button" role="tab"
        :id="'fame-tab-'+tab.id" class="fame-v4-tab" :class="{ 'is-active': activeTab===tab.id }"
        :aria-selected="activeTab===tab.id" :aria-controls="'fame-panel-'+tab.id"
        @click="changeTab(tab.id)">
        <span>{{ tab.label }}</span>
        <small>{{ tabOwned(tab.id) }}/{{ tabMax(tab.id) }}</small>
      </button>
    </div>

    <div :id="'fame-panel-'+activeTab" class="fame-shop-page-scroll fame-shop-scroll"
      role="tabpanel" :aria-labelledby="'fame-tab-'+activeTab" :aria-label="'Améliorations '+currentTab.label+' disponibles'">
      <template v-if="activeTab==='classic'">
        <article v-for="row in rows" :key="row.boost.id" class="fame-boost-card" :data-boost="row.boost.id">
          <div class="fame-boost-heading">
            <div class="fame-boost-heading-main">
              <strong>{{ row.boost.label }}</strong>
              <p>{{ row.boost.description }}</p>
            </div>
            <span class="fame-boost-level">NIV. {{ row.offer.currentLevel }}/20</span>
          </div>
          <div class="fame-boost-track" role="progressbar" :aria-label="'Niveau de '+row.boost.label"
            :aria-valuenow="row.offer.currentLevel" aria-valuemin="0" aria-valuemax="20">
            <span :style="{width:(row.offer.currentLevel*5)+'%'}"></span>
          </div>
          <div class="fame-boost-meta">
            <span>Shop : <b>+{{ percentage(row.offer.currentBonusBps) }}</b></span>
            <span v-if="absoluteUnlocked">Shop avec Prestige : <b>+{{ exactShopBonus(row.offer.currentBonusBps) }}</b></span>
            <span v-if="row.collectionBonus>0">Collection : <b>+{{ percentage(row.collectionBonus) }}</b></span>
            <span v-if="row.offer.nextBonusBps!==null">Prochain : <b>+{{ percentage(row.offer.nextBonusBps) }}</b></span>
            <span v-else class="fame-boost-max">Bonus au maximum</span>
          </div>
          <div class="fame-boost-footer">
            <div class="fame-boost-cost">
              <span>PROCHAIN PALIER</span>
              <strong>{{ row.offer.nextCostFame===null?'NIVEAU MAX':formatCost(BigInt(row.offer.nextCostFame)) }}</strong>
              <small v-if="row.maxQuote" class="fame-v4-max-cost">MAX : +{{ row.maxQuote.levels }} niv. · {{ formatCost(row.maxQuote.costFame) }}</small>
            </div>
            <div class="fame-v4-buttons">
              <button type="button" class="fame-buy-button" :disabled="!row.offer.canAfford"
                :aria-label="'Améliorer '+row.boost.label+' au niveau '+(row.offer.currentLevel+1)"
                @click="purchase(row.boost.id,row.offer.currentLevel)">
                {{ row.offer.nextCostFame===null?'MAX':row.offer.canAfford?'ACHETER':'FAME INSUFF.' }}
              </button>
              <button type="button" class="fame-v4-max-button" :disabled="!row.maxQuote || !purchaseBoostMax"
                :aria-label="'Acheter MAX '+row.boost.label"
                @click="purchaseClassicMax(row.boost.id,row.offer.currentLevel)">MAX</button>
            </div>
          </div>
          <p v-if="row.offer.canAfford && exactState && absoluteUnlocked" class="fame-v4-factor-preview">
            Prestige absolu : {{ factorText }} → {{ factorAfter(BigInt(row.offer.nextCostFame!),row.boost.id,row.offer.currentLevel+1) }}
          </p>
        </article>
        <article class="absolute-prestige-card" :class="{ 'absolute-prestige-unlocked': absoluteUnlocked }" data-boost="absolute">
          <div class="absolute-prestige-heading">
            <div><span class="prestige-eyebrow">✦ ULTIME AMÉLIORATION</span><h3>Prestige absolu</h3></div>
            <span class="absolute-prestige-state">{{ absoluteUnlocked?'DÉBLOQUÉ':'VERROUILLÉ' }}</span>
          </div>
          <p v-if="!absoluteUnlocked">
            Déblocage automatique et gratuit après les 120 niveaux classiques du Fame Shop.
            Encore {{ remainingSteps }} {{ remainingSteps===1?'palier':'paliers' }} à acheter.
          </p>
          <template v-else>
            <strong class="absolute-prestige-factor">{{ factorText }}</strong>
            <p>Chaque tranche entière de 100 Fame <b>disponibles</b> multiplie uniquement les six bonus classiques par ×1,01. Plafond actuel : <b>{{ capText }}</b> (100 + Prestiges terminés).</p>
            <div class="absolute-prestige-details">
              <span>{{ fameStepsText }} tranches actives</span>
              <span v-if="!absoluteCapped">Prochaine tranche : {{ nextStepText }} Fame</span>
              <span v-else>Plafond de sécurité atteint · Fame conservée</span>
            </div>
          </template>
          <p class="absolute-prestige-footnote">Les 30 pouvoirs V4 et les collections ne sont jamais amplifiés par le Prestige absolu.</p>
        </article>
      </template>
      <template v-else>
        <div class="fame-v4-group-heading">
          <div><h2>{{ currentTab.label }}</h2><p>{{ currentTab.hint }} · {{ tabCounts(activeTab) }} pouvoirs</p></div>
          <span>ÉTAPE {{ currentTab.pass }}</span>
        </div>
        <p class="fame-v4-pending" role="note">
          Niveaux permanents conservés au Prestige.
          <template v-if="currentTab.id==='trading'">Pouvoirs Trading actifs : effets économiques, outils d'analyse et ventes automatiques disponibles.</template>
          <template v-else>Les effets de cette catégorie sont prévus pour la passe {{ currentTab.pass }}.</template>
        </p>
        <article v-for="row in v4Rows" :key="row.item.id" class="fame-boost-card fame-v4-card" :data-v4-boost="row.item.id">
          <div class="fame-boost-heading">
            <div class="fame-boost-heading-main">
              <strong><small>{{ row.item.id.slice(-2) }}</small> {{ row.item.label }}</strong>
              <p>{{ row.presentation.description }}</p>
            </div>
            <span class="fame-boost-level">NIV. {{ row.level }}/{{ row.item.maxLevel }}</span>
          </div>
          <div class="fame-boost-track" role="progressbar" :aria-label="'Niveau de '+row.item.label"
            :aria-valuenow="row.level" aria-valuemin="0" :aria-valuemax="row.item.maxLevel">
            <span :style="{width:(row.level/row.item.maxLevel*100)+'%'}"></span>
          </div>
          <div class="fame-v4-effect">
            <div><span>EFFET PRÉVU ACQUIS</span><strong>{{ fameV4RankPreview(row.item.id,row.level) }}</strong></div>
            <div><span>PROCHAIN NIVEAU</span><strong>{{ row.cost===null?'COMPLET':fameV4RankPreview(row.item.id,row.level+1) }}</strong></div>
          </div>
          <p class="fame-v4-mechanic">{{ row.presentation.effect }}</p>
          <div class="fame-boost-footer">
            <div class="fame-boost-cost">
              <span>PROCHAIN PALIER</span>
              <strong>{{ formatCost(row.cost) }}</strong>
              <small v-if="row.maxQuote" class="fame-v4-max-cost">MAX : +{{ row.maxQuote.levels }} niv. · {{ formatCost(row.maxQuote.costFame) }}</small>
            </div>
            <div class="fame-v4-buttons">
              <button type="button" class="fame-buy-button" :disabled="!row.canAfford || !purchaseV4"
                :aria-label="'Acheter '+row.item.label+' niveau '+(row.level+1)"
                @click="purchaseNew(row.item.id,row.level)">
                {{ row.cost===null?'MAX':row.canAfford?'ACHETER':'FAME INSUFF.' }}
              </button>
              <button type="button" class="fame-v4-max-button" :disabled="!row.maxQuote || !purchaseV4Max"
                :aria-label="'Acheter MAX '+row.item.label"
                @click="purchaseNewMax(row.item.id,row.level)">MAX</button>
            </div>
          </div>
          <p v-if="row.canAfford && exactState && absoluteUnlocked" class="fame-v4-factor-preview">
            Prestige absolu : {{ factorText }} → {{ factorAfter(row.cost) }}
            <span v-if="row.maxQuote"> · après MAX : {{ factorAfter(row.maxQuote.costFame) }}</span>
          </p>
        </article>
      </template>
    </div>
    <footer class="fame-shop-page-footer">
      <p class="fame-shop-note">Achats définitifs en Fame. Les niveaux V4 persistent au Prestige. Trading actif ; les autres effets ne sont pas encore activés (passes 4–8).</p>
      <p v-if="notice" role="status" aria-live="polite" class="prestige-notice"
        :class="{ 'prestige-notice-error':noticeError }">{{ notice }}</p>
    </footer>
  </main>
</template>
