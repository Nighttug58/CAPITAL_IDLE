<script setup lang="ts">
type PrestigeTab = 'prestige' | 'transcendent'
defineProps<{ active: PrestigeTab }>()
const emit = defineEmits<{ select: [tab: PrestigeTab] }>()
const tabs: readonly { key: PrestigeTab; label: string }[] = [
  { key: 'prestige', label: 'Prestige' },
  { key: 'transcendent', label: 'Prestige Transcendant' },
]
</script>

<template>
  <nav class="prestige-tabs trading-tabs" aria-label="Rubriques Prestige">
    <button v-for="tab in tabs" :key="tab.key" type="button"
      class="prestige-tab trading-tab" :data-prestige-tab="tab.key"
      :class="{ 'is-selected': active === tab.key }" :aria-pressed="active === tab.key"
      @click="emit('select', tab.key)">{{ tab.label }}</button>
  </nav>
</template>
