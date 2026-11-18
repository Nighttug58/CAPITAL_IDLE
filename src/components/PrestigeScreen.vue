<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import type { CapitalState } from '../capital.ts'
import type { V8CapitalState } from '../exact-state-v8.ts'
import { prestigeShop,prestigeCost,MIN_LEVEL as ASCENSION_MIN_LEVEL,MIN_WORTH_CENTS } from '../ascension/v2.ts'
import { v8EligiblePrestigeWorthCents, v8PrestigeRewardPreview } from '../exact-prestige-v8.ts'
import { pendingStartingCapitalCents } from '../ascension/transcendent-v1.ts'
import { getExactLevel } from '../exact-levels.ts'
import { formatCompactUnits } from '../large-numbers.ts'
const ASCENSION_MIN_WORTH_USD=Number(MIN_WORTH_CENTS)/100
import { ASCENSION_CATEGORIES, ASCENSION_PRESENTATION } from '../ascension/presentation.ts'
import { type AscensionPurchase, type AscensionShopError } from '../ascension/shop.ts'
import type { AscensionError, AscensionResult } from '../ascension/engine.ts'
import { MARKET_SPEEDS, marketSpeed, frenzyActive, type MarketActionResult } from '../ascension/market-effects.ts'
import { v8MarketNewsEffects } from '../exact-market-v8.ts'
import { TRANSCENDENT_MAX_LEVEL, TRANSCENDENT_NEWS_PRESENTATION, transcendentLevel, transcendentNextCost, type TranscendentNewsId } from '../ascension/transcendent-v1.ts'

const props = defineProps<{
  exact: V8CapitalState
  state: CapitalState
  focusTranscendentOnMount?:boolean
  purchaseUpgrade: (id: string, currentLevel: number) => AscensionPurchase
  purchaseNewsUpgrade?: (id:TranscendentNewsId,currentRank:number,quotedCost:bigint)=>boolean
  performCycle: () => AscensionResult
  selectSpeed: (speed: number) => MarketActionResult
  activateFrenzy: () => MarketActionResult
}>()
const emit = defineEmits<{ back: []; 'open-transcendent': [] }>()

const returnButton = ref<HTMLButtonElement | null>(null)
const confirmField = ref<HTMLInputElement | null>(null)
const confirming = ref(false)
const confirmText = ref('')
const busy = ref(false)
const notice = ref('')
const noticeError = ref(false)

const number = new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 2 })
const integer = new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 0 })
const cash = (amount: number) => number.format(amount) + ' $'
const fmt = (value: number|bigint|string) => integer.format(typeof value === "string" ? BigInt(value) : value)

const worth = computed(() => v8EligiblePrestigeWorthCents(props.exact))
const level = computed(() => getExactLevel(BigInt(props.exact.prestige.experienceCents)))
const pointPreview = computed(() => v8PrestigeRewardPreview(props.exact,worth.value,level.value).earned)
const nextCycleCapital = computed(() => pendingStartingCapitalCents(props.exact.ascension.progress))
const progress = computed(() => props.exact.ascension.progress)
const currentSpeed = computed(() => marketSpeed(props.state))
const unlockedSpeedLevel = computed(() => progress.value.upgradeLevels['time-accelerator'])
const hasFrenzy = computed(() => progress.value.upgradeLevels['market-frenzy'] > 0)
const frenzyOn = computed(() => frenzyActive(props.state, props.state.trading.dividendLastPaidAt))
const frenzyRemaining = computed(() => Math.max(0, (props.state.ascension.run.frenzyReadyAtRealMs ?? 0) - props.state.trading.dividendLastPaidAt))
const frenzyTime = computed(() => Math.ceil(frenzyRemaining.value / 60_000))

