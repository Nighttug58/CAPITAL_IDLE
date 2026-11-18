<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import type { V8CapitalState } from '../exact-state-v8.ts'
import {
  TRANSCENDENT_MAIN_PRESENTATION, TRANSCENDENT_NEWS_PRESENTATION,
  TRANSCENDENT_MAX_LEVEL, transcendentLevel, transcendentNextCost,
  transcendentSpent, transcendentHeritageBps, pendingStartingCapitalCents,
  transcendentReserveRatio, transcendentUltimateUnlocked,
  type TranscendentId,
} from '../ascension/transcendent-v1.ts'
import { formatCompactUnits } from '../large-numbers.ts'
import { FAME_FACTOR_SCALE, formatFameFactor } from '../prestige/absolute-v8.ts'

const props=defineProps<{
  exact:V8CapitalState
  purchaseBranch:(id:TranscendentId,currentRank:number,quotedCost:bigint)=>boolean
}>()
const emit=defineEmits<{back:[]}>()
const returnButton=ref<HTMLButtonElement|null>(null)
const busy=ref(false)
const notice=ref('')
const error=ref(false)
const integer=new Intl.NumberFormat('fr-CH',{maximumFractionDigits:0})
const fmt=(value:bigint|string|number)=>integer.format(typeof value==='string'?BigInt(value):value)
const grouped=(value:number)=>integer.format(value).replace(/[^0-9]/g,' ')
const progress=computed(()=>props.exact.ascension.progress)
const points=computed(()=>BigInt(progress.value.availablePoints))
const transcendentSpentPP=computed(()=>transcendentSpent(progress.value.transcendentV1)??0n)
const totalRanks=computed(()=>[...TRANSCENDENT_MAIN_PRESENTATION,...TRANSCENDENT_NEWS_PRESENTATION]
  .reduce((total,row)=>total+transcendentLevel(progress.value,row.id),0))
const heritageBps=computed(()=>transcendentHeritageBps(progress.value))
const startingCapitalPreview=computed(()=>pendingStartingCapitalCents(progress.value))
const ultimateUnlocked=computed(()=>transcendentUltimateUnlocked(progress.value))
const reserveRatio=computed(()=>transcendentReserveRatio(progress.value))
const reserveFactor=computed(()=>formatFameFactor(
  reserveRatio.value.numerator*FAME_FACTOR_SCALE/reserveRatio.value.denominator))
const mainTotal=computed(()=>TRANSCENDENT_MAIN_PRESENTATION.reduce((sum,row)=>
  sum+transcendentLevel(progress.value,row.id),0))
function offer(id:TranscendentId){
  const rank=transcendentLevel(progress.value,id)
  const locked=false
  const cost=transcendentNextCost(rank)
  return {rank,cost,locked,available:progress.value.prestigeCount>=3 &&
    cost!==null&&points.value>=cost}
}
const main=computed(()=>TRANSCENDENT_MAIN_PRESENTATION.map(entry=>({...entry,...offer(entry.id)})))
const news=computed(()=>TRANSCENDENT_NEWS_PRESENTATION.map(entry=>({...entry,...offer(entry.id)})))
function purchase(id:TranscendentId,rank:number,cost:bigint|null){
  if(busy.value||cost===null)return
  busy.value=true
  try {
    const accepted=props.purchaseBranch(id,rank,cost)
    error.value=!accepted
    notice.value=accepted
      ? 'Niveau '+(rank+1)+' acheté sur '+id+' pour '+fmt(cost)+' PP.'
      : 'Achat refusé : vérifie tes PP, ton niveau ou la sauvegarde.'
  } finally {busy.value=false}
}
function keydown(event:KeyboardEvent){
  if(event.key==='Escape'&&!busy.value){event.preventDefault();emit('back')}
}
onMounted(()=>{
  window.addEventListener('keydown',keydown)
  void nextTick(()=>returnButton.value?.focus())
})
onUnmounted(()=>window.removeEventListener('keydown',keydown))
</script>

