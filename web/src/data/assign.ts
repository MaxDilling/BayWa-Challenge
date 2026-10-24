import { ImportError, readTable } from './csv'
import { detectOutages } from './outage'
import { powerCurve, turbineCount, type PowerCurve } from './powerCurve'
import { timeColumns, windSeries, type WindSeries } from './wind'

export interface Assignment {
  /** Every wind column of every file, in drop order. */
  series: WindSeries[]
  /** The file each series came from, by series id. */
  fileOf: Record<string, string>
  /** Ids of series with an outage against all others, longest outage first. */
  targetCandidates: string[]
  /** Candidates whose longest outage is more than half the first's; a target is never a reference. */
  targets: string[]
  /** Every file without timestamps; `turbines` is a count stated in its name or first lines. */
  curves: { file: string; curve: PowerCurve; turbines?: number }[]
  /** Files that could not be read or assigned; the other files are assigned anyway. */
  errors: { file: string; message: string }[]
}

/** Sorts files dropped together into power curves, wind series and target candidates (SPEC.md S1). */
export function assignFiles(files: { name: string; text: string }[]): Assignment {
  const series: WindSeries[] = []
  const fileOf: Record<string, string> = {}
  const curves: Assignment['curves'] = []
  const errors: Assignment['errors'] = []
  for (const { name, text } of files) {
    try {
      const table = readTable(text)
      if (!timeColumns(table.rows[0].cells)) curves.push({ file: name, curve: powerCurve(table), turbines: turbineCount(name, text) })
      else {
        const found = windSeries(name.replace(/\.[^.]+$/, ''), table)
        const clash = found.find((s) => series.some((x) => x.id === s.id))
        if (clash) throw new ImportError(`Two series are called "${clash.id}".`)
        series.push(...found)
        for (const s of found) fileOf[s.id] = name
      }
    } catch (e) {
      if (!(e instanceof ImportError)) throw e
      errors.push({ file: name, message: e.message })
    }
  }

  const longest = new Map(
    series.map((s) => {
      const [outage] = detectOutages(s.grid, series.filter((o) => o !== s).map((o) => o.grid)).outages
      return [s.id, outage ? outage.endMs - outage.startMs : 0]
    }),
  )
  const targetCandidates = series.filter((s) => longest.get(s.id)! > 0).sort((a, b) => longest.get(b.id)! - longest.get(a.id)!).map((s) => s.id)
  const first = longest.get(targetCandidates[0]) ?? 0
  return {
    series,
    fileOf,
    targetCandidates,
    targets: targetCandidates.filter((id) => longest.get(id)! * 2 > first),
    curves,
    errors,
  }
}