const activeUpgrades = prestigeShop
const totalLevels = activeUpgrades.reduce((sum, item) => sum + item.maxLevel, 0)
const purchasedLevels = computed(() => activeUpgrades.reduce((sum, item) => sum + progress.value.upgradeLevels[item.id], 0))
const spentPoints = computed(() => BigInt(progress.value.lifetimePoints) - BigInt(progress.value.availablePoints))
const toGo = computed(() => totalLevels - purchasedLevels.value)
const advancedNews = computed(() => TRANSCENDENT_NEWS_PRESENTATION.map(row=>{
  const rank=transcendentLevel(progress.value,row.id)
  const cost=transcendentNextCost(rank)
  return {...row,rank,cost,canBuy:progress.value.prestigeCount>=3 && cost!==null &&
    BigInt(progress.value.availablePoints)>=cost}
}))
const newsModifiers = computed(() => v8MarketNewsEffects(props.exact,props.state.trading.dividendLastPaidAt))
const advancedNewsSum = computed(() => advancedNews.value.reduce((sum,row)=>sum+row.rank,0))
const affordPrestige = computed(() => level.value >= ASCENSION_MIN_LEVEL &&
  worth.value !== null && worth.value >= MIN_WORTH_CENTS)
const worthProgress = computed(() => Math.min(100, Math.max(0, Number(worth.value*100n/MIN_WORTH_CENTS))))
const sections = computed(() => ASCENSION_CATEGORIES.map(category => ({
  ...category,
  rows: ASCENSION_PRESENTATION.filter(item => item.category === category.id && activeUpgrades.some(def => def.id === item.id)).map(item => ({
    item,
    def: prestigeShop.find(def => def.id === item.id)!,
    offer: (() => {
      const currentLevel=progress.value.upgradeLevels[item.id]
      const nextCost=prestigeCost(item.id,currentLevel)
      const gate=prestigeShop.find(row=>row.id===item.id)!.cycle
      return {currentLevel,nextCost,gate,canAfford:progress.value.prestigeCount>=gate && nextCost!==null && BigInt(progress.value.availablePoints)>=BigInt(nextCost)}
    })(),
  })),
})).filter(section=>section.rows.length))

const shopErrors: Record<AscensionShopError, string> = {
  'unknown-upgrade': 'Amélioration introuvable.',
  'invalid-state': 'Les points Prestige enregistrés sont incohérents.',
  'stale-level': 'Ce niveau a déjà changé : vérifie le prix actualisé.',
  'max-level': 'Cette amélioration est au niveau maximum.',
  'insufficient-points': 'Points Prestige insuffisants.',
  'storage-error': 'Sauvegarde impossible : aucun PP n’a été dépensé.',
}
const cycleErrors: Record<AscensionError, string> = {
  'invalid-clock': 'Horloge incohérente. Réessaie une fois le jeu synchronisé.',
  'pending-market-replay': 'Le marché et les dividendes terminent leur rattrapage. Réessaie dans un instant.',
  'insufficient-level': 'Le niveau 150 est nécessaire pour chaque Prestige.',
  'insufficient-worth': 'Il faut au moins 10 milliards $ de patrimoine éligible.',
  'money-overflow': 'Montants ou calcul économique non représentables. Le cycle est conservé.',
  'storage-error': 'La sauvegarde a échoué : ton empire et tes PP restent inchangés.',
}

function buy(id: string, expected: number) {
  if (busy.value || confirming.value) return
  busy.value = true
  try {
    const result = props.purchaseUpgrade(id, expected)
    noticeError.value = !result.ok
    const label = ASCENSION_PRESENTATION.find(row => row.id === id)?.label ?? id
    notice.value = result.ok
      ? label + ' : niveau ' + result.receipt.newLevel + ' acheté pour ' + fmt(result.receipt.costPoints) + ' PP.'
      : shopErrors[result.error]
  } finally { busy.value = false }
}

