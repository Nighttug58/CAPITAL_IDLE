import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

// Les tests sont résolus depuis le dépôt, indépendamment de la racine Vite src/.
export default defineConfig({
  plugins: [vue()],
  test: {
    include: ['src/**/*.test.ts'],
  },
})
