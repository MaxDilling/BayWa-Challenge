import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { analyze } from '@/engine/ts/tsEngine'
import { assignFiles, buildDataset, filledTargetCsv, loadDemo, parsePowerCurveCsv, parseWindCsv, plausibility, toRequest, turbineCount } from '.'
import { isSummerTime } from './berlin'
import { detectOutages } from './outage'
import { xlsxTexts } from './xlsx'

const dir = new URL('../../../fixtures/csv/', import.meta.url)
const cases = readdirSync(dir)
  .filter((f) => /\.(csv|xlsx)$/.test(f))
  .map((f) => ({
    file: f,
    name: f.replace(/\.\w+$/, ''),
    expected: JSON.parse(readFileSync(new URL(f.replace(/\.\w+$/, '.expected.json'), dir), 'utf8')),
  }))

describe.each(cases)('fixtures/csv/$file', ({ file, name, expected }) => {
  it('parses as expected', async () => {
    const bytes = readFileSync(new URL(file, dir))
    const [[, csv]] = file.endsWith('.xlsx') ? await xlsxTexts(name, new Uint8Array(bytes).buffer) : [[name, bytes.toString('utf8')]]
    const parse = () => (name.startsWith('curve_') ? parsePowerCurveCsv(csv) : parseWindCsv(name, csv))
    if (expected.error) return expect(parse).toThrow(expected.error)
    expect(parse()).toEqual(expected)
  })
})

const T0 = Date.UTC(2026, 9, 1)
const grid = (values: (number | null)[], t0 = T0) => ({ t0, stepS: 600 as const, values })
const csv = (values: (number | null)[], t0 = T0) =>
  'time,wind\n' + values.map((v, i) => `${new Date(t0 + i * 600_000).toISOString()},${v ?? 'NaN'}`).join('\n')
const series = (values: (number | null)[]) => parseWindCsv('s', csv(values))[0]

const outageCases = JSON.parse(readFileSync(new URL('../../../fixtures/outage/cases.json', import.meta.url), 'utf8'))

describe.each(outageCases.detect)('fixtures/outage detect: $name', ({ target, references, outages, gaps }) => {
  it('matches', () => expect(detectOutages(target, references)).toEqual({ outages, gaps }))
})

describe.each(outageCases.fill)('fixtures/outage fill: $name', ({ reference, outage, values, error }) => {
  it('matches', () => {
    const dataset = buildDataset({ ...series([1]), id: 'target' }, [{ ...series([1]), id: 'ref', grid: reference }], { windMs: [3, 12], powerKw: [0, 3000] })
    const fill = () => toRequest(dataset, outage, 'identity').references[0].grid.values
    if (error) expect(fill).toThrow(error)
    else expect(fill()).toEqual(values)
  })
})

describe('power curve', () => {
  it('reads kW, converts MW and rejects unsorted wind speeds', () => {
    expect(parsePowerCurveCsv('wind_speed_ms;power_kw\n3;0\n12,5;3000')).toEqual({ windMs: [3, 12.5], powerKw: [0, 3000] })
    expect(parsePowerCurveCsv('v,P (MW)\n3,0\n12,3').powerKw).toEqual([0, 3000])
    expect(() => parsePowerCurveCsv('v,p\n5,0\n4,1')).toThrow('must increase')
  })

  it('reads a turbine count from the file name or the first lines, never from an id like WTG01', () => {
    expect(turbineCount('curve_4x3MW', 'v;p\n3;0')).toBe(4)
    expect(turbineCount('farm_12_turbines', 'v;p\n3;0')).toBe(12)
    expect(turbineCount('curve', 'Number of turbines: 5\nv;p\n3;0')).toBe(5)
    expect(turbineCount('WTG01_curve', 'v;p\n3;0\n12;3000')).toBeUndefined()
  })
})

describe('demo data', () => {
  it('flows from CSV through outage detection into the ts engine', () => {
    const dataset = loadDemo()
    expect(dataset.outages[0]).toEqual({ startMs: Date.UTC(2026, 9, 27, 7), endMs: Date.UTC(2026, 9, 28, 13) })
    const response = analyze(toRequest(dataset, dataset.outages[0], 'identity'))
    expect(response.prediction.mean).toHaveLength(180)
    expect(response.energy.kwhP50).toBeGreaterThan(0)
  })

  it('exports the filled target exactly as harness.predict writes it (fixtures/predict/demo.csv)', () => {
    const dataset = loadDemo()
    const { prediction } = analyze(toRequest(dataset, dataset.outages[0], 'linear_regression'))
    const expected = readFileSync(new URL('../../../fixtures/predict/demo.csv', import.meta.url), 'utf8')
    expect(filledTargetCsv(dataset.target.grid, [prediction])).toBe(expected)
  })
})

