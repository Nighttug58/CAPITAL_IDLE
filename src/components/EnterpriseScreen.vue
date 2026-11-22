<script setup lang="ts">
import { computed, ref } from 'vue'
import type { CapitalState } from '../capital.ts'
import { getLevel } from '../game.ts'
import { getExactLevel } from '../exact-levels.ts'
import { getBonusMultiplier } from '../prestige/bonuses.ts'
import {
  ENTERPRISES, ENTERPRISE_CATEGORIES, ENTERPRISE_MILESTONES,
  getEnterpriseIncomeMicrosPerSecond, getEnterpriseMilestone,
  getEnterpriseUpgradeCostCentsExact,
  getEnterpriseIncomeMicrosPerSecondExact, getNextEnterpriseMilestone, isEnterpriseUnlocked,
  type EnterpriseCategory,
} from '../economy/catalog.ts'
import {
  getTotalEnterpriseIncomeMicrosPerSecond,
  type EnterpriseAction, type EnterpriseError, type EnterpriseResult,
} from '../economy/enterprises.ts'
import type { V8CapitalState } from '../exact-state-v8.ts'
import { getExactAmount } from '../exact-state-v8.ts'
import { v8BonusBasisPoints, quoteV8EnterpriseMax } from '../exact-runtime-v8.ts'
import { formatCompactUnits,parseDecimalUnits } from '../large-numbers.ts'
import { fameV4Level } from '../trading/fame-v4-trading.ts'
import { enterpriseV4, enterpriseV4BonusBps, v4UpgradeCost,
  V4_PROJECT_COSTS_CENTS,V4_CONTRACT_MIN_STAKE_CENTS,V4_CONTRACT_DURATIONS_MINUTES,
  type FameV4EnterpriseCommand } from '../economy/fame-v4-enterprises.ts'

const props = defineProps<{
  state: CapitalState
  exactState?: V8CapitalState
  executeEnterprise: (action: EnterpriseAction, id: string) => EnterpriseResult
  executeFameV4Enterprise?: (command:FameV4EnterpriseCommand)=>boolean
  executeEnterpriseMax?: (id: string, expectedLevel: number) =>
    | {ok:true;level:number;levelsBought:number;costCents:string}
    | {ok:false;error:EnterpriseError|'stale-level'}
}>()

const categories: readonly EnterpriseCategory[] = ['small', 'local', 'services', 'industry', 'major']
const moneyFormatter = new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 2 })
const incomeFormatter = new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 6 })
const money = (dollars: number) => moneyFormatter.format(dollars) + ' $'
const rate = (microdollars: number) => incomeFormatter.format(microdollars / 1_000_000) + ' $/s'
const exactMoney = (cents: bigint) => formatCompactUnits(cents, 2, '$')
const exactRate = (micro: bigint) => micro < 1_000_000_000n
  ? rate(Number(micro)) : formatCompactUnits(micro, 6, '$/s')
function enterpriseMultiplier(): bigint {
  const bps = props.exactState ? v8BonusBasisPoints(props.exactState, 'enterprise') : 0
  return BigInt(Math.round((1 + bps / 10_000) * 1_000_000))
}
const adjustedMicro = (raw: bigint,id:string) => {
  const bonus=props.exactState?enterpriseV4BonusBps(props.exactState,id,props.exactState.enterprises.lastAccruedAt):0
  return (raw*BigInt(10_000+bonus)/10_000n)*enterpriseMultiplier()/1_000_000n
}

const notice = ref<{ id: string; message: string; error: boolean } | null>(null)
const playerLevel = computed(() => props.exactState
  ? getExactLevel(getExactAmount(props.exactState.prestige.experienceCents))
  : getLevel(props.state.prestige.experienceCents / 100))
const acquiredCount = computed(() => Object.keys(props.state.enterprises.owned).length)
const incomePerSecond = computed(() => {
  if (!props.exactState) return rate(getTotalEnterpriseIncomeMicrosPerSecond(props.state) * getBonusMultiplier(props.state, 'enterprise'))
  let total = 0n
  for (const [id, holding] of Object.entries(props.exactState.enterprises.owned))
    total += adjustedMicro(getEnterpriseIncomeMicrosPerSecondExact(id, holding.level) ?? 0n,id)
  return exactRate(total)
})

