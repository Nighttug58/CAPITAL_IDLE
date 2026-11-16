<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { formatCompactUnits, formatFameMicros } from '../large-numbers.ts'
import type { V8CapitalState } from '../exact-state-v8.ts'
import { CURRENT_COLLECTION_ITEMS } from '../prestige/collections-catalog.ts'
import { currentCollectionId, getCollectionSlot } from '../prestige/catalog.ts'
import { v8CollectionReward } from '../exact-runtime-v8.ts'
import { COLLECTION_CATEGORIES, FAME_BOOSTS, type CollectionCategoryId } from '../prestige/catalog.ts'
import {
  type CollectionPurchase, type CollectionPurchaseError,
} from '../prestige/collections.ts'

const props = defineProps<{
  state: V8CapitalState
  purchaseCollection: (id: string) => CollectionPurchase
}>()

const category = ref<CollectionCategoryId>('watches')
const selectedId = ref<string | null>(null)
const confirming = ref(false)
const notice = ref('')
const noticeError = ref(false)
const closeButton = ref<HTMLButtonElement | null>(null)
const dialog = ref<HTMLElement | null>(null)
const numbers = new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 2 })
const money = (cents: number) => numbers.format(cents / 100) + ' $'
const fame = (micros: number) => formatFameMicros(BigInt(Math.round(micros)))
const percentage = (bps: number) => numbers.format(bps / 100) + ' %'
const iconByCategory: Record<CollectionCategoryId, string> = {
  watches: '⌚', autos: '🏎', paintings: '▣', antiquities: '🏺', jewelry: '◆',
}
const holdings = computed(() => new Map(props.state.prestige.ownedCollectionIds.map(id => [currentCollectionId(id), id])))
const rows = computed(() => CURRENT_COLLECTION_ITEMS.filter(item => item.category === category.value).map(item => {
  const receipt = holdings.value.get(currentCollectionId(item.id))
  const paid = receipt ? getCollectionSlot(receipt) : undefined
  return { item: paid ? { ...item, priceCents: paid.priceCents, fame: paid.fame } : item,
    owned: !!receipt, canAfford: !receipt && BigInt(props.state.game.balance) >= BigInt(item.priceCents),
    awardedFameMicros: paid ? null : Number(v8CollectionReward(props.state, item.fame)) }
}))
const ownedCount = computed(() => holdings.value.size)
const selectedOffer = computed(() => rows.value.find(row => row.item.id === selectedId.value))
const selectedItem = computed(() => selectedOffer.value?.item ?? null)
const selectedBonusName = computed(() =>
  FAME_BOOSTS.find((boost) => boost.id === selectedItem.value?.boostId)?.label ?? '',
)
const categoryOwned = computed(() => rows.value.filter(row => row.owned).length)
const requiresConfirmation = computed(() => (selectedItem.value?.priceCents ?? 0) >= 100_000_000)

