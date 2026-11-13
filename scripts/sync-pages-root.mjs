import { readFileSync, writeFileSync, existsSync, cpSync, rmSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const repo = resolve(import.meta.dirname, '..')
const dist = resolve(repo, 'dist')
const htmlFile = resolve(dist, 'index.html')
const assetsDir = resolve(dist, 'assets')
const html = readFileSync(htmlFile, 'utf8')

if (!existsSync(assetsDir) ||
    !/\/(?:CAPITAL_IDLE)\/assets\/[^"']+\.js/.test(html) ||
    /src\/main\.ts/.test(html)) {
  throw new Error('Build Vite invalide : impossible de publier la source TypeScript depuis main/root')
}

// Ne toucher qu'aux fichiers statiques générés ; jamais src/, tests ni docs.
rmSync(resolve(repo, 'assets'), { recursive: true, force: true })
cpSync(assetsDir, resolve(repo, 'assets'), { recursive: true })
writeFileSync(resolve(repo, 'index.html'), html, 'utf8')
writeFileSync(resolve(repo, '.nojekyll'), '', 'utf8')

// Sous GitHub Pages "Deploy from a branch" → main / (root),
// le navigateur reçoit les fichiers statiques déjà compilés.
process.stdout.write('Site compilé copié dans main/root : index.html + assets/ + .nojekyll\n')