const rows = computed(() => ENTERPRISES.map((enterprise) => {
  const holding = props.exactState?.enterprises.owned[enterprise.id] ?? props.state.enterprises.owned[enterprise.id]
  const owned = !!holding
  const level = holding?.level ?? 0
  const unlocked = owned || isEnterpriseUnlocked(enterprise.id, playerLevel.value)
  const priceExact = level >= Number.MAX_SAFE_INTEGER-1 ? null :
    owned ? props.exactState?v4UpgradeCost(props.exactState,enterprise.id,level)
      : getEnterpriseUpgradeCostCentsExact(enterprise.id,level)
    : BigInt(enterprise.purchaseCostCents)
  const canPurchase = unlocked && priceExact !== null && (props.exactState
    ? getExactAmount(props.exactState.game.balance) >= priceExact
    : props.state.game.balance * 100 >= Number(priceExact))
  const incomeExact = getEnterpriseIncomeMicrosPerSecondExact(enterprise.id, level || 1) ?? 0n
  const nextIncomeExact = owned ? getEnterpriseIncomeMicrosPerSecondExact(enterprise.id, level + 1) : null
  const multiplier = getBonusMultiplier(props.state, 'enterprise')
  const incomeText = props.exactState ? exactRate(adjustedMicro(incomeExact,enterprise.id))
    : rate((getEnterpriseIncomeMicrosPerSecond(enterprise.id, level || 1) ?? 0) * multiplier)
  const nextIncomeText = !owned ? null : props.exactState
    ? nextIncomeExact === null ? null : exactRate(adjustedMicro(nextIncomeExact,enterprise.id))
    : rate((getEnterpriseIncomeMicrosPerSecond(enterprise.id, level + 1) ?? 0) * multiplier)
  const maxQuote = props.exactState && props.executeEnterpriseMax
    ? quoteV8EnterpriseMax(props.exactState, enterprise.id) : null
  const nextMilestone = getNextEnterpriseMilestone(level)
  const previousMilestone = level <= 20
    ? ENTERPRISE_MILESTONES.filter(m => m.level <= level).at(-1)?.level ?? 0
    : Math.max(20, Math.floor(level / 25) * 25)
  const progressPercent = nextMilestone
    ? (level - previousMilestone) / (nextMilestone.level - previousMilestone) * 100 : 100
  return {
    ...enterprise, owned, level, unlocked, nextMilestone, progressPercent,
    nextPriceText: priceExact === null ? 'NIVEAU INVALIDE' : props.exactState
      ? exactMoney(priceExact) : money(Number(priceExact) / 100),
    incomeText, nextIncomeText,
    activeMilestone: getEnterpriseMilestone(level), canPurchase, maxQuote,
  }
}))

const groups = computed(() => categories.map((category) => ({
  id: category,
  title: ENTERPRISE_CATEGORIES[category],
  items: rows.value.filter((row) => row.category === category),
})))

const errorMessages: Record<EnterpriseError, string> = {
  'unknown-enterprise': 'Entreprise introuvable.',
  'level-locked': 'Niveau joueur insuffisant.',
  'already-owned': 'Vous possédez déjà cette entreprise.',
  'not-owned': 'Achetez d’abord cette entreprise.',
  'max-level': 'Niveau maximum atteint.',
  'insufficient-funds': 'Solde insuffisant.',
  'invalid-clock': 'Horloge invalide : vérifiez la date de votre appareil.',
  'money-overflow': 'Montant hors limites : opération annulée.',
}

function takeMax(id:string,expectedLevel:number) {
  const result=props.executeEnterpriseMax?.(id,expectedLevel)
  if(!result)return
  if(result.ok){
    notice.value={id,
      message:'MAX : +' + result.levelsBought + ' niveau(x) pour ' +
        exactMoney(BigInt(result.costCents)) + ' · niveau ' + result.level + '.',
      error:false}
  }else{
    notice.value={id,message:result.error==='stale-level'
      ? 'Le niveau a changé. Réessayez.' : errorMessages[result.error],error:true}
  }
}
function takeAction(id: string, alreadyOwned: boolean) {
  const result = props.executeEnterprise(alreadyOwned ? 'upgrade' : 'buy', id)
  if (result.ok) {
    notice.value = {
      id,
      message: alreadyOwned
        ? `Amélioration confirmée : niveau ${result.receipt.level}.`
        : 'Achat confirmé. Les revenus sont maintenant automatiques.',
      error: false,
    }
  } else {
    notice.value = { id, message: errorMessages[result.error], error: true }
  }
}