function buyNewsAdvanced(id:TranscendentNewsId,expectedRank:number,cost:bigint|null) {
  if (busy.value || confirming.value || cost===null || !props.purchaseNewsUpgrade)return
  busy.value=true
  try{
    const ok=props.purchaseNewsUpgrade(id,expectedRank,cost)
    noticeError.value=!ok
    notice.value=ok
      ? 'Bonus News '+id+' : niveau '+(expectedRank+1)+' acquis pour '+fmt(cost)+' PP.'
      : 'Achat refusé : niveau, PP ou sauvegarde indisponibles.'
  }finally{busy.value=false}
}
function changeMarketSpeed(speed: number) {
  if (busy.value || confirming.value) return
  const result = props.selectSpeed(speed)
  noticeError.value = !result.ok
  notice.value = result.ok ? 'Vitesse du marché : ×' + speed + ' activée.'
    : result.error === 'locked' ? 'Cette vitesse doit être débloquée dans la boutique.'
    : result.error === 'pending-replay' ? 'Le marché doit finir son rattrapage avant de changer la vitesse.'
    : 'Impossible de sauvegarder la nouvelle vitesse.'
}
function launchFrenzy() {
  if (busy.value || confirming.value) return
  const result = props.activateFrenzy()
  noticeError.value = !result.ok
  notice.value = result.ok ? 'Frénésie activée : news ±50 % pendant 60 secondes réelles.'
    : result.error === 'cooldown' ? 'Le pouvoir est encore en recharge.'
    : result.error === 'locked' ? 'Achète Frénésie boursière pour débloquer le pouvoir.'
    : result.error === 'pending-replay' ? 'Le marché doit finir son rattrapage avant d’activer le pouvoir.'
    : 'Pouvoir temporairement indisponible.'
}

function openConfirmation() {
  if (!affordPrestige.value || busy.value) return
  notice.value = ''
  confirmText.value = ''
  confirming.value = true
  void nextTick(() => confirmField.value?.focus())
}

function closeConfirmation() {
  if (busy.value) return
  confirming.value = false
  confirmText.value = ''
  void nextTick(() => returnButton.value?.focus())
}

function confirmPrestige() {
  if (busy.value || !confirming.value || confirmText.value !== 'PRESTIGE') return
  busy.value = true
  try {
    const result = props.performCycle()
    noticeError.value = !result.ok
    notice.value = result.ok
      ? 'Prestige n°' + fmt(result.receipt.cycle) + ' réalisé : +' + fmt(result.receipt.earnedPoints) +
        ' PP permanents.' + (result.receipt.taxesSettledCents > 0
          ? ' Impôts soldés : ' + cash(result.receipt.taxesSettledCents / 100) + '.' : '')
      : cycleErrors[result.error]
    if (result.ok) {
      confirming.value = false
      confirmText.value = ''
      void nextTick(() => returnButton.value?.focus())
    }
  } finally { busy.value = false }
}

function keyboard(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  event.preventDefault()
  if (confirming.value) closeConfirmation()
  else if (!busy.value) emit('back')
}

onMounted(() => {
  window.addEventListener('keydown', keyboard)
  void nextTick(() => (props.focusTranscendentOnMount
    ? document.querySelector<HTMLButtonElement>('.transcendent-launch')
    : returnButton.value)?.focus())
})
onUnmounted(() => window.removeEventListener('keydown', keyboard))
</script>