describe('large files', () => {
  it('reads one year of 10-minute Berlin time in well under a second', () => {
    const start = Date.UTC(2025, 11, 31, 23)
    const rows = Array.from({ length: 52_560 }, (_, i) => {
      const utc = start + i * 600_000
      const local = new Date(utc + (isSummerTime(utc) ? 2 : 1) * 3_600_000).toISOString().slice(0, 19).replace('T', ' ')
      return `${local};${((i % 250) / 10).toFixed(1).replace('.', ',')}`
    })
    const text = 'Timestamp;Wind speed (m/s)\n' + rows.join('\n')
    const started = performance.now()
    const [year] = parseWindCsv('year', text)
    const ms = performance.now() - started
    expect(year.grid.t0).toBe(start)
    expect(year.report.missing).toBe(0)
    expect(ms).toBeLessThan(500)
  })
})

describe('file assignment', () => {
  const file = (name: string, values: (number | null)[], t0 = T0) => ({ name, text: csv(values, t0) })
  const curve = { name: 'curve.csv', text: 'wind_speed_ms;power_kw\n3;0\n12;3000' }

  it('finds the power curve and the target with the outage', () => {
    const a = assignFiles([file('ref.csv', [1, 1, 1, 1, 1, 1]), curve, file('target.csv', [1, null, null, null, 1, 1])])
    expect(a.series.map((s) => s.id)).toEqual(['ref', 'target'])
    expect(a.targetCandidates).toEqual(['target'])
    expect(a.targets).toEqual(['target'])
    expect(a.powerCurve).toEqual({ windMs: [3, 12], powerKw: [0, 3000] })
    expect(a.errors).toEqual([])
  })

  it('splits a file with several turbines and takes every outage of comparable length as a target', () => {
    const text = 'Timestamp;WTG01;WTG02;Temperature\n' + ['5;5;9', '-;5;9', '-;-;9', '-;-;9', '-;-;9', '5;-;9', '5;-;9', '5;5;9']
      .map((r, i) => `${new Date(T0 + i * 600_000).toISOString()};${r}`).join('\n')
    const a = assignFiles([{ name: 'park.csv', text }, file('ref', [1, 1, 1, 1, 1, 1, 1, 1])])
    expect(a.series.map((s) => s.id)).toEqual(['WTG01', 'WTG02', 'ref'])
    expect(a.targetCandidates).toEqual(['WTG02', 'WTG01'])
    expect(a.targets).toEqual(['WTG02', 'WTG01'])
    expect(a.powerCurve).toBeUndefined()
  })

  it('leaves a series whose longest outage is at most half the longest as a reference', () => {
    const a = assignFiles([file('ref', [1, 1, 1, 1, 1, 1, 1, null, null, null]), file('target', [1, null, null, null, null, null, null, 1, 1, 1])])
    expect(a.targetCandidates).toEqual(['target', 'ref'])
    expect(a.targets).toEqual(['target'])
  })

  it('treats a target file that ends early as having an outage', () => {
    expect(assignFiles([file('target', [1, 1]), file('ref', [1, 1, 1, 1, 1])]).targetCandidates).toEqual(['target'])
  })

  it('reports unreadable files, clashing ids and several power curves without dropping the rest', () => {
    const a = assignFiles([file('a', [1, 1]), file('a.txt', [1, 1]), { name: 'bad.csv', text: 'x;y\nfoo;bar' }, curve, { ...curve, name: 'c2.csv' }])
    expect(a.series.map((s) => s.id)).toEqual(['a'])
    expect(a.errors.map((e) => e.file)).toEqual(['a.txt', 'bad.csv', 'curve.csv, c2.csv'])
    expect(a.powerCurve).toBeUndefined()
  })
})

describe('plausibility', () => {
  const outage = { startMs: T0 + 2 * 600_000, endMs: T0 + 5 * 600_000 }
  const titles = (...args: Parameters<typeof plausibility>) => plausibility(...args).map((w) => w.title)

  it('has nothing to say about the demo', () => {
    const demo = loadDemo()
    expect(plausibility(demo, demo.outages[0], 0.9)).toEqual([])
  })

  it('flags units, copies, low correlation, bridged gaps, short training and an open end', () => {
    const target = series([1, 2, null, null, null])
    const dataset = buildDataset(target, [{ ...series([1, 2, 3, null, 5]), id: 'ref' }], { windMs: [3, 12], powerKw: [0, 3] })
    expect(titles(dataset, outage, 0.5)).toEqual([
      'Unusual rated power',
      'Target and ref are identical',
      'Low correlation r = 0.50',
      '1 reference value bridged',
      'Little data before the outage',
      'The outage runs to the end of the target data',
    ])
  })
})