<template>
  <main class="ascension-screen transcendent-screen" aria-label="Boutique Prestige Transcendant">
    <header class="ascension-page-header">
      <button ref="returnButton" type="button" class="ascension-return"
        aria-label="Retour à la page Prestige" @click="emit('back')">
        ← Prestige
      </button>
      <div><span class="ascension-eyebrow">EMPIRE PERMANENT · PRESTIGE 3</span>
        <h1>Prestige Transcendant</h1>
        <p>Chaque branche possède 1 000 niveaux. Tous les achats consomment les PP du même portefeuille permanent.</p>
      </div>
    </header>
    <div class="ascension-summary" aria-label="Solde et dépenses Prestige Transcendant">
      <div><span>PP DISPONIBLES</span><strong>{{ fmt(points) }}</strong></div>
      <div><span>PP TRANSCENDANT DÉPENSÉS</span><strong>{{ fmt(transcendentSpentPP) }}</strong></div>
      <div><span>NIVEAUX ACHETÉS</span><strong>{{ fmt(totalRanks) }}/10 000</strong></div>
      <div><span>PRESTIGES</span><strong>{{ fmt(progress.prestigeCountExact??progress.prestigeCount) }}</strong></div>
    </div>
    <section class="transcendent-ultimate" :class="{'is-unlocked':ultimateUnlocked}"
      aria-label="Prestige Transcendant ultime" data-ultimate-reserve>
      <strong>Prestige Transcendant ultime · {{ grouped(mainTotal) }}/7 000</strong>
      <span v-if="ultimateUnlocked">DÉBLOQUÉ — Réserve {{ fmt(points) }} PP · facteur ×{{ reserveFactor }}</span>
      <span v-else>Débloqué gratuitement à 7 × 1 000 niveaux sur les sept branches principales.</span>
      <small>Le facteur de réserve est inférieur à ×1,5 et ne renforce que les cinq bonus économiques. Aucun effet sur PP, capital initial ou news.</small>
    </section>
    <div class="ascension-scroll">
      <section class="transcendent-main" aria-label="Sept branches principales">
        <div class="ascension-shop-heading">
          <div><span class="ascension-eyebrow">BOUTIQUE TRANSCENDANTE</span><h2>Sept branches principales</h2></div>
          <span>1 000 niveaux / branche</span>
        </div>
        <p class="transcendent-small">Les cinq bonus de gains et l'Héritage s'ajoutent aux bonus existants. Les effets sont permanents et ne sont jamais réappliqués rétroactivement. Le bonus ultime s'active automatiquement lorsque les sept branches principales atteignent 1 000.</p>
        <article v-for="row in main" :key="row.id" class="ascension-upgrade"
          :class="{'transcendent-disabled':row.locked}" :data-transcendent="row.id">
          <div class="ascension-upgrade-top">
            <div><strong>{{ row.name }}</strong><p>{{ row.description }}</p></div>
            <span class="ascension-upgrade-level">NIV. {{ row.rank }}/{{ TRANSCENDENT_MAX_LEVEL }}</span>
          </div>
          <div class="ascension-upgrade-track" role="progressbar" :aria-label="'Niveau de '+row.name"
            :aria-valuemin="0" :aria-valuemax="TRANSCENDENT_MAX_LEVEL" :aria-valuenow="row.rank">
            <span :style="{width:(row.rank/TRANSCENDENT_MAX_LEVEL*100)+'%'}"></span>
          </div>
          <div class="ascension-upgrade-effect"><span>{{ row.effect }}</span>
            <span v-if="row.id==='heritage'">PP prochain Prestige : ×{{ (heritageBps/10_000).toFixed(3) }}</span>
            <span v-else-if="row.id==='starting-capital'">Après Prestige : {{ formatCompactUnits(startingCapitalPreview) }}</span>
            <span v-else>Bonus acquis : +{{ (row.rank*(row.id==='empire'?.3:.2)).toFixed(1) }} %</span>
          </div>
          <div class="ascension-upgrade-footer">
            <span class="ascension-upgrade-cost">
              {{ row.cost===null?'TERMINÉ':fmt(row.cost)+' PP · niveau suivant' }}
            </span>
            <button type="button" class="ascension-buy" :disabled="!row.available || busy"
              :aria-label="'Acheter '+row.name+' niveau '+(row.rank+1)"
              @click="purchase(row.id,row.rank,row.cost)">
              {{ row.cost===null?'MAX':progress.prestigeCount<3?'PRESTIGE 3 REQUIS':row.available?'ACHETER':'PP INSUFF.' }}
            </button>
          </div>
        </article>
      </section>
      <section class="transcendent-news" aria-label="Trois branches News avancées">
        <div class="ascension-shop-heading">
          <div><span class="ascension-eyebrow">NEWS TRANSCENDANTES</span><h2>Trois branches médiatiques</h2></div>
          <span>1 000 niveaux / branche</span>
        </div>
        <article v-for="row in news" :key="row.id" class="ascension-upgrade"
          :data-transcendent="row.id">
          <div class="ascension-upgrade-top">
            <div><strong>{{ row.name }}</strong><p>{{ row.description }}</p></div>
            <span class="ascension-upgrade-level">NIV. {{ row.rank }}/{{ TRANSCENDENT_MAX_LEVEL }}</span>
          </div>
          <div class="ascension-upgrade-track" role="progressbar" :aria-label="'Niveau de '+row.name"
            :aria-valuenow="row.rank" aria-valuemin="0" :aria-valuemax="TRANSCENDENT_MAX_LEVEL">
            <span :style="{width:(row.rank/TRANSCENDENT_MAX_LEVEL*100)+'%'}"></span>
          </div>
          <div class="ascension-upgrade-effect"><span>{{ row.effect }}</span><span>Permanent</span></div>
          <div class="ascension-upgrade-footer">
            <span class="ascension-upgrade-cost">{{ row.cost===null?'TERMINÉ':fmt(row.cost)+' PP' }}</span>
            <button type="button" class="ascension-buy" :disabled="!row.available || busy"
              :aria-label="'Acheter '+row.name+' niveau '+(row.rank+1)"
              @click="purchase(row.id,row.rank,row.cost)">
              {{ row.cost===null?'MAX':progress.prestigeCount<3?'PRESTIGE 3 REQUIS':row.available?'ACHETER':'PP INSUFF.' }}
            </button>
          </div>
        </article>
      </section>
      <p class="ascension-endnote">Le Capital de départ n'est attribué qu'après chaque Prestige, sans taxe ni XP, Fame ou PP immédiats. Son principal reste exclu de l'assiette des PP au cycle suivant. Le bonus ultime utilise les PP disponibles sans les consommer et suit immédiatement le solde.</p>
    </div>
    <footer class="ascension-footer" aria-live="polite">
      <p v-if="notice" class="ascension-notice transcendent-notice" :class="{'is-error':error}" role="status">{{ notice }}</p>
      <p v-else>Aucun achat n'attribue rétroactivement de Fame, XP, cash ou PP.</p>
    </footer>
  </main>
</template>
