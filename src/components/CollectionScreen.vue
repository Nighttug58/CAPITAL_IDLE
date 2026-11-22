<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { formatCompactUnits, formatFameMicros } from '../large-numbers.ts'
import type { V8CapitalState } from '../exact-state-v8.ts'
import { CURRENT_COLLECTION_ITEMS } from '../prestige/collections-catalog.ts'
import { fameV4Level } from '../trading/fame-v4-trading.ts'
import { fameV4Collections,v4RefreshPrivateOffers,v4CollectionPriceCents,v4PrivateDiscountBps,
  v4RestoreCostCents,v4MuseumMissingCost,v4ExhibitionCostCents,
  V4_WING_COSTS_CENTS,type FameV4CollectionCommand } from '../prestige/collections-v4.ts'
import { currentCollectionId, getCollectionSlot } from '../prestige/catalog.ts'
import { collectionRarity, collectionV3Snapshot, COLLECTION_SET_REWARDS } from '../prestige/collections-v3.ts'
import { v8CollectionReward, v8CollectionMaxQuote } from '../exact-runtime-v8.ts'
import { COLLECTION_CATEGORIES, FAME_BOOSTS, type CollectionCategoryId } from '../prestige/catalog.ts'
import {
  type CollectionPurchase, type CollectionPurchaseError,
} from '../prestige/collections.ts'

const props = defineProps<{
  state: V8CapitalState
  purchaseCollection: (id: string) => CollectionPurchase
  purchaseCollectionMax: () => {ok:true;count:number;costCents:bigint;fameMicros:bigint}|{ok:false;error:'invalid-state'|'none-affordable'}
  executeFameV4Collection?: (command:FameV4CollectionCommand)=>boolean
}>()

const category = ref<CollectionCategoryId>('watches')
const selectedId = ref<string | null>(null)
const confirming = ref(false)
const bulkConfirming = ref(false)
const bulkNotice = ref('')
const bulkError = ref(false)
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
const v4QuoteState=computed(()=>v4RefreshPrivateOffers(props.state,props.state.enterprises.lastAccruedAt))
const v4Data=computed(()=>fameV4Collections(props.state))
const v4Rank=(n:number)=>fameV4Level(props.state,n)
const missing=computed(()=>v4MuseumMissingCost(v4QuoteState.value))
const exhibitCost=computed(()=>v4ExhibitionCostCents(props.state))
const v4Notice=ref('')
const pendingV4=ref<FameV4CollectionCommand|null>(null)
const selectedRestoreCost=computed(()=>selectedItem.value?v4RestoreCostCents(selectedItem.value.id):null)
const canRestore=computed(()=>v4Rank(15)>0&&!!selectedOffer.value?.owned&&!!selectedItem.value&&
  !v4Data.value.restoredIds.some(x=>currentCollectionId(x)===currentCollectionId(selectedItem.value!.id))&&
  v4Data.value.restoredIds.length<v4Rank(15)*2&&
  selectedRestoreCost.value!==null&&BigInt(props.state.game.balance)>=selectedRestoreCost.value)