const errors: Record<CollectionPurchaseError, string> = {
  'unknown-item': 'Objet introuvable.',
  'already-owned': 'Cet objet appartient déjà à votre collection.',
  'insufficient-funds': 'Solde Gold insuffisant.',
  'invalid-state': 'La sauvegarde est incohérente. Aucun achat effectué.',
  'money-overflow': 'Montant hors limites : achat annulé.',
}
function selectCategory(value: CollectionCategoryId) {
  category.value = value
  confirming.value = false
  notice.value = ''
  closeDetails()
}
function moveCategory(direction: -1 | 1) {
  const current = COLLECTION_CATEGORIES.findIndex((entry) => entry.id === category.value)
  const next = COLLECTION_CATEGORIES[(current + direction + COLLECTION_CATEGORIES.length) % COLLECTION_CATEGORIES.length]!
  selectCategory(next.id)
  void nextTick(() => document.querySelector<HTMLButtonElement>(
    '.collection-tab[aria-selected="true"]',
  )?.focus())
}
function openDetails(id: string) {
  selectedId.value = id
  confirming.value = false
  notice.value = ''
  noticeError.value = false
  void nextTick(() => closeButton.value?.focus())
}
function closeDetails() {
  const previous = selectedId.value
  selectedId.value = null
  confirming.value = false
  notice.value = ''
  if (previous !== null) {
    void nextTick(() => document.querySelector<HTMLButtonElement>(
      '.collection-card[data-item-id="' + previous + '"]',
    )?.focus())
  }
}
function buySelected() {
  const offer = selectedOffer.value
  if (!offer || offer.owned || !offer.canAfford) return
  if (requiresConfirmation.value && !confirming.value) {
    confirming.value = true
    return
  }
  const result = props.purchaseCollection(offer.item.id)
  confirming.value = false
  noticeError.value = !result.ok
  notice.value = result.ok
    ? 'Achat confirmé : +' + fame(result.receipt.awardedFameMicros) + ' Fame. Bonus permanent débloqué.'
    : errors[result.error]
}
function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || selectedId.value === null) return
  event.preventDefault()
  closeDetails()
}
function trapFocus(event: KeyboardEvent) {
  if (event.key !== 'Tab' || !dialog.value) return
  const controls = Array.from(dialog.value.querySelectorAll<HTMLElement>('button:not(:disabled)'))
  if (!controls.length) return
  const first = controls[0]!
  const last = controls[controls.length - 1]!
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}
onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <main id="collection" class="collection-screen" aria-label="Collection de prestige">
    <header class="collection-hero">
      <div>
        <span class="eyebrow">CAPITAL · PIÈCES D'EXCEPTION</span>
        <h1>Collection</h1>
        <p>Un patrimoine de luxe, des bonus permanents et de la Fame.</p>
      </div>
      <div class="collection-hero-progress">
        <span>ACQUIS</span>
        <strong>{{ ownedCount }} <small>/ {{ CURRENT_COLLECTION_ITEMS.length }}</small></strong>
      </div>
    </header>

    <div class="collection-summary">
      <div><span>GOLD DISPONIBLE</span><strong>{{ formatCompactUnits(BigInt(state.game.balance), 2, '$') }}</strong></div>
      <div><span>FAME DISPONIBLE</span><strong class="collection-fame-balance">✦ {{ formatFameMicros(BigInt(state.prestige.fameMicros)) }}</strong></div>
    </div>

    <div class="collection-tabs" role="tablist" aria-label="Catégories de collection">
      <button v-for="entry in COLLECTION_CATEGORIES" :key="entry.id" type="button"
        class="collection-tab" role="tab" :class="{ 'is-selected': category === entry.id }"
        :aria-selected="category === entry.id" :aria-controls="'collection-items-' + entry.id"
        :tabindex="category === entry.id ? 0 : -1"
        @click="selectCategory(entry.id)"
        @keydown.left.prevent="moveCategory(-1)"
        @keydown.right.prevent="moveCategory(1)">
        <span class="collection-tab-symbol" aria-hidden="true">{{ iconByCategory[entry.id] }}</span>
        <span>{{ entry.label }}</span>
      </button>
    </div>
    <div class="collection-category-line">
      <span>{{ COLLECTION_CATEGORIES.find((entry) => entry.id === category)?.label }}</span>
      <span>{{ categoryOwned }} / {{ rows.length }} pièces</span>
    </div>

    <div :id="'collection-items-' + category" class="collection-list-scroll" role="tabpanel"
      :aria-label="'Objets de la catégorie ' + category">
      <div class="collection-grid">
        <button v-for="offer in rows" :key="offer.item.id" type="button" class="collection-card"
          :data-item-id="offer.item.id" :class="{ 'is-owned': offer.owned }"
          :aria-label="'Consulter ' + offer.item.name" @click="openDetails(offer.item.id)">
          <span class="collection-card-art" :data-category="offer.item.category">
            <span class="collection-card-rank">N° {{ String(offer.item.rank).padStart(2, '0') }}</span>
            <span class="collection-card-glyph" aria-hidden="true">{{ iconByCategory[offer.item.category] }}</span>
            <span v-if="offer.owned" class="collection-owned-tag">ACQUIS</span>
          </span>
          <span class="collection-card-info">
            <strong>{{ offer.item.name }}</strong>
            <span class="collection-card-price">{{ money(offer.item.priceCents) }}</span>
            <span class="collection-card-rewards">
              <span>✦ +{{ offer.awardedFameMicros === null ? offer.item.fame : fame(offer.awardedFameMicros) }} Fame</span>
              <span>+{{ percentage(offer.item.bonusBps) }}</span>
            </span>
          </span>
        </button>
      </div>
      <p class="collection-disclaimer">Pièces de collection fictives, non revendables. Les prix en Gold sont fixes et chaque achat est définitif.</p>
    </div>

    <div v-if="selectedOffer && selectedItem" class="prestige-overlay collection-overlay" @click.self="closeDetails">
      <section ref="dialog" class="prestige-dialog collection-detail-dialog" role="dialog" aria-modal="true"
        aria-labelledby="collection-detail-title" @keydown="trapFocus">
        <header class="prestige-dialog-head">
          <div class="prestige-dialog-heading">
            <span class="prestige-eyebrow">OBJET {{ selectedItem.rank }} / {{ rows.length }} · {{ COLLECTION_CATEGORIES.find((entry) => entry.id === selectedItem?.category)?.label }}</span>
            <h2 id="collection-detail-title">{{ selectedItem.name }}</h2>
          </div>
          <button ref="closeButton" type="button" class="prestige-close" aria-label="Fermer les détails de l'objet"
            @click="closeDetails">×</button>
        </header>
        <div class="prestige-dialog-scroll collection-detail-scroll">
          <div class="collection-detail-art" :data-category="selectedItem.category">
            <span aria-hidden="true">{{ iconByCategory[selectedItem.category] }}</span>
            <span v-if="selectedOffer.owned" class="collection-detail-owned">PIÈCE ACQUISE</span>
          </div>
          <p class="collection-detail-description">{{ selectedItem.description }}</p>
          <div class="collection-detail-data">
            <div><span>PRIX EN GOLD</span><strong>{{ money(selectedItem.priceCents) }}</strong></div>
            <div><span>{{ selectedOffer.owned ? 'FAME DE BASE' : 'FAME À RECEVOIR' }}</span><strong class="collection-fame-balance">✦ +{{ selectedOffer.awardedFameMicros === null ? selectedItem.fame : fame(selectedOffer.awardedFameMicros) }}</strong></div>
            <div><span>BONUS PERMANENT</span><strong>+{{ percentage(selectedItem.bonusBps) }} · {{ selectedBonusName }}</strong></div>
          </div>
          <p class="collection-detail-note">Achat unique, permanent et non revendable. La Fame est attribuée au moment de l'achat.</p>
          <div v-if="confirming" class="collection-confirm" role="alert">
            <strong>Confirmer cet achat prestigieux ?</strong>
            <p>Vous allez dépenser {{ money(selectedItem.priceCents) }}. L'objet ne pourra pas être revendu.</p>
            <div class="collection-confirm-actions">
              <button type="button" class="collection-cancel" @click="confirming = false">Annuler</button>
              <button type="button" class="collection-confirm-buy" @click="buySelected">Confirmer l'achat</button>
            </div>
          </div>
          <button v-else class="collection-buy-button" type="button"
            :disabled="selectedOffer.owned || !selectedOffer.canAfford"
            @click="buySelected">
            {{ selectedOffer.owned ? 'DÉJÀ ACQUIS' : selectedOffer.canAfford ? 'ACHETER CET OBJET' : 'GOLD INSUFFISANT' }}
          </button>
          <p v-if="notice" class="prestige-notice" :class="{ 'prestige-notice-error': noticeError }" role="status">{{ notice }}</p>
        </div>
      </section>
    </div>
  </main>
</template>
