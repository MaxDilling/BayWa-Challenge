import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { analyze } from '@/engine/ts/tsEngine'
import { assignFiles, buildDataset, loadDemo, parsePowerCurveCsv, parseWindCsv, toRequest } from '.'
import { isSummerTime } from './berlin'
import { detectOutages } from './outage'

const dir = new URL('../../../fixtures/csv/', import.meta.url)
const cases = readdirSync(dir)
  .filter((f) => f.endsWith('.csv'))
  .map((f) => ({
    name: f.replace('.csv', ''),
    csv: readFileSync(new URL(f, dir), 'utf8'),
    expected: JSON.parse(readFileSync(new URL(f.replace('.csv', '.expected.json'), dir), 'utf8')),
  }))

describe.each(cases)('fixtures/csv/$name', ({ name, csv, expected }) => {
  it('parses as expected', () => {
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

describe('outage detection', () => {
  it('separates outages (≥ 30 min) from measurement gaps and ignores runs without reference data', () => {
    const target = grid([1, null, 1, null, null, null, 1, null, null, null, null, 1])
    const ref = grid([1, 1, 1, 1, 1, 1, 1, null, null, null, null, 1])
    const { outages, gaps } = detectOutages(target, [ref])
    expect(outages).toEqual([{ startMs: T0 + 3 * 600_000, endMs: T0 + 6 * 600_000 }])
    expect(gaps).toEqual([{ startMs: T0 + 600_000, endMs: T0 + 2 * 600_000 }])
  })

  it('finds an outage running to the end of the reference data', () => {
    const { outages } = detectOutages(grid([1, 1]), [grid([1, 1, 1, 1, 1])])
    expect(outages).toEqual([{ startMs: T0 + 2 * 600_000, endMs: T0 + 5 * 600_000 }])
  })

  it('finds an outage before a target file starts', () => {
    const { outages } = detectOutages(grid([1, 1], T0 + 3 * 600_000), [grid([1, 1, 1, 1, 1])])
    expect(outages).toEqual([{ startMs: T0, endMs: T0 + 3 * 600_000 }])
  })
})

describe('power curve', () => {
  it('reads kW, converts MW and rejects unsorted wind speeds', () => {
    expect(parsePowerCurveCsv('wind_speed_ms;power_kw\n3;0\n12,5;3000')).toEqual({ windMs: [3, 12.5], powerKw: [0, 3000] })
    expect(parsePowerCurveCsv('v,P (MW)\n3,0\n12,3').powerKw).toEqual([0, 3000])
    expect(() => parsePowerCurveCsv('v,p\n5,0\n4,1')).toThrow('must increase')
  })
})

describe('request building', () => {
  const curve = { windMs: [3, 12], powerKw: [0, 3000] }
  const outage = { startMs: T0 + 2 * 600_000, endMs: T0 + 5 * 600_000 }

  it('bridges short reference gaps during the outage linearly', () => {
    const dataset = buildDataset(series([1, 1, null, null, null, 1]), [series([2, 2, 3, null, 5, 6])], curve)
    expect(toRequest(dataset, outage, 'identity').references[0].grid.values).toEqual([2, 2, 3, 4, 5, 6])
  })

  it('refuses references that end before the outage does', () => {
    const dataset = buildDataset(series([1, 1, null, null, null, 1]), [series([2, 2, 3])], curve)
    expect(() => toRequest(dataset, outage, 'identity')).toThrow('does not cover the whole outage')
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
    expect(a.powerCurve).toEqual({ windMs: [3, 12], powerKw: [0, 3000] })
    expect(a.errors).toEqual([])
  })

  it('splits a file with several turbines and ranks candidates by their longest outage', () => {
    const text = 'Timestamp;WTG01;WTG02;Temperature\n' + ['5;5;9', '-;5;9', '-;-;9', '-;-;9', '-;-;9', '5;-;9', '5;-;9', '5;5;9']
      .map((r, i) => `${new Date(T0 + i * 600_000).toISOString()};${r}`).join('\n')
    const a = assignFiles([{ name: 'park.csv', text }, file('ref', [1, 1, 1, 1, 1, 1, 1, 1])])
    expect(a.series.map((s) => s.id)).toEqual(['WTG01', 'WTG02', 'ref'])
    expect(a.targetCandidates).toEqual(['WTG02', 'WTG01'])
    expect(a.powerCurve).toBeUndefined()
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
