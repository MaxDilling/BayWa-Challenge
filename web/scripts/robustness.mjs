// Realistic uploads through the all-files zone, on both engines: a DWD pair with 24 h blanked, German-format files,
// a reference farm exported as one CSV with several turbines, and one year of 10-minute data. Fails on console errors,
// on an analysis error or NaN on the page; prints the time from the drop to the assignment, and from there
// to the result and to the full method comparison. Usage (after make build and make dwd): node web/scripts/robustness.mjs [outDir]
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const out = resolve(process.argv[2] ?? join(root, 'screenshots/robustness'))
const PORT = 8138
const STEP = 600_000
const scratch = mkdtempSync(join(tmpdir(), 'windgap-robustness-'))
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

const write = (name, text) => (writeFileSync(join(scratch, name), text), join(scratch, name))
const rows = (csv) => csv.trim().split('\n')
const demo = (f) => readFileSync(join(root, `data/synthetic/demo_${f}.csv`), 'utf8')

const lastSunday = (year, month) => {
  const last = new Date(Date.UTC(year, month + 1, 0))
  return Date.UTC(year, month, last.getUTCDate() - last.getUTCDay(), 1)
}
const summer = (utc) => {
  const y = new Date(utc).getUTCFullYear()
  return utc >= lastSunday(y, 2) && utc < lastSunday(y, 9)
}
const berlin = (utc) => new Date(utc + (summer(utc) ? 2 : 1) * 3_600_000).toISOString().slice(0, 16).replace('T', ' ')

function dwdPair() {
  const dir = join(root, 'data/dwd/bremen-brake')
  if (!existsSync(dir)) throw new Error('data/dwd/ is empty: run make dwd first')
  const [head, ...target] = rows(readFileSync(join(dir, 'target.csv'), 'utf8'))
  const blanked = target.map((r, i) => (i >= 3000 && i < 3144 ? `${r.split(',')[0]},NaN` : r))
  return [
    write('bremen.csv', [head, ...blanked].join('\n')),
    write('brake.csv', readFileSync(join(dir, 'reference.csv'), 'utf8')),
    write('dwd_curve.csv', readFileSync(join(dir, 'power_curve.csv'), 'utf8')),
  ]
}

function german() {
  const convert = (csv) =>
    ['Datum;Uhrzeit;Windgeschwindigkeit [m/s]']
      .concat(
        rows(csv)
          .slice(1)
          .map((r) => {
            const [t, v] = r.split(',')
            return `${t.slice(8, 10)}.${t.slice(5, 7)}.${t.slice(0, 4)};${t.slice(11)};${v === 'NaN' ? '' : v.replace('.', ',')}`
          }),
      )
      .join('\r\n')
  return [
    write('ziel.csv', convert(demo('target'))),
    write('referenz.csv', convert(demo('reference'))),
    write('leistungskurve_4x3MW.csv', 'Windgeschwindigkeit [m/s];Leistung [kW]\n' + rows(demo('power_curve')).slice(1).map((r) => r.replace(',', ';').replace('.', ',')).join('\n')),
  ]
}

function multiColumn() {
  const ref = rows(demo('reference')).slice(1).map((r) => r.split(','))
  const farm = ref.map(([t, v], i) => [t, v, (v * 1.04 + 0.3 * Math.sin(i / 7)).toFixed(2), (v * 0.93 + 0.4 * Math.cos(i / 5)).toFixed(2), '180'])
  return [
    write('target.csv', demo('target')),
    write('neighbour_farm.csv', ['Timestamp,WTG01,WTG02,WTG03,Wind direction'].concat(farm.map((r) => r.join(','))).join('\n')),
    write('curve.csv', demo('power_curve')),
  ]
}

function year() {
  const start = Date.UTC(2025, 9, 31, 23)
  const n = 52_560
  let a = 0
  const ref = Float64Array.from({ length: n }, (_, i) => {
    a = 0.98 * a + 0.4 * Math.sin(i * 12.9898) * Math.cos(i * 78.233)
    return Math.max(0, 7 + 3 * Math.sin((2 * Math.PI * i) / 720) + 2 * Math.sin((2 * Math.PI * i) / 144) + 4 * a)
  })
  const outage = (i) => i >= 40_000 && i < 40_288
  const line = (i, v) => `${berlin(start + i * STEP)},${v}`
  return [
    write('year_target.csv', ['Timestamp,Wind speed (m/s)', ...Array.from(ref, (v, i) => line(i, outage(i) ? 'NaN' : (0.9 * (ref[i - 2] ?? v) + 0.6).toFixed(2)))].join('\n')),
    write('year_reference.csv', ['Timestamp,Wind speed (m/s)', ...Array.from(ref, (v, i) => line(i, v.toFixed(2)))].join('\n')),
    write('year_curve.csv', demo('power_curve')),
  ]
}

const SCENARIOS = { dwd: dwdPair(), german: german(), multicolumn: multiColumn(), year: year() }
const browser = await chromium.launch()
const problems = []
const timings = []

async function run(engine, url) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && problems.push(`${engine}: [${m.type()}] ${m.text()}`))
  page.on('pageerror', (e) => problems.push(`${engine}: ${e.message}`))
  await page.goto(url)
  await page.getByRole('button', { name: 'Load demo data' }).click()
  await page.getByText('kWh lost').waitFor({ state: 'attached', timeout: 60_000 })
  const step = (i) => page.locator('nav[aria-label=Steps] button').nth(i).click()
  for (const [name, files] of Object.entries(SCENARIOS)) {
    try {
      await scenario(page, name, files)
    } catch (e) {
      problems.push(`${engine} ${name}: ${e.message.split('\n')[0]}`)
      await page.screenshot({ path: join(out, `${engine}-${name}-failed.png`), fullPage: true })
    }
  }

  async function scenario(page, name, files) {
    await step(0)
    const dropped = Date.now()
    await page.locator('input[type=file]').first().setInputFiles(files)
    await page.getByRole('button', { name: /^Make (target|reference)$/ }).first().waitFor()
    const imported = Date.now() - dropped
    const started = Date.now()
    await page.getByText('kWh lost').waitFor({ state: 'attached', timeout: 30_000 })
    const result = Date.now() - started
    await step(2)
    await page.waitForFunction(() => ![...document.querySelectorAll('td')].some((td) => td.textContent === '…'), null, { timeout: 60_000 })
    const all = Date.now() - started
    await step(3)
    await page.waitForTimeout(1200)
    await page.screenshot({ path: join(out, `${engine}-${name}.png`), fullPage: true })
    const text = await page.locator('main').innerText()
    if (/NaN|could not run/.test(text)) problems.push(`${engine} ${name}: NaN or an analysis error on the results page`)
    timings.push({ engine, scenario: name, 'import ms': imported, 'result ms': result, 'all methods ms': all })
  }
  await page.close()
}

const server = spawn('python3', ['-m', 'http.server', String(PORT), '-d', join(root, 'dist/windgap-web')], { stdio: 'ignore' })
try {
  for (let i = 0; i < 50 && !(await fetch(`http://localhost:${PORT}/`).then((r) => r.ok, () => false)); i++) await new Promise((r) => setTimeout(r, 100))
  await run('ts', pathToFileURL(join(root, 'dist/windgap.html')).href)
  await run('py', `http://localhost:${PORT}/?engine=py`)
} finally {
  server.kill()
  await browser.close()
  rmSync(scratch, { recursive: true })
}
console.table(timings)
if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