const industryRank=(number:number)=>props.exactState?fameV4Level(props.exactState,number):0
const v4Data=computed(()=>props.exactState?enterpriseV4(props.exactState):null)
const ownedEnterprises=computed(()=>ENTERPRISES.filter(item=>!!props.exactState?.enterprises.owned[item.id]))
const first=ref(''),second=ref(''),franchise=ref(''),board=ref('')
const projectTier=ref(0)
const projectCategory=ref<EnterpriseCategory>('small')
const contractPrincipal=ref('1000000')
const contractMinutes=ref<30|60|90|120>(30)
const pending=ref<FameV4EnterpriseCommand|null>(null)
const v4Notice=ref('')
const availableCash=computed(()=>props.exactState?getExactAmount(props.exactState.game.balance):0n)
const principalCents=computed(()=>parseDecimalUnits(contractPrincipal.value.trim(),2))
const projectCost=computed(()=>V4_PROJECT_COSTS_CENTS[projectTier.value]??null)
const nextChange=(kind:'franchise'|'board')=>{
 const chosen=v4Data.value?.[kind]
 if(!chosen||!props.exactState)return 'Libre'
 const remain=Math.max(0,chosen.chosenAt+1_800_000-props.exactState.enterprises.lastAccruedAt)
 return remain?Math.ceil(remain/60_000)+' min':'Libre'
}
const countdown=(until:number)=>{
 const now=props.exactState?.enterprises.lastAccruedAt??0
 const ms=Math.max(0,until-now)
 return Math.floor(ms/60_000)+'m '+Math.floor((ms%60_000)/1000)+'s'
}
function runV4(command:FameV4EnterpriseCommand){
 const success=props.executeFameV4Enterprise?.(command)??false
 v4Notice.value=success?'Opération enregistrée dans la sauvegarde exacte.':
   'Action refusée : niveau Fame, entreprises, fonds, cooldown ou état de sauvegarde à vérifier.'
 if(success)pending.value=null
}
function prepareContract(){
 const cents=principalCents.value
 if(cents===null||cents<V4_CONTRACT_MIN_STAKE_CENTS||cents>availableCash.value){
   v4Notice.value='Capital insuffisant ou montant invalide (minimum 1 M$).';return
 }
 pending.value={kind:'contract',principalCents:cents.toString(),minutes:contractMinutes.value}
 v4Notice.value=''
}
function prepareProject(){
 if(projectCost.value===null||availableCash.value<projectCost.value){
   v4Notice.value='Cash insuffisant pour ce projet.';return
 }
 pending.value={kind:'project',tier:projectTier.value,category:projectCategory.value}
 v4Notice.value=''
}
</script>

