import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// L'HTML de développement vit dans src/ ; l'index.html à la racine
// du dépôt est exclusivement l'artefact compilé publié par Pages.
export default defineConfig({
  plugins: [vue()],
  root: 'src',
  base: '/CAPITAL_IDLE/',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
})