const offers=computed(()=>v4QuoteState.value.prestige.fameV4Collections?.offers)
function remaining(ms:number):string{
  const seconds=Math.max(0,Math.ceil((ms-props.state.enterprises.lastAccruedAt)/1000))
  return Math.floor(seconds/3600)+'h '+Math.floor(seconds%3600/60)+'m'
}
function prepV4(command:FameV4CollectionCommand){pendingV4.value=command;v4Notice.value=''}
function commitV4(){
  const command=pendingV4.value
  if(!command)return
  const success=props.executeFameV4Collection?.(command)??false
  v4Notice.value=success?'Opération V4 enregistrée. Aucun Fame supplémentaire généré.':
    'Achat refusé : niveau Fame, fonds, cooldown ou sauvegarde indisponible.'
  if(success)pendingV4.value=null
}
function viewOffered(itemId:string){
  const item=CURRENT_COLLECTION_ITEMS.find(x=>currentCollectionId(x.id)===currentCollectionId(itemId))
  if(!item)return
  selectCategory(item.category)
  openDetails(item.id)
}
const rows = computed(() => CURRENT_COLLECTION_ITEMS.filter(item => item.category === category.value).map(item => {
  const receipt = holdings.value.get(currentCollectionId(item.id))
  const paid = receipt ? getCollectionSlot(receipt) : undefined
  const price=paid?BigInt(paid.priceCents):v4CollectionPriceCents(v4QuoteState.value,item.id)!
  return { item: paid ? { ...item, priceCents: paid.priceCents, fame: paid.fame } : item,
    price,discountBps:paid?0:v4PrivateDiscountBps(v4QuoteState.value,item.id,props.state.enterprises.lastAccruedAt),
    owned: !!receipt, canAfford: !receipt && BigInt(props.state.game.balance) >= price,
    awardedFameMicros: paid ? null : Number(v8CollectionReward(props.state, item.fame)) }
}))
const collectionV3 = computed(() => collectionV3Snapshot(props.state.prestige.ownedCollectionIds))
const ownedCount = computed(() => collectionV3.value.owned)
const bulkQuote = computed(() => v8CollectionMaxQuote(props.state))
const categorySet = computed(() => COLLECTION_SET_REWARDS[category.value])
const categorySetName = computed(() => FAME_BOOSTS.find(row => row.id === categorySet.value.boostId)?.label ?? '')
const selectedOffer = computed(() => rows.value.find(row => row.item.id === selectedId.value))
const selectedItem = computed(() => selectedOffer.value?.item ?? null)
const selectedBonusName = computed(() =>
  FAME_BOOSTS.find((boost) => boost.id === selectedItem.value?.boostId)?.label ?? '',
)
const categoryOwned = computed(() => rows.value.filter(row => row.owned).length)
const requiresConfirmation = computed(() => (selectedOffer.value?.price??0n) >= 100_000_000n)

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
  if(pendingV4.value?.kind==='restore')pendingV4.value=null
  confirming.value = false
  notice.value = ''
  noticeError.value = false
  void nextTick(() => closeButton.value?.focus())
}
function closeDetails() {
  if(pendingV4.value?.kind==='restore')pendingV4.value=null
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
function buyCollectionMax() {
  if (bulkQuote.value.ids.length === 0) return
  if (!bulkConfirming.value) {
    bulkNotice.value = ''
    bulkConfirming.value = true
    return
  }
  bulkConfirming.value = false
  const result = props.purchaseCollectionMax()
  bulkError.value = !result.ok
  bulkNotice.value = result.ok
    ? result.count + ' objets acquis pour ' + formatCompactUnits(result.costCents, 2, '$') +
      ' · +' + formatFameMicros(result.fameMicros) + ' Fame.'
    : result.error === 'invalid-state'
      ? 'Sauvegarde non disponible : aucun achat effectué.'
      : 'Aucune pièce supplémentaire accessible avec le solde actuel.'
}
function cancelBulk() { bulkConfirming.value = false }

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

    <section class="collection-max-bar" aria-label="Achat rapide de collection">
      <div class="collection-max-info">
        <strong>Achat groupé</strong>
        <span>{{ bulkQuote.ids.length }} pièce{{ bulkQuote.ids.length > 1 ? 's' : '' }} accessible{{ bulkQuote.ids.length > 1 ? 's' : '' }} · {{ formatCompactUnits(bulkQuote.costCents, 2, '$') }}</span>
      </div>
      <button type="button" class="collection-max-button" :disabled="bulkQuote.ids.length === 0"
        @click="buyCollectionMax">ACHETER MAX</button>
    </section>
    <div v-if="bulkConfirming" class="collection-max-confirm" role="group" aria-label="Confirmer l'achat groupé">
      <span>Confirmer {{ bulkQuote.ids.length }} achat{{ bulkQuote.ids.length > 1 ? 's' : '' }} pour {{ formatCompactUnits(bulkQuote.costCents, 2, '$') }} ?</span>
      <div>
        <button type="button" class="collection-cancel" @click="cancelBulk">Annuler</button>
        <button type="button" class="collection-confirm-buy" @click="buyCollectionMax" :disabled="bulkQuote.ids.length === 0">Confirmer MAX</button>
      </div>
    </div>
    <p v-if="bulkNotice" class="prestige-notice collection-max-notice"
      :class="{ 'prestige-notice-error': bulkError }" role="status">{{ bulkNotice }}</p>

    <section class="collection-v3-museum" :class="{'is-complete': collectionV3.museumComplete}" aria-label="Musée impérial">
      <strong>Musée impérial · {{ ownedCount }}/100</strong>
      <span v-if="collectionV3.museumComplete">COMPLET — +100 % revenus éligibles et +25 % PP aux futurs Prestiges.</span>
      <span v-else>Complétez les 100 pièces pour +100 % aux revenus éligibles et +25 % PP futurs.</span>
    </section>

    <details v-if="[14,15,16,17,18].some(v4Rank)" class="collection-v4-panel" data-no-page-swipe>
      <summary><strong>FAME · MUSÉE IMPÉRIAL V4</strong>
        <small>{{ v4Data.restoredIds.length }} restaurations · {{ v4Data.wingTiers.length }} ailes</small></summary>
      <div class="collection-v4-content">
        <section v-if="v4Rank(14)>0" class="collection-v4-section" aria-label="Expositions temporaires">
          <h3>Expositions temporaires (+{{ v4Rank(14) }} % entreprises et dividendes)</h3>
          <p>Durée 30 min · cooldown 2 h · 3 objets requis · coût 0,5 % du patrimoine net positif, min. 1 M$.</p>
          <p v-if="v4Data.exhibition">Fin du bonus dans {{ remaining(v4Data.exhibition.endsAt) }} · disponibilité dans {{ remaining(v4Data.exhibition.cooldownUntil) }}</p>
          <strong>Prix actuel : {{ exhibitCost===null?'Indisponible':formatCompactUnits(exhibitCost,2,'$') }}</strong>
          <button type="button" :disabled="ownedCount<3||exhibitCost===null||BigInt(state.game.balance)<exhibitCost||
            (v4Data.exhibition!==null&&state.enterprises.lastAccruedAt<v4Data.exhibition.cooldownUntil)"
            @click="prepV4({kind:'exhibition'})">Préparer une exposition</button>
        </section>
        <section v-if="v4Rank(15)>0" class="collection-v4-section" aria-label="Restauration de prestige">
          <h3>Restauration de prestige · {{ v4Data.restoredIds.length }}/{{ v4Rank(15)*2 }}</h3>
          <p>Ouvrez une pièce possédée pour la restaurer pour 20 % du prix catalogue. Bonus permanent +0,25 % aux clics, dividendes et entreprises par pièce, sans Fame supplémentaire.</p>
        </section>
        <section v-if="v4Rank(16)>0" class="collection-v4-section" aria-label="Expert en antiquités">
          <h3>Expert en antiquités · musée {{ ownedCount }}/100</h3>
          <p>{{ missing.missing }} objets manquants · budget catalogue : {{ formatCompactUnits(missing.catalogCostCents,2,'$') }} · avec offres : {{ formatCompactUnits(missing.offeredCostCents,2,'$') }}</p>
          <div v-for="cat in COLLECTION_CATEGORIES" :key="cat.id" class="collection-v4-row">
            <span>{{ cat.label }}</span><span>{{ collectionV3.categories[cat.id] }}/20 · {{ 20-collectionV3.categories[cat.id] }} manquants</span>
          </div>
          <p>Bonus musée 100/100 existant : +100 % revenus, +25 % PP futurs. Aucun gain supplémentaire attribué par cet outil.</p>
        </section>
        <section v-if="v4Rank(17)>0" class="collection-v4-section" aria-label="Ventes privées">
          <h3>Ventes privées (−{{ v4Rank(17) }} %)</h3>
          <p>{{ offers?.items.length??0 }} offres non renouvelables avant 24 h · expiration dans {{ offers?remaining(offers.expiresAt):'24h' }}</p>
          <div v-for="row in offers?.items??[]" :key="row.itemId" class="collection-v4-row">
            <span>{{ CURRENT_COLLECTION_ITEMS.find(x=>currentCollectionId(x.id)===currentCollectionId(row.itemId))?.name??row.itemId }}</span>
            <button type="button" :disabled="row.used||holdings.has(currentCollectionId(row.itemId))"
              @click="viewOffered(row.itemId)">
              {{ row.used||holdings.has(currentCollectionId(row.itemId))?'UTILISÉE':'VOIR L’OFFRE' }}
            </button>
          </div>
        </section>
        <section v-if="v4Rank(18)>0" class="collection-v4-section" aria-label="Mécène impérial">
          <h3>Mécène impérial · {{ v4Data.wingTiers.length }}/{{ v4Rank(18) }} ailes</h3>
          <p>+0,5 % permanent aux entreprises et dividendes par aile. Ne compte pas dans les 100 objets.</p>
          <div v-for="tier in v4Rank(18)" :key="tier" class="collection-v4-row">
            <span>Aile {{ tier }} · {{ formatCompactUnits(V4_WING_COSTS_CENTS[tier-1]!,2,'$') }}</span>
            <button type="button" :disabled="v4Data.wingTiers.includes(tier-1)||BigInt(state.game.balance)<V4_WING_COSTS_CENTS[tier-1]!"
              @click="prepV4({kind:'wing',tier:tier-1})">{{ v4Data.wingTiers.includes(tier-1)?'ACQUISE':'PRÉPARER' }}</button>
          </div>
        </section>
        <div v-if="pendingV4&&pendingV4.kind!=='restore'" class="collection-v4-confirm" role="group" aria-label="Confirmer le coût Fame V4">
          <strong>Confirmer la dépense irréversible ?</strong>
          <p v-if="pendingV4.kind==='exhibition'">Exposition : {{ exhibitCost===null?'prix indisponible':formatCompactUnits(exhibitCost,2,'$') }}, tarif actualisé à la validation.</p>
          <p v-if="pendingV4.kind==='wing'">Aile {{ pendingV4.tier+1 }} : {{ formatCompactUnits(V4_WING_COSTS_CENTS[pendingV4.tier]!,2,'$') }}</p>
          <button type="button" @click="commitV4()">Confirmer le paiement</button>
          <button type="button" @click="pendingV4=null">Annuler</button>
        </div>
        <p v-if="v4Notice" class="collection-v4-notice" role="status">{{ v4Notice }}</p>
      </div>
    </details>

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
    <div class="collection-v3-set" :class="{'is-complete': categoryOwned === 20}" aria-live="polite">
      <span>Collection de catégorie : {{ categoryOwned }}/20</span>
      <strong>{{ categoryOwned === 20 ? 'DÉBLOQUÉ' : 'À DÉBLOQUER' }} · +{{ percentage(categorySet.bonusBps) }} {{ categorySetName }}</strong>
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
            <span class="collection-rarity-tag">{{ collectionRarity(offer.item.id)?.label }}</span>
            <span v-if="offer.owned" class="collection-owned-tag">ACQUIS</span>
            <span v-else-if="offer.discountBps>0" class="collection-v4-discount">OFFRE −{{ offer.discountBps/100 }} %</span>
          </span>
          <span class="collection-card-info">
            <strong>{{ offer.item.name }}</strong>
            <span class="collection-card-price">{{ offer.discountBps>0?formatCompactUnits(offer.price,2,'$'):money(offer.item.priceCents) }}</span>
            <span class="collection-card-rewards">
              <span>✦ +{{ offer.awardedFameMicros === null ? offer.item.fame : fame(offer.awardedFameMicros) }} Fame</span>
              <span>+{{ percentage(offer.item.bonusBps) }} objet · +{{ percentage(collectionRarity(offer.item.id)?.bonusBps ?? 0) }} rareté</span>
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
            <div><span>PRIX EN GOLD</span><strong>{{ selectedOffer.discountBps>0?formatCompactUnits(selectedOffer.price,2,'$'):money(selectedItem.priceCents) }}
            <small v-if="selectedOffer.discountBps>0"> · Offre −{{ selectedOffer.discountBps/100 }} %</small></strong></div>
            <div><span>{{ selectedOffer.owned ? 'FAME DE BASE' : 'FAME À RECEVOIR' }}</span><strong class="collection-fame-balance">✦ +{{ selectedOffer.awardedFameMicros === null ? selectedItem.fame : fame(selectedOffer.awardedFameMicros) }}</strong></div>
            <div><span>BONUS ORIGINAL</span><strong>+{{ percentage(selectedItem.bonusBps) }} · {{ selectedBonusName }}</strong></div>
            <div><span>RARETÉ</span><strong>{{ collectionRarity(selectedItem.id)?.label }} · +{{ percentage(collectionRarity(selectedItem.id)?.bonusBps ?? 0) }} {{ selectedBonusName }}</strong></div>
            <div><span>ENSEMBLE {{ categoryOwned }}/20</span><strong>+{{ percentage(categorySet.bonusBps) }} {{ categorySetName }} {{ categoryOwned === 20 ? '· ACTIF' : '· NON ACTIF' }}</strong></div>
            <div><span>MUSÉE {{ ownedCount }}/100</span><strong>{{ collectionV3.museumComplete ? '+100 % revenus · +25 % PP futurs' : 'Bonus de complétion non activé' }}</strong></div>
          </div>
          <p class="collection-detail-note">Achat unique, permanent et non revendable. La Fame est attribuée au moment de l'achat.</p>
          <div v-if="selectedOffer.owned&&v4Rank(15)>0" class="collection-v4-restoration" aria-label="Restaurer cette pièce">
            <strong>{{ v4Data.restoredIds.some(x=>currentCollectionId(x)===currentCollectionId(selectedItem?.id??''))?
              'Restauration déjà acquise · +0,25 % revenus':'Restauration · +0,25 % revenus éligibles' }}</strong>
            <p>Coût : {{ selectedRestoreCost===null?'indisponible':formatCompactUnits(selectedRestoreCost,2,'$') }} ·
              {{ v4Data.restoredIds.length }}/{{ v4Rank(15)*2 }} pièces restaurées.</p>
            <button v-if="canRestore" type="button" @click="prepV4({kind:'restore',id:selectedItem.id})">Préparer la restauration</button>
            <div v-if="pendingV4?.kind==='restore'&&pendingV4.id===selectedItem.id" class="collection-v4-confirm"
              role="group" aria-label="Confirmer la restauration">
              <p>Confirmer cette dépense unique ? Aucune récompense Fame supplémentaire.</p>
              <button type="button" @click="commitV4()">Confirmer la restauration</button>
              <button type="button" @click="pendingV4=null">Annuler</button>
            </div>
            <p v-if="v4Notice" class="collection-v4-notice" role="status">{{ v4Notice }}</p>
          </div>
          <div v-if="confirming" class="collection-confirm" role="alert">
            <strong>Confirmer cet achat prestigieux ?</strong>
            <p>Vous allez dépenser {{ selectedOffer.discountBps>0?formatCompactUnits(selectedOffer.price,2,'$'):money(selectedItem.priceCents) }}. L'objet ne pourra pas être revendu.</p>
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

<style scoped>
.collection-v4-panel {margin:9px 0 12px;border:1px solid rgba(152,116,205,.45);border-radius:11px;background:#25243a;color:#e5e0f5}
.collection-v4-panel>summary {cursor:pointer;display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:space-between;padding:10px 12px;font-size:12px}
.collection-v4-panel>summary small {font-size:10px;color:#c4b2e0}
.collection-v4-content {padding:5px 10px 12px;display:grid;gap:9px}
.collection-v4-section {display:grid;gap:7px;border:1px solid #45435f;border-radius:9px;background:#1f2c40;padding:10px;min-width:0}
.collection-v4-section h3 {color:#eadeff;font-size:12px;margin:0}
.collection-v4-section p,.collection-v4-restoration p {color:#bccce0;font-size:11px;line-height:1.5;margin:0}
.collection-v4-section>strong {font-size:11px}
.collection-v4-section button,.collection-v4-confirm button,.collection-v4-restoration button {background:#564782;border:1px solid #9582ca;color:#f5eaff;padding:7px 10px;border-radius:7px;min-height:34px;font-size:11px;font-weight:700}
.collection-v4-section button:disabled,.collection-v4-restoration button:disabled {opacity:.45}
.collection-v4-row {display:flex;gap:8px;justify-content:space-between;align-items:center;min-width:0;line-height:1.35;border-top:1px solid #45435f;padding:6px 0;font-size:10px}
.collection-v4-row>span:first-child {min-width:0;overflow-wrap:anywhere;flex:1}
.collection-v4-confirm {display:grid;gap:8px;border:1px solid #ae865e;background:#3c302c;padding:10px;border-radius:9px;font-size:11px}
.collection-v4-confirm p {margin:0;font-size:11px;line-height:1.45}
.collection-v4-restoration {margin-top:8px;padding:9px;border:1px solid #645887;border-radius:8px;display:grid;gap:7px;background:#242b40}
.collection-v4-restoration strong {color:#ebdfff;font-size:11px}
.collection-v4-notice {margin:0;font-size:11px;color:#dfc5fe;line-height:1.45}
.collection-v4-discount {font-size:9px;font-weight:700;color:#7cf2ca}
@media(max-width:390px){.collection-v4-panel>summary {font-size:11px}.collection-v4-row{flex-wrap:wrap}}
</style>