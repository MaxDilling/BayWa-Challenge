// Screenshots of every GUI step for review: desktop, mobile, dark, an upload error, all demo files dropped at once,
// data that triggers plausibility warnings, the method sheet, the py engine and the PDF report (demo, dark, and the challenge
// data with three targets when data/data_hackathon_baywa_re/ is there).
// Usage (after make build): node web/scripts/screenshots.mjs [outDir]. Exits 1 on any console error.
// Without outDir each run gets the next screenshots/v<n> and a taken.json with every image's hash, so that
// scripts/annotated.mjs finds the images the team drew on later.
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const versions = existsSync(join(root, 'screenshots')) ? readdirSync(join(root, 'screenshots')).map((d) => Number(/^v(\d+)$/.exec(d)?.[1] ?? 0)) : []
const out = resolve(process.argv[2] ?? join(root, 'screenshots', `v${Math.max(0, ...versions) + 1}`))
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

/** The PDF report as the Export step downloads it. */
async function report(page, file) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download report (PDF)' }).click()])
  await download.saveAs(join(out, file))
  shots.push(file)
}

async function walk(name, page) {
  await page.getByRole('button', { name: 'Load demo data' }).click()
  await page.getByText('kWh lost').waitFor({ state: 'attached' })
  for (const [i, step] of STEPS.entries()) {
    await page.locator('nav[aria-label=Steps] button').nth(i).click()
    await shot(page, `${name}-${i + 1}-${step}.png`)
  }
  await report(page, `${name}-report.pdf`)
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
await empty.getByText('kWh lost').waitFor({ state: 'attached' })
await empty.locator('nav[aria-label=Steps] button').nth(3).click()
await shot(empty, 'upload-all-files-results.png')
await empty.close()

// Three days of target data before the outage and a power curve in MW under a kW header.
const scratch = mkdtempSync(join(tmpdir(), 'windgap-warnings-'))
const [target, reference, curve] = demo.map((f) => readFileSync(f, 'utf8'))
const [head, ...rows] = target.trim().split('\n')
writeFileSync(join(scratch, 'target.csv'), [head, ...rows.filter((r) => r >= '2026-10-24')].join('\n'))
writeFileSync(join(scratch, 'reference.csv'), reference)
writeFileSync(join(scratch, 'curve.csv'), curve.replace(/,([\d.]+)$/gm, (_, kw) => `,${kw / 1000}`))
const warned = await open('warnings', single, DESKTOP)
await warned.locator('input[type=file]').first().setInputFiles(['target.csv', 'reference.csv', 'curve.csv'].map((f) => join(scratch, f)))
await warned.getByText('kWh lost').waitFor({ state: 'attached' })
await shot(warned, 'warnings-1-upload.png')
await warned.locator('nav[aria-label=Steps] button').nth(3).click()
await shot(warned, 'warnings-4-results.png')
await warned.setViewportSize({ ...DESKTOP, height: 1500 })
await warned.getByRole('button', { name: 'How it works' }).click()
await shot(warned, 'how-it-works.png')
await warned.close()

// A second reference that does not track the target (the demo reference backwards in time): the Method step ranks both.
const [refHead, ...refRows] = reference.trim().split('\n')
const values = refRows.map((r) => r.split(',')[1]).reverse()
writeFileSync(join(scratch, 'far_away.csv'), [refHead, ...refRows.map((r, i) => `${r.split(',')[0]},${values[i]}`)].join('\n'))
const pool = await open('references', single, DESKTOP)
await pool.locator('input[type=file]').first().setInputFiles([...demo, join(scratch, 'far_away.csv')])
await pool.getByText('kWh lost').waitFor({ state: 'attached' })
await pool.locator('nav[aria-label=Steps] button').nth(2).click()
await shot(pool, 'references-3-method.png')
await pool.close()
rmSync(scratch, { recursive: true })

// All ten turbine files of the challenge with one power curve: T1–T3 become targets, the report has a page for each.
const challenge = join(root, 'data/data_hackathon_baywa_re')
if (existsSync(challenge)) {
  const page = await open('challenge', single, DESKTOP)
  const files = readdirSync(challenge).filter((f) => /_data\.xlsx$|^T1_power_curve\.xlsx$/.test(f))
  await page.locator('input[type=file]').first().setInputFiles(files.map((f) => join(challenge, f)))
  await page.getByText('kWh lost').waitFor({ state: 'attached', timeout: 60_000 })
  await page.locator('nav[aria-label=Steps] button').nth(4).click()
  await shot(page, 'challenge-5-export.png')
  await report(page, 'challenge-report.pdf')
  await page.close()
}

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
  await page.locator('nav[aria-label=Steps] button').nth(4).click()
  await report(page, 'py-report.pdf')
  await page.close()
} finally {
  server.kill()
}

await browser.close()
const hash = (file) => createHash('sha256').update(readFileSync(join(out, file))).digest('hex')
writeFileSync(join(out, 'taken.json'), JSON.stringify({ taken: new Date().toISOString(), sha256: Object.fromEntries(shots.map((f) => [f, hash(f)])) }, null, 2) + '\n')
console.log(`${shots.length} screenshots in ${out}`)
if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
