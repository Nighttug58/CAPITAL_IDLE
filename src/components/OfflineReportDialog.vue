<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { OfflineReport } from '../offline-report-v8.ts'
import { formatCompactUnits, formatFameMicros, formatDecimalUnits } from '../large-numbers.ts'
const props=defineProps<{ report:OfflineReport }>()
const emit=defineEmits<{close:[]}>()
const dialog=ref<HTMLDialogElement|null>(null)
const detailButton=ref<HTMLButtonElement|null>(null)
const details=ref(false)
const pending=computed(()=>props.report.remainingSeconds>0&&!props.report.incomplete)
const signed=(value:bigint)=> (value>0n?'+':'')+formatCompactUnits(value)
const tone=(value:bigint)=>value>0n?'positive':value<0n?'negative':'neutral'
const duration=(ms:number)=>{
  const total=Math.floor(ms/1000)
  const d=Math.floor(total/86400),h=Math.floor(total/3600)%24,m=Math.floor(total/60)%60,s=total%60
  return [d?d+' j':'',h?h+' h':'',m?m+' min':'',!d&&!h?s+' s':''].filter(Boolean).join(' ')||'0 s'
}
const progress=computed(()=>Math.max(0,Math.min(100,100-100*props.report.remainingSeconds/Math.max(1,Math.floor(props.report.marketDurationMs/1000)))))
onMounted(()=>{
  const el=dialog.value
  if(el&&typeof el.showModal==='function'){
    try{el.showModal()}catch{el.setAttribute('open','')}
  }else el?.setAttribute('open','')
  detailButton.value?.focus()
})
function dismiss(){emit('close')}
</script>
<template>
  <dialog ref="dialog" class="offline-report-dialog" aria-labelledby="offline-report-title" @cancel.prevent="dismiss">
    <header class="offline-report-header">
      <div><span class="eyebrow">BILAN HORS LIGNE</span><h2 id="offline-report-title">Bon retour !</h2></div>
      <span class="offline-duration">{{ duration(report.durationMs) }}</span>
    </header>
    <div class="offline-report-body">
      <div class="offline-cash">
        <span>{{ pending ? 'Cash crédité à ce stade' : 'Variation du cash' }}</span>
        <strong :class="tone(report.cashChange)">{{ signed(report.cashChange) }}</strong>
      </div>
      <dl class="offline-lines">
        <div><dt>Entreprises</dt><dd :class="tone(report.enterprises)">{{ signed(report.enterprises) }}</dd></div>
        <div><dt>Auto Click <small>{{ report.clickCount.toLocaleString('fr-CH') }} clics</small></dt><dd :class="tone(report.clicks)">{{ signed(report.clicks) }}</dd></div>
        <div><dt>Dividendes {{ pending?'(en cours)':'' }}</dt><dd :class="tone(report.dividends)">{{ signed(report.dividends) }}</dd></div>
        <div><dt>Taxes prélevées</dt><dd :class="tone(-report.taxesPaid)">{{ signed(-report.taxesPaid) }}</dd></div>
        <div><dt>XP / Fame</dt><dd>{{ formatCompactUnits(report.xp,2,'XP') }} / {{ formatFameMicros(report.fame) }}</dd></div>
      </dl>
      <div v-if="pending" class="offline-replay" role="status">
        <span>Calcul du marché · {{ Math.floor(progress) }} %</span>
        <progress :value="progress" max="100"></progress>
        <small>Les revenus passifs sont déjà crédités.</small>
      </div>
      <p v-if="report.incomplete" class="offline-note">Rattrapage du marché incomplet : résultats partiels uniquement.</p>
      <div class="offline-market-summary">
        <span>Trading · variation latente</span><strong :class="tone(report.marketChange)">{{ signed(report.marketChange) }}</strong>
        <span>Staking · valeur des tokens reçus</span><strong :class="tone(report.stakingValue)">{{ signed(report.stakingValue) }}</strong>
      </div>
      <button ref="detailButton" class="offline-detail-toggle" type="button" :aria-expanded="details" aria-controls="offline-market-detail" @click="details=!details">
        {{ details?'Masquer le détail':'Détail Trading & dividendes' }} <span aria-hidden="true">{{ details?'−':'+' }}</span>
      </button>
      <section v-if="details" id="offline-market-detail" class="offline-detail">
        <dl class="offline-lines">
          <div><dt>Actions</dt><dd :class="tone(report.stocks)">{{ signed(report.stocks) }}</dd></div>
          <div><dt>Cryptos</dt><dd :class="tone(report.crypto)">{{ signed(report.crypto) }}</dd></div>
          <div><dt>Memecoins</dt><dd :class="tone(report.memecoins)">{{ signed(report.memecoins) }}</dd></div>
          <div><dt>Dividendes encaissés</dt><dd :class="tone(report.dividends)">{{ signed(report.dividends) }}</dd></div>
          <div><dt>Taxes générées (dont prélevées)</dt><dd>{{ formatCompactUnits(report.taxesGenerated) }}</dd></div>
        </dl>
        <p class="offline-note">Variation des cours sur les positions détenues, hors frais de vente. Ce résultat latent n'est pas ajouté au cash.</p>
        <p v-if="!report.assets.length" class="offline-note">Aucun actif détenu pendant cette période.</p>
        <div v-for="asset in report.assets" :key="asset.id" class="offline-asset">
          <div><strong>{{ asset.symbol }}</strong><small>{{ asset.name }}</small></div>
          <div><strong :class="tone(asset.marketChange)">{{ signed(asset.marketChange) }}</strong><small>{{ formatCompactUnits(asset.before) }} → {{ formatCompactUnits(asset.after) }}</small>
          <small v-if="asset.stakingUnits>0n">Staking +{{ formatDecimalUnits(asset.stakingUnits,asset.decimals,true) }} {{ asset.symbol }}</small></div>
        </div>
      </section>
    </div>
    <footer class="offline-report-footer">
      <button type="button" @click="dismiss">{{ pending?'Continuer sans attendre le détail':'Continuer' }}</button>
    </footer>
  </dialog>
</template>