<template>
  <main id="entreprises" class="enterprise-screen" aria-label="Mes entreprises">
    <header class="enterprise-hero">
      <div class="enterprise-hero-title">
        <span class="eyebrow">CAPITAL · INVESTISSEMENTS</span>
        <h1>Entreprises</h1>
        <span class="enterprise-hint">Commerces uniques · revenus fixes</span>
      </div>
      <div class="enterprise-hero-wallet">
        <span>CAPITAL DISPONIBLE</span>
        <strong>{{ exactState ? exactMoney(getExactAmount(exactState.game.balance)) : money(state.game.balance) }}</strong>
      </div>
    </header>

    <section class="enterprise-summary" aria-label="Résumé de vos entreprises">
      <div>
        <span>ENTREPRISES</span>
        <strong>{{ acquiredCount }} <small>/ 20</small></strong>
      </div>
      <div>
        <span>REVENU PASSIF BRUT</span>
        <strong class="enterprise-income">{{ incomePerSecond }}</strong>
      </div>
    </section>

    <div class="enterprise-list-scroll" aria-label="Catalogue des entreprises">
      <details v-if="exactState && [8,9,10,11,12,13].some(industryRank)" class="enterprise-v4-panel" open data-no-page-swipe>
        <summary><strong>FAME · GESTION INDUSTRIELLE</strong>
          <small>6 pouvoirs · revenus, contrats, infrastructures</small></summary>
        <div class="enterprise-v4-sections">
          <section v-if="industryRank(8)>0" aria-label="Synergies industrielles" class="enterprise-v4-section">
            <h3>Synergies industrielles · +{{ industryRank(8) }} % sur chaque entreprise jumelée</h3>
            <p v-if="v4Data?.synergy">Paire actuelle : {{ ENTERPRISES.find(x=>x.id===v4Data?.synergy?.[0])?.name }} +
              {{ ENTERPRISES.find(x=>x.id===v4Data?.synergy?.[1])?.name }}</p>
            <div class="enterprise-v4-fields">
              <label>Entreprise 1<select v-model="first"><option value="">Choisir…</option>
                <option v-for="item in ownedEnterprises" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
              <label>Entreprise 2<select v-model="second"><option value="">Choisir…</option>
                <option v-for="item in ownedEnterprises" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
            </div>
            <button type="button" :disabled="!first || !second || first===second" @click="runV4({kind:'synergy',first,second})">Associer les deux entreprises</button>
          </section>
          <section v-if="industryRank(9)>0" aria-label="Recherche et développement" class="enterprise-v4-section">
            <h3>Recherche et développement · −{{ (industryRank(9)*0.8).toFixed(1) }} %</h3>
            <p>Réduction exacte des prochains coûts d’amélioration, y compris MAX. Aucun effet sur l’achat initial ou les niveaux déjà acquis.</p>
          </section>
          <section v-if="industryRank(12)>0" aria-label="Franchise internationale" class="enterprise-v4-section">
            <h3>Franchise internationale · +{{ industryRank(12) }} %</h3>
            <p>Entreprise : {{ ENTERPRISES.find(x=>x.id===v4Data?.franchise?.id)?.name??'Aucune' }} · changement dans {{ nextChange('franchise') }}</p>
            <div class="enterprise-v4-fields"><label>Franchise<select v-model="franchise"><option value="">Choisir…</option>
              <option v-for="item in ownedEnterprises" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
              <button type="button" :disabled="!franchise" @click="runV4({kind:'assign',role:'franchise',id:franchise})">Désigner</button>
            </div>
          </section>
          <section v-if="industryRank(13)>0" aria-label="Conseil d’administration" class="enterprise-v4-section">
            <h3>Conseil d’administration · +{{ industryRank(13)*3 }} %</h3>
            <p>Entreprise : {{ ENTERPRISES.find(x=>x.id===v4Data?.board?.id)?.name??'Aucune' }} · changement dans {{ nextChange('board') }}</p>
            <div class="enterprise-v4-fields"><label>Entreprise principale<select v-model="board"><option value="">Choisir…</option>
              <option v-for="item in ownedEnterprises" :key="item.id" :value="item.id">{{ item.name }}</option></select></label>
              <button type="button" :disabled="!board" @click="runV4({kind:'assign',role:'board',id:board})">Désigner</button>
            </div>
          </section>
          <section v-if="industryRank(10)>0" aria-label="Contrats gouvernementaux" class="enterprise-v4-section">
            <h3>Contrats gouvernementaux · {{ v4Data?.contracts.length??0 }}/{{ industryRank(10) }}</h3>
            <p>Capital immobilisé pendant 30–120 min. Succès déterminé au départ : bénéfice de 0 à 5 % ; échec −15 %. Résultats cachés avant échéance.</p>
            <div class="enterprise-v4-fields">
              <label>Mise ($, min. 1 M)<input v-model="contractPrincipal" type="text" inputmode="decimal" placeholder="1000000" aria-label="Capital du contrat en dollars"></label>
              <label>Durée<select v-model.number="contractMinutes" aria-label="Durée du contrat">
                <option v-for="duration in V4_CONTRACT_DURATIONS_MINUTES" :key="duration" :value="duration">{{ duration }} min</option>
              </select></label>
            </div>
            <button type="button" :disabled="(v4Data?.contracts.length??0)>=industryRank(10)" @click="prepareContract()">Préparer le contrat</button>
            <div v-for="item in v4Data?.contracts??[]" :key="item.id" class="enterprise-v4-record">
              <strong>Contrat #{{ item.id }} · {{ exactMoney(getExactAmount(item.principalCents)) }} immobilisés</strong>
              <small>Échéance dans {{ countdown(item.endsAt) }} · résultat à venir</small>
            </div>
            <div v-for="item in (v4Data?.contractHistory??[]).slice(-3).reverse()" :key="item.at+'-'+item.id" class="enterprise-v4-record">
              <strong>Clôturé #{{ item.id }} : {{ exactMoney(getExactAmount(item.payoutCents)) }} remboursés</strong>
              <small :class="getExactAmount(item.profitCents)<0n?'enterprise-v4-loss':''">
                {{ item.forced?'Sortie anticipée au Prestige':'Fin du contrat' }}
                · résultat {{ exactMoney(getExactAmount(item.profitCents)) }}
              </small>
            </div>
          </section>
          <section v-if="industryRank(11)>0" aria-label="Méga-infrastructures" class="enterprise-v4-section">
            <h3>Méga-infrastructures · +5 % pendant 30 min</h3>
            <p>Chaque projet est consommable une fois par Prestige. Jusqu’à +15 % par catégorie avec trois projets actifs.</p>
            <div class="enterprise-v4-fields">
              <label>Palier<select v-model.number="projectTier" aria-label="Niveau du projet">
                <option v-for="tier in industryRank(11)" :key="tier" :value="tier-1"
                  :disabled="v4Data?.usedProjectTiers.includes(tier-1)">Projet {{ tier }}
                  · {{ exactMoney(V4_PROJECT_COSTS_CENTS[tier-1]!) }}
                  {{ v4Data?.usedProjectTiers.includes(tier-1)?' · utilisé':'' }}
                </option>
              </select></label>
              <label>Catégorie<select v-model="projectCategory" aria-label="Catégorie du projet">
                <option v-for="cat in categories" :key="cat" :value="cat">{{ ENTERPRISE_CATEGORIES[cat] }}</option>
              </select></label>
            </div>
            <button type="button" :disabled="v4Data?.usedProjectTiers.includes(projectTier)||!ownedEnterprises.some(x=>x.category===projectCategory)" @click="prepareProject()">Préparer le projet</button>
            <div v-for="item in v4Data?.projects??[]" :key="item.tier" class="enterprise-v4-record">
              <strong>Projet {{ item.tier+1 }} · {{ ENTERPRISE_CATEGORIES[item.category] }}</strong>
              <small>Bonus +5 % actif pendant encore {{ countdown(item.endsAt) }}</small>
            </div>
          </section>
          <div v-if="pending" class="enterprise-v4-confirm" role="group" aria-label="Confirmation du coût irréversible">
            <strong>Confirmer cette dépense irréversible ?</strong>
            <p v-if="pending.kind==='contract'">Immobiliser {{ exactMoney(getExactAmount(pending.principalCents)) }} pendant {{ pending.minutes }} min.
              En cas d’échec, perte de 15 %. Sortie anticipée au Prestige : −15 %.</p>
            <p v-if="pending.kind==='project'">Dépenser définitivement {{ exactMoney(V4_PROJECT_COSTS_CENTS[pending.tier]!) }} pour un bonus de 30 min.</p>
            <button type="button" @click="runV4(pending)">Confirmer la dépense</button>
            <button type="button" @click="pending=null">Annuler</button>
          </div>
          <p v-if="v4Notice" class="enterprise-v4-notice" role="status">{{ v4Notice }}</p>
        </div>
      </details>
      <section v-for="group in groups" :key="group.id" class="enterprise-category">
        <h2>{{ group.title }}</h2>
        <article
          v-for="item in group.items"
          :key="item.id"
          class="enterprise-card"
          :class="{ 'enterprise-card-locked': !item.unlocked && !item.owned, 'enterprise-card-owned': item.owned }"
        >
          <div class="enterprise-card-top">
            <div class="enterprise-card-heading">
              <strong>{{ item.name }}</strong>
              <span v-if="!item.owned && !item.unlocked" class="enterprise-tag enterprise-tag-locked">
                Verrouillée · niv. {{ item.requiredPlayerLevel }}
              </span>
              <span v-else-if="item.owned" class="enterprise-tag enterprise-tag-owned">
                Possédée · niv. {{ item.level }}
              </span>
              <span v-else class="enterprise-tag enterprise-tag-ready">Disponible</span>
            </div>
            <div class="enterprise-card-yield">
              <small>{{ item.owned ? 'REVENU ACTUEL' : 'REVENU AU NIVEAU 1' }}</small>
              <strong>{{ item.incomeText }}</strong>
            </div>
          </div>

          <div v-if="item.owned" class="enterprise-level">
            <div
              class="enterprise-level-fill"
              :style="{ width: `${item.progressPercent}%` }"
              role="progressbar"
              :aria-label="`Niveau de ${item.name}`"
              :aria-valuenow="item.level"
              aria-valuemin="0"
              :aria-valuemax="item.nextMilestone?.level ?? item.level + 1"
            ></div>
          </div>

          <div class="enterprise-card-details">
            <span v-if="item.owned && item.activeMilestone" class="enterprise-milestone-current">
              Palier acquis : {{ item.activeMilestone.name }}
            </span>
            <span v-if="item.nextMilestone">
              Prochain palier spécial : niv. {{ item.nextMilestone.level }} · {{ item.nextMilestone.name }}
            </span>
            <span v-if="item.owned && item.nextIncomeText !== null">
              Après amélioration : {{ item.nextIncomeText }}
            </span>
          </div>

          <div class="enterprise-card-footer">
            <div class="enterprise-next-price">
              <span>{{ item.owned ? 'PROCHAINE AMÉLIORATION' : 'PRIX D’ACHAT' }}</span>
              <strong>{{ item.nextPriceText }}</strong>
              <small v-if="item.maxQuote" class="enterprise-max-preview">
                MAX +{{ item.maxQuote.levelsBought }} · {{ exactMoney(item.maxQuote.costCents) }}
              </small>
            </div>
            <div class="enterprise-actions">
              <button
                class="enterprise-action"
                type="button"
                :disabled="!item.canPurchase"
                :aria-label="`${item.owned ? 'Améliorer' : 'Acheter'} ${item.name} (+1)`"
                @click="takeAction(item.id, item.owned)"
              >
                {{ item.owned ? 'AMÉLIORER' : item.unlocked ? 'ACHETER' : `NIV. ${item.requiredPlayerLevel}` }}
              </button>
              <button class="enterprise-max-action" type="button"
                :disabled="!item.maxQuote" :aria-label="'Acheter MAX pour ' + item.name"
                :title="item.maxQuote ? '+' + item.maxQuote.levelsBought + ' niveaux pour ' + exactMoney(item.maxQuote.costCents) : 'Aucun niveau achetable'"
                @click="takeMax(item.id, item.level)">MAX</button>
            </div>
          </div>

          <p
            v-if="notice?.id === item.id"
            class="enterprise-notice"
            :class="{ 'enterprise-notice-error': notice.error }"
            role="status"
          >{{ notice.message }}</p>
        </article>
      </section>
    </div>
  </main>
