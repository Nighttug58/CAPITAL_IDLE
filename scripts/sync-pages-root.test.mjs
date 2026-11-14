import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const original = readFileSync(new URL('./sync-pages-root.mjs', import.meta.url), 'utf8')
const compiledHtml = `<!doctype html><html><head><link rel="stylesheet" href="/CAPITAL_IDLE/assets/site.css"></head><body><div id="app"></div><script type="module" src="/CAPITAL_IDLE/assets/site.js"></script></body></html>`
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'capital-idle-publish-'))
  mkdirSync(join(root, 'scripts'))
  mkdirSync(join(root, 'assets'))
  mkdirSync(join(root, 'dist', 'assets'), { recursive: true })
  writeFileSync(join(root, 'scripts', 'sync-pages-root.mjs'), original)
  writeFileSync(join(root, 'index.html'), 'previous-live-index')
  writeFileSync(join(root, 'assets', 'previous.js'), 'previous-live-assets')
  const run = () => spawnSync(process.execPath, [join(root, 'scripts', 'sync-pages-root.mjs')], {
    encoding: 'utf8', cwd: root,
  })
  const cleanup = () => rmSync(root, { recursive: true, force: true })
  return { root, run, cleanup }
}
function seedBuild(root) {
  writeFileSync(join(root, 'dist', 'index.html'), compiledHtml)
  writeFileSync(join(root, 'dist', 'assets', 'site.js'), 'console.log("compiled")')
  writeFileSync(join(root, 'dist', 'assets', 'site.css'), 'body{}')
}

test('No dist: publish fails without changing live root files', () => {
  const { root, run, cleanup } = fixture()
  try {
    assert.notEqual(run().status, 0)
    assert.equal(readFileSync(join(root, 'index.html'), 'utf8'), 'previous-live-index')
    assert.equal(readFileSync(join(root, 'assets', 'previous.js'), 'utf8'), 'previous-live-assets')
  } finally { cleanup() }
})

test('Missing CSS reference: publish fails without replacing live assets', () => {
  const { root, run, cleanup } = fixture()
  try {
    seedBuild(root)
    rmSync(join(root, 'dist', 'assets', 'site.css'))
    assert.notEqual(run().status, 0)
    assert.equal(readFileSync(join(root, 'index.html'), 'utf8'), 'previous-live-index')
    assert.ok(existsSync(join(root, 'assets', 'previous.js')))
  } finally { cleanup() }
})

test('A source TypeScript entry never replaces the compiled home page', () => {
  const { root, run, cleanup } = fixture()
  try {
    seedBuild(root)
    writeFileSync(join(root, 'dist', 'index.html'), compiledHtml.replace('/CAPITAL_IDLE/assets/site.js', './src/main.ts'))
    assert.notEqual(run().status, 0)
    assert.equal(readFileSync(join(root, 'index.html'), 'utf8'), 'previous-live-index')
  } finally { cleanup() }
})

test('Valid compiled JS and CSS replace only static root assets', () => {
  const { root, run, cleanup } = fixture()
  try {
    seedBuild(root)
    const outcome = run()
    assert.equal(outcome.status, 0, outcome.stderr)
    assert.equal(readFileSync(join(root, 'index.html'), 'utf8'), compiledHtml)
    assert.ok(existsSync(join(root, 'assets', 'site.js')))
    assert.ok(existsSync(join(root, 'assets', 'site.css')))
    assert.ok(!existsSync(join(root, 'assets', 'previous.js')))
    assert.ok(existsSync(join(root, '.nojekyll')))
  } finally { cleanup() }
})
