import { ImportError, readTable } from './csv'
import { detectOutages } from './outage'
import { powerCurve, type PowerCurve } from './powerCurve'
import { timeColumns, windSeries, type WindSeries } from './wind'

export interface Assignment {
  /** Every wind column of every file, in drop order. */
  series: WindSeries[]
  /** Ids of series with an outage against all others, longest outage first. Exactly one: the target. */
  targetCandidates: string[]
  /** Set when exactly one file has no timestamps. */
  powerCurve?: PowerCurve
  /** Files that could not be read or assigned; the other files are assigned anyway. */
  errors: { file: string; message: string }[]
}

/** Sorts files dropped together into power curve, wind series and target candidates (SPEC.md S1). */
export function assignFiles(files: { name: string; text: string }[]): Assignment {
  const series: WindSeries[] = []
  const curves: { file: string; curve: PowerCurve }[] = []
  const errors: Assignment['errors'] = []
  for (const { name, text } of files) {
    try {
      const table = readTable(text)
      if (!timeColumns(table.rows[0].cells)) curves.push({ file: name, curve: powerCurve(table) })
      else {
        const found = windSeries(name.replace(/\.[^.]+$/, ''), table)
        const clash = found.find((s) => series.some((x) => x.id === s.id))
        if (clash) throw new ImportError(`Two series are called "${clash.id}".`)
        series.push(...found)
      }
    } catch (e) {
      if (!(e instanceof ImportError)) throw e
      errors.push({ file: name, message: e.message })
    }
  }
  if (curves.length > 1)
    errors.push({ file: curves.map((c) => c.file).join(', '), message: 'Several files look like power curves; drop only one.' })

  const longest = new Map(
    series.map((s) => {
      const [outage] = detectOutages(s.grid, series.filter((o) => o !== s).map((o) => o.grid)).outages
      return [s.id, outage ? outage.endMs - outage.startMs : 0]
    }),
  )
  return {
    series,
    targetCandidates: series.filter((s) => longest.get(s.id)! > 0).sort((a, b) => longest.get(b.id)! - longest.get(a.id)!).map((s) => s.id),
    powerCurve: curves.length === 1 ? curves[0].curve : undefined,
    errors,
  }
}
