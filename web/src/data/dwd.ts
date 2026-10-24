// DWD weather stations around the challenge farms (data/dwd_refs/, `make dwd-refs`), offered as extra references.
// Loaded on first use; they cover Jul–Sep 2026 only (SPEC.md, "Externe Daten").
import { parseWindCsv, type WindSeries } from './wind'

const files = import.meta.glob<string>('../../../data/dwd_refs/*.csv', { query: '?raw', import: 'default' })

export const loadStations = (): Promise<WindSeries[]> =>
  Promise.all(Object.entries(files).map(async ([path, load]) => parseWindCsv(path.split('/').pop()!.replace('.csv', ''), await load())[0]))