<template>
  <main class="ascension-screen" aria-label="Boutique Prestige" id="prestige-shop">
    <header class="ascension-page-header">
      <button ref="returnButton" type="button" class="ascension-return"
        aria-label="Retour à l'accueil depuis Prestige" @click="emit('back')">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M19 12H5m7 7-7-7 7-7"/>
        </svg>
        Accueil
      </button>
      <div>
        <span class="ascension-eyebrow">EMPIRE FINANCIER · PROGRESSION PERMANENTE</span>
        <h1>Prestige</h1>
        <p>Réinitialise ton empire pour obtenir des Points de Prestige et débloquer des mécaniques inédites.</p>
      </div>
    </header>

    <section class="ascension-summary" aria-label="Points et cycles de Prestige">
      <div><span>POINTS DISPONIBLES</span><strong>{{ fmt(progress.availablePoints) }} <small>PP</small></strong></div>
      <div><span>CYCLES PRESTIGE</span><strong>{{ fmt(progress.prestigeCountExact??progress.prestigeCount) }}</strong></div>
      <div><span>AMÉLIORATIONS</span><strong>{{ purchasedLevels }} / {{ totalLevels }}</strong></div>
      <div><span>PP DÉPENSÉS</span><strong>{{ fmt(spentPoints) }}</strong></div>
    </section>

    <div class="ascension-scroll">
      <section class="ascension-prestige-panel" aria-label="Effectuer un nouveau Prestige">
        <div class="ascension-panel-title">
          <div><span class="ascension-eyebrow">PROCHAIN CYCLE</span><h2>Recommencer plus fort</h2></div>
          <strong>+{{ fmt(pointPreview) }} PP</strong>
        </div>
        <div class="ascension-checks">
          <div><span>Niveau du cycle</span><strong :class="{ 'ascension-good': level >= ASCENSION_MIN_LEVEL }">{{ level }} / {{ ASCENSION_MIN_LEVEL }}</strong></div>
          <div><span>Patrimoine éligible (net des taxes, hors collections)</span><strong>{{ formatCompactUnits(worth,2,'$') }}</strong></div>
          <div><span>Seuil de patrimoine</span><strong>{{ cash(ASCENSION_MIN_WORTH_USD) }}</strong></div>
          <div><span>Taxes soldées automatiquement au Prestige</span><strong :class="{ 'ascension-good': state.fiscal.taxesDueCents === 0 }">{{ cash(state.fiscal.taxesDueCents / 100) }}</strong></div>
        </div>
        <div class="ascension-worth-track" role="progressbar" aria-label="Progression du patrimoine Prestige"
          :aria-valuenow="Math.round(worthProgress)" aria-valuemin="0" aria-valuemax="100">
          <span :style="{ width: worthProgress + '%' }"></span>
        </div>
        <p class="ascension-help">Aucun paiement manuel nécessaire : les taxes dues sont prélevées à la confirmation. Elles sont déjà déduites du patrimoine servant au calcul des PP. Le calendrier fiscal de 72 h réelles continue sans remise à zéro.</p>
        <p class="ascension-help">Capital de départ au prochain cycle : <strong>{{ formatCompactUnits(nextCycleCapital) }}</strong>. La dotation n'accorde aucun XP, Fame ou PP, et son principal n'est pas éligible au Prestige suivant.</p>
        <button type="button" class="ascension-reset-launch" :disabled="!affordPrestige || busy"
          @click="openConfirmation">
          {{ affordPrestige ? 'EFFECTUER LE PRESTIGE' : 'PRESTIGE VERROUILLÉ' }}
        </button>
      </section>

      <section class="ascension-powers" aria-label="Commandes Prestige des marchés">
        <div class="ascension-panel-title"><div><span class="ascension-eyebrow">BONUS ACTIFS · TRADING</span><h2>Contrôles du marché</h2></div></div>
        <p>L’accélérateur modifie uniquement la vitesse des cours. Impôts, dividendes, news et cooldowns continuent en temps réel.</p>
        <div class="ascension-speed-row" role="group" aria-label="Vitesse du marché">
          <button v-for="(speed, index) in MARKET_SPEEDS" :key="speed" type="button"
            class="ascension-speed-button" :class="{ 'is-selected': currentSpeed === speed }"
            :aria-pressed="currentSpeed === speed" :disabled="index > unlockedSpeedLevel || busy || confirming"
            @click="changeMarketSpeed(speed)">×{{ speed }}</button>
        </div>
        <div class="ascension-frenzy-row">
          <div><strong>Frénésie boursière</strong><small>{{ frenzyOn ? 'ACTIF · news plus fortes' : hasFrenzy ? '60 secondes réelles · recharge 30 minutes' : 'Disponible après achat de l’upgrade' }}</small></div>
          <button type="button" class="ascension-frenzy-button"
            :disabled="!hasFrenzy || frenzyRemaining > 0 || busy || confirming"
            @click="launchFrenzy">{{ frenzyOn ? 'ACTIF' : frenzyRemaining > 0 ? frenzyTime + ' min' : 'ACTIVER' }}</button>
        </div>
      </section>

      <section class="transcendent-launch-panel" aria-label="Boutique Prestige Transcendant">
        <div><span class="ascension-eyebrow">BOUTIQUE PRESTIGE TRANSCENDANT</span>
          <h2>Développer ton empire</h2>
          <p>Six branches économiques et Héritage PP dès le Prestige 3, avec une septième branche Capital de départ préparée pour la passe 5.</p>
        </div>
        <button type="button" class="transcendent-launch" @click="emit('open-transcendent')">
          Ouvrir le Shop Transcendant
        </button>
      </section>
      <section class="ascension-transcendent-news" aria-label="Bonus News avancés en Points Prestige">
        <div class="ascension-shop-heading">
          <div><span class="ascension-eyebrow">PRESTIGE TRANSCENDANT · NEWS</span><h2>News avancées en PP</h2></div>
          <span>{{ advancedNewsSum }} / {{ TRANSCENDENT_MAX_LEVEL*3 }}</span>
        </div>
        <p class="ascension-help">Débloqué au Prestige 3. Trois branches permanentes de 1 000 niveaux, qui affectent les annonces haussières et baissières. Les cinq branches économiques, l’Héritage PP et le Capital de départ sont disponibles dans la boutique Transcendant dédiée. Le bonus ultime de réserve PP s’active lorsque les sept branches principales atteignent chacune 1 000 niveaux.</p>
        <div class="ascension-news-effective" aria-label="Effets actuels sur les news">
          <span>Puissance <strong>×{{ newsModifiers.impactMultiplier.toFixed(2) }}</strong></span>
          <span>Rampe <strong>{{ (newsModifiers.rampFraction*100).toFixed(2) }} %</strong></span>
          <span>Durée future <strong>×{{ newsModifiers.durationMultiplier.toFixed(2) }}</strong></span>
        </div>
        <article v-for="row in advancedNews" :key="row.id" class="ascension-upgrade" :data-news-upgrade="row.id">
          <div class="ascension-upgrade-top">
            <div><strong>{{ row.name }}</strong><p>{{ row.description }}</p></div>
            <span class="ascension-upgrade-level">NIV. {{ row.rank }}/{{ TRANSCENDENT_MAX_LEVEL }}</span>
          </div>
          <div class="ascension-upgrade-track" role="progressbar" :aria-label="'Niveau de '+row.name"
            :aria-valuenow="row.rank" aria-valuemin="0" :aria-valuemax="TRANSCENDENT_MAX_LEVEL">
            <span :style="{width:row.rank/TRANSCENDENT_MAX_LEVEL*100+'%'}"></span>
          </div>
          <div class="ascension-upgrade-effect"><span>{{ row.effect }}</span><span>Permanent</span></div>
          <div class="ascension-upgrade-footer">
            <span class="ascension-upgrade-cost">{{ row.cost===null?'TERMINÉ':fmt(row.cost)+' PP · prochain niveau' }}</span>
            <button type="button" class="ascension-buy" :disabled="!row.canBuy || busy || confirming || !purchaseNewsUpgrade"
              :aria-label="'Acheter '+row.name+' niveau '+(row.rank+1)"
              @click="buyNewsAdvanced(row.id,row.rank,row.cost)">
              {{ row.cost===null?'MAX':progress.prestigeCount<3?'PRESTIGE 3 REQUIS':row.canBuy?'ACHETER':'PP INSUFF.' }}
            </button>
          </div>
        </article>
      </section>

      <section class="ascension-shop-heading" aria-label="Catalogue des améliorations Prestige">
        <div><span class="ascension-eyebrow">BOUTIQUE PERMANENTE</span><h2>Améliorations Prestige</h2></div>
        <span>{{ toGo }} niveaux restants</span>
      </section>

      <section v-for="section in sections" :key="section.id" class="ascension-category"
        :aria-label="section.label">
        <h3>{{ section.label }}</h3>
        <article v-for="row in section.rows" :key="row.item.id" class="ascension-upgrade"
          :data-upgrade="row.item.id">
          <div class="ascension-upgrade-top">
            <div><strong>{{ row.item.label }}</strong><p>{{ row.item.description }}</p></div>
            <span class="ascension-upgrade-level">NIV. {{ row.offer.currentLevel }}/{{ row.def.maxLevel }}</span>
          </div>
          <div class="ascension-upgrade-track" role="progressbar" :aria-label="'Niveau de ' + row.item.label"
            :aria-valuenow="row.offer.currentLevel" aria-valuemin="0" :aria-valuemax="row.def.maxLevel">
            <span :style="{ width: (row.offer.currentLevel / row.def.maxLevel * 100) + '%' }"></span>
          </div>
          <div class="ascension-upgrade-effect">
            <span>Au maximum : <strong>{{ row.item.effect }}</strong></span>
            <span class="ascension-phase">Effet disponible</span>
          </div>
          <div class="ascension-upgrade-footer">
            <span class="ascension-upgrade-cost">{{ row.offer.nextCost === null ? 'TERMINÉ' : fmt(row.offer.nextCost) + ' PP · prochain niveau' }}</span>
            <button type="button" class="ascension-buy" :disabled="!row.offer.canAfford || busy || confirming"
              :aria-label="'Acheter ' + row.item.label + ' niveau ' + (row.offer.currentLevel + 1)"
              @click="buy(row.item.id, row.offer.currentLevel)">
              {{ row.offer.nextCost === null ? 'MAX' : progress.prestigeCount < row.offer.gate ? 'PRESTIGE ' + row.offer.gate + ' REQUIS' : row.offer.canAfford ? 'ACHETER' : 'PP INSUFF.' }}
            </button>
          </div>
        </article>
      </section>
      <p class="ascension-endnote">Les achats sont permanents et non remboursables. Les améliorations débloquées fonctionnent dès leur achat et leur activation éventuelle ; le Fame et ses bonus restent distincts.</p>
    </div>

    <footer class="ascension-footer">
      <p v-if="notice" class="ascension-notice" :class="{ 'is-error': noticeError }" role="status">{{ notice }}</p>
      <p v-else>Prestige obtenu : {{ fmt(progress.lifetimePoints) }} PP au total. Les collections et les boosts Fame sont conservés.</p>
    </footer>

    <div v-if="confirming" class="ascension-confirm-overlay" @click.self="closeConfirmation">
      <section class="ascension-confirm" role="dialog" aria-modal="true" aria-labelledby="ascension-confirm-title">
        <div class="ascension-confirm-body">
          <span class="ascension-eyebrow">CONFIRMATION IRRÉVERSIBLE</span>
          <h2 id="ascension-confirm-title">Confirmer le Prestige ?</h2>
          <p>Tu vas recommencer au <strong>niveau 1</strong> et perdre le cash, les actions, les cryptos, les entreprises et les améliorations de clic du cycle.</p>
          <p>Le solde de <strong>Fame</strong> et l’Auto Click reviennent à zéro. Les boosts Fame achetés, les collections, leurs bonus, les PP et les améliorations Prestige sont conservés. Les échéances fiscales continuent.</p>
           <p v-if="state.fiscal.taxesDueCents > 0">Les taxes actuelles de <strong>{{ cash(state.fiscal.taxesDueCents / 100) }}</strong> seront réglées automatiquement dans l’opération de Prestige. Aucun impôt n’est effacé.</p>
          <div class="ascension-confirm-reward">Récompense de ce cycle : <strong>+{{ fmt(pointPreview) }} PP</strong></div>
          <p v-if="notice && noticeError" class="ascension-modal-error" role="alert">{{ notice }}</p>
          <label for="ascension-confirm-input">Écris <strong>PRESTIGE</strong> pour confirmer :</label>
          <input id="ascension-confirm-input" ref="confirmField" v-model="confirmText" type="text"
            autocomplete="off" spellcheck="false" maxlength="8" :disabled="busy" />
        </div>
        <div class="ascension-confirm-actions">
          <button type="button" class="ascension-cancel" :disabled="busy" @click="closeConfirmation">Annuler</button>
          <button type="button" class="ascension-confirm-submit" :disabled="busy || confirmText !== 'PRESTIGE'"
            @click="confirmPrestige">Confirmer le Prestige</button>
        </div>
      </section>
    </div>
  </main>
</template>