</template>

<style scoped>
.enterprise-v4-panel {margin:6px 0 16px;border:1px solid #62598b;border-radius:12px;background:#22243c;color:#dce7fb}
.enterprise-v4-panel>summary {cursor:pointer;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;padding:11px 12px;font-size:12px;list-style-position:inside}
.enterprise-v4-panel>summary strong {color:#edd5ff}
.enterprise-v4-panel>summary small {color:#b9b3db;font-size:10px}
.enterprise-v4-sections {padding:4px 10px 12px;display:grid;gap:9px}
.enterprise-v4-section {border:1px solid #394968;border-radius:9px;padding:9px;display:grid;gap:7px;background:#202c43;min-width:0}
.enterprise-v4-section h3 {font-size:12px;line-height:1.3;color:#e2eaff;margin:0}
.enterprise-v4-section p {color:#b8cce1;font-size:11px;line-height:1.45;margin:0}
.enterprise-v4-fields {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;align-items:end}
.enterprise-v4-fields label {min-width:0;display:grid;gap:4px;font-size:10px;color:#baccdf}
.enterprise-v4-fields :is(input,select) {width:100%;min-width:0;padding:7px 5px;border:1px solid #687791;border-radius:7px;background:#19263b;color:#f4f5ff;font-size:11px;min-height:36px}
.enterprise-v4-section button,.enterprise-v4-confirm button {min-height:35px;padding:7px 9px;color:#f1e8ff;background:#4c477d;border:1px solid #9383bf;border-radius:7px;font-size:11px;font-weight:700}
.enterprise-v4-section button:disabled {opacity:.45}
.enterprise-v4-record {display:grid;gap:3px;border-top:1px solid #485574;padding:6px 0 0;font-size:10px}
.enterprise-v4-record small {color:#b2c9dd}
.enterprise-v4-record .enterprise-v4-loss {color:#ffb8b8}
.enterprise-v4-confirm {border:1px solid #bb8c71;background:#3d332e;padding:10px;border-radius:9px;display:grid;gap:7px}
.enterprise-v4-confirm strong {font-size:12px}
.enterprise-v4-confirm p,.enterprise-v4-notice {margin:0;font-size:11px;line-height:1.45}
.enterprise-v4-notice {color:#d8c8fa}
@media(max-width:390px){.enterprise-v4-fields{grid-template-columns:1fr}.enterprise-v4-panel>summary{font-size:11px}}
</style>