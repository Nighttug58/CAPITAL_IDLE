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
import { formatCompactUnits } from '../large-numbers.ts'

const props = defineProps<{
  state: CapitalState
  exactState?: V8CapitalState
  executeEnterprise: (action: EnterpriseAction, id: string) => EnterpriseResult
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
const adjustedMicro = (raw: bigint) => raw * enterpriseMultiplier() / 1_000_000n

const notice = ref<{ id: string; message: string; error: boolean } | null>(null)
const playerLevel = computed(() => props.exactState
  ? getExactLevel(getExactAmount(props.exactState.prestige.experienceCents))
  : getLevel(props.state.prestige.experienceCents / 100))
const acquiredCount = computed(() => Object.keys(props.state.enterprises.owned).length)
const incomePerSecond = computed(() => {
  if (!props.exactState) return rate(getTotalEnterpriseIncomeMicrosPerSecond(props.state) * getBonusMultiplier(props.state, 'enterprise'))
  let total = 0n
  for (const [id, holding] of Object.entries(props.exactState.enterprises.owned))
    total += getEnterpriseIncomeMicrosPerSecondExact(id, holding.level) ?? 0n
  return exactRate(adjustedMicro(total))
})

const rows = computed(() => ENTERPRISES.map((enterprise) => {
  const holding = props.exactState?.enterprises.owned[enterprise.id] ?? props.state.enterprises.owned[enterprise.id]
  const owned = !!holding
  const level = holding?.level ?? 0
  const unlocked = owned || isEnterpriseUnlocked(enterprise.id, playerLevel.value)
  const priceExact = level >= Number.MAX_SAFE_INTEGER-1 ? null :
    owned ? getEnterpriseUpgradeCostCentsExact(enterprise.id, level)
    : BigInt(enterprise.purchaseCostCents)
  const canPurchase = unlocked && priceExact !== null && (props.exactState
    ? getExactAmount(props.exactState.game.balance) >= priceExact
    : props.state.game.balance * 100 >= Number(priceExact))
  const incomeExact = getEnterpriseIncomeMicrosPerSecondExact(enterprise.id, level || 1) ?? 0n
  const nextIncomeExact = owned ? getEnterpriseIncomeMicrosPerSecondExact(enterprise.id, level + 1) : null
  const multiplier = getBonusMultiplier(props.state, 'enterprise')
  const incomeText = props.exactState ? exactRate(adjustedMicro(incomeExact))
    : rate((getEnterpriseIncomeMicrosPerSecond(enterprise.id, level || 1) ?? 0) * multiplier)
  const nextIncomeText = !owned ? null : props.exactState
    ? nextIncomeExact === null ? null : exactRate(adjustedMicro(nextIncomeExact))
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
