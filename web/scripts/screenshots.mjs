// Screenshots of every GUI step for review: desktop, mobile, dark, an upload error, all demo files dropped at once and the py engine.
// Usage (after make build): node web/scripts/screenshots.mjs [outDir]. Exits 1 on any console error.
import { spawn } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const out = resolve(process.argv[2] ?? join(root, 'screenshots'))
const single = pathToFileURL(join(root, 'dist/windgap.html')).href
const PORT = 8137
const STEPS = ['upload', 'outage', 'method', 'results', 'export']
const DESKTOP = { width: 1440, height: 900 }
const MOBILE = { width: 390, height: 844 }
/** ECharts animates for about one second after each render. */
const SETTLE_MS = 1200

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
const browser = await chromium.launch()
const problems = []
const shots = []

async function open(name, url, viewport) {
  const page = await browser.newPage({ viewport })
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && problems.push(`${name}: [${m.type()}] ${m.text()}`))
  page.on('pageerror', (e) => problems.push(`${name}: ${e.message}`))
  await page.goto(url)
  return page
}

async function shot(page, file) {
  await page.waitForTimeout(SETTLE_MS)
  await page.screenshot({ path: join(out, file), fullPage: true })
  shots.push(file)
}

async function walk(name, page) {
  await page.getByRole('button', { name: 'Load demo data' }).click()
  await page.getByText('kWh lost').waitFor({ state: 'attached' })
  for (const [i, step] of STEPS.entries()) {
    await page.locator('nav[aria-label=Steps] button').nth(i).click()
    await shot(page, `${name}-${i + 1}-${step}.png`)
  }
}

async function variant(name, url, viewport, prepare = async () => {}) {
  const page = await open(name, url, viewport)
  await prepare(page)
  await walk(name, page)
  await page.close()
}

const empty = await open('empty', single, DESKTOP)
await shot(empty, 'empty.png')
await empty.locator('input[type=file]').first().setInputFiles(join(root, 'fixtures/csv/spring_nonexistent.csv'))
await shot(empty, 'upload-error.png')
const demo = ['target', 'reference', 'power_curve'].map((f) => join(root, `data/synthetic/demo_${f}.csv`))
await empty.locator('input[type=file]').first().setInputFiles(demo)
await empty.getByText('kWh lost').waitFor({ state: 'attached' })
await shot(empty, 'upload-all-files.png')
await empty.close()

await variant('desktop', single, DESKTOP)
await variant('mobile', single, MOBILE)
await variant('dark', single, DESKTOP, (page) => page.getByRole('button', { name: 'Dark mode' }).click())

async function listening(url) {
  for (let i = 0; i < 50; i++) {
    if (await fetch(url).then((r) => r.ok, () => false)) return
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`${url} did not come up`)
}

const server = spawn('python3', ['-m', 'http.server', String(PORT), '-d', join(root, 'dist/windgap-web')], { stdio: 'ignore' })
try {
  await listening(`http://localhost:${PORT}/`)
  const page = await open('py', `http://localhost:${PORT}/?engine=py`, DESKTOP)
  await page.getByRole('button', { name: 'Load demo data' }).click()
  await page.screenshot({ path: join(out, 'py-loading.png'), fullPage: true })
  shots.push('py-loading.png')
  await page.getByText('kWh lost').waitFor({ state: 'attached', timeout: 60_000 })
  await page.locator('nav[aria-label=Steps] button').nth(3).click()
  await shot(page, 'py-4-results.png')
  await page.close()
} finally {
  server.kill()
}

await browser.close()
console.log(`${shots.length} screenshots in ${out}`)
if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
