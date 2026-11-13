<script setup lang="ts">
import { computed, ref } from 'vue'
import type { CapitalState } from '../capital.ts'
import { getLevel } from '../game.ts'
import {
  ENTERPRISES, ENTERPRISE_CATEGORIES, ENTERPRISE_MILESTONES,
  getEnterpriseIncomeMicrosPerSecond, getEnterpriseMilestone,
  getEnterpriseUpgradeCostCents, isEnterpriseUnlocked,
  type EnterpriseCategory,
} from '../economy/catalog.ts'
import {
  getTotalEnterpriseIncomeMicrosPerSecond,
  type EnterpriseAction, type EnterpriseError, type EnterpriseResult,
} from '../economy/enterprises.ts'
import { MAX_ENTERPRISE_LEVEL } from '../economy/state.ts'

const props = defineProps<{
  state: CapitalState
  executeEnterprise: (action: EnterpriseAction, id: string) => EnterpriseResult
}>()

const categories: readonly EnterpriseCategory[] = ['small', 'local', 'services', 'industry', 'major']
const moneyFormatter = new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 2 })
const incomeFormatter = new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 6 })
const money = (dollars: number) => moneyFormatter.format(dollars) + ' $'
const rate = (microdollars: number) => incomeFormatter.format(microdollars / 1_000_000) + ' $/s'

const notice = ref<{ id: string; message: string; error: boolean } | null>(null)
const playerLevel = computed(() => getLevel(props.state.game.lifetimeEarned))
const acquiredCount = computed(() => Object.keys(props.state.enterprises.owned).length)
const incomePerSecond = computed(() => getTotalEnterpriseIncomeMicrosPerSecond(props.state))

const rows = computed(() => ENTERPRISES.map((enterprise) => {
  const holding = props.state.enterprises.owned[enterprise.id]
  const owned = !!holding
  const level = holding?.level ?? 0
  const unlocked = isEnterpriseUnlocked(enterprise.id, playerLevel.value)
  const nextPriceCents = owned
    ? getEnterpriseUpgradeCostCents(enterprise.id, level)
    : enterprise.purchaseCostCents
  const incomeMicros = getEnterpriseIncomeMicrosPerSecond(enterprise.id, level || 1) ?? 0
  const nextIncomeMicros = owned && level < MAX_ENTERPRISE_LEVEL
    ? getEnterpriseIncomeMicrosPerSecond(enterprise.id, level + 1)
    : null
  const nextMilestone = ENTERPRISE_MILESTONES.find((milestone) => milestone.level > level) ?? null
  return {
    ...enterprise,
    owned,
    level,
    unlocked,
    nextPriceCents,
    incomeMicros,
    nextIncomeMicros,
    nextMilestone,
    activeMilestone: getEnterpriseMilestone(level),
    canPurchase: unlocked && nextPriceCents !== null &&
      props.state.game.balance * 100 >= nextPriceCents,
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

function takeAction(id: string, alreadyOwned: boolean) {
  const result = props.executeEnterprise(alreadyOwned ? 'upgrade' : 'buy', id)
  if (result.ok) {
    notice.value = {
      id,
      message: alreadyOwned
        ? `Amélioration confirmée : niveau ${result.receipt.level}/20.`
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
        <strong>{{ money(state.game.balance) }}</strong>
      </div>
    </header>

    <section class="enterprise-summary" aria-label="Résumé de vos entreprises">
      <div>
        <span>ENTREPRISES</span>
        <strong>{{ acquiredCount }} <small>/ 20</small></strong>
      </div>
      <div>
        <span>REVENU PASSIF BRUT</span>
        <strong class="enterprise-income">{{ rate(incomePerSecond) }}</strong>
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
                Possédée · niv. {{ item.level }}/20
              </span>
              <span v-else class="enterprise-tag enterprise-tag-ready">Disponible</span>
            </div>
            <div class="enterprise-card-yield">
              <small>{{ item.owned ? 'REVENU ACTUEL' : 'REVENU AU NIVEAU 1' }}</small>
              <strong>{{ rate(item.incomeMicros) }}</strong>
            </div>
          </div>

          <div v-if="item.owned" class="enterprise-level">
            <div
              class="enterprise-level-fill"
              :style="{ width: `${item.level / MAX_ENTERPRISE_LEVEL * 100}%` }"
              role="progressbar"
              :aria-label="`Niveau de ${item.name}`"
              :aria-valuenow="item.level"
              aria-valuemin="0"
              :aria-valuemax="MAX_ENTERPRISE_LEVEL"
            ></div>
          </div>

          <div class="enterprise-card-details">
            <span v-if="item.owned && item.activeMilestone" class="enterprise-milestone-current">
              Palier acquis : {{ item.activeMilestone.name }}
            </span>
            <span v-else-if="item.nextMilestone">
              Prochain palier spécial : niv. {{ item.nextMilestone.level }} · {{ item.nextMilestone.name }}
            </span>
            <span v-if="item.owned && item.nextIncomeMicros !== null">
              Après amélioration : {{ rate(item.nextIncomeMicros) }}
            </span>
            <span v-if="item.owned && item.level === MAX_ENTERPRISE_LEVEL" class="enterprise-milestone-current">
              Entreprise entièrement développée
            </span>
          </div>

          <div class="enterprise-card-footer">
            <div class="enterprise-next-price">
              <span>{{ item.owned ? 'PROCHAINE AMÉLIORATION' : 'PRIX D’ACHAT' }}</span>
              <strong>{{ item.nextPriceCents === null ? 'NIVEAU MAX' : money(item.nextPriceCents / 100) }}</strong>
            </div>
            <button
              class="enterprise-action"
              type="button"
              :disabled="!item.canPurchase || item.nextPriceCents === null || (item.owned && item.level >= MAX_ENTERPRISE_LEVEL)"
              :aria-label="`${item.owned ? 'Améliorer' : 'Acheter'} ${item.name}`"
              @click="takeAction(item.id, item.owned)"
            >
              {{ item.owned && item.level >= MAX_ENTERPRISE_LEVEL ? 'MAX' : item.owned ? 'AMÉLIORER' : item.unlocked ? 'ACHETER' : `NIV. ${item.requiredPlayerLevel}` }}
            </button>
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
