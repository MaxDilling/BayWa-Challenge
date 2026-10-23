import type { Grid } from '@/engine'
import { STEP_MS } from '@/engine/ts/frame'
import { isSummerTime } from './berlin'

export const FILLED_HEADER = 'Timestamp,Wind speed (m/s),Predicted'

/**
 * The target grid in the challenge format, with the predicted mean (3 decimals) where the target is missing during a
 * prediction; `Predicted` is 1 on those rows. Rows span the target and every prediction, times are Europe/Berlin as in
 * the input, measured values unchanged, still missing values NaN. Twin of filled_target_csv in windgap/core/io.py.
 */
export function filledTargetCsv(target: Grid, predictions: { t0: number; mean: number[] }[]): string {
  const spans = [[target.t0, target.values.length], ...predictions.map((p) => [p.t0, p.mean.length])]
  const t0 = Math.min(...spans.map(([start]) => start))
  const values: (number | null)[] = Array((Math.max(...spans.map(([start, n]) => start + n * STEP_MS)) - t0) / STEP_MS).fill(null)
  const predicted = values.map(() => false)
  target.values.forEach((v, i) => (values[(target.t0 - t0) / STEP_MS + i] = v))
  for (const p of predictions)
    p.mean.forEach((mean, i) => {
      const k = (p.t0 - t0) / STEP_MS + i
      if (values[k] === null) [values[k], predicted[k]] = [mean, true]
    })
  const lines = values.map((v, k) => {
    const utc = t0 + k * STEP_MS
    const local = new Date(utc + (isSummerTime(utc) ? 2 : 1) * 3_600_000).toISOString().slice(0, 16).replace('T', ' ')
    return `${local},${v === null ? 'NaN' : predicted[k] ? v.toFixed(3) : String(v)},${Number(predicted[k])}`
  })
  return [FILLED_HEADER, ...lines].join('\n') + '\n'
}
