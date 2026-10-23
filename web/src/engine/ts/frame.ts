// windgap/core/grid.py + schema.py: series as Float64Array (NaN = missing) on one gap-free 10-minute grid.
import type { Grid } from '../contract'

export const STEP_MS = 600_000
export const STEP_H = 1 / 6

/** Columns sharing one grid starting at t0 (UTC epoch ms). */
export interface Frame {
  t0: number
  cols: Float64Array[]
}

/** Join grids on one gap-free grid spanning all of them. */
export function align(grids: Grid[]): Frame {
  for (const g of grids) {
    if (g.stepS !== 600) throw new Error(`stepS must be 600, got ${g.stepS}`)
    if (g.t0 % STEP_MS) throw new Error(`t0 ${g.t0} is not on the 10-minute grid`)
  }
  const t0 = Math.min(...grids.map((g) => g.t0))
  const end = Math.max(...grids.map((g) => g.t0 + (g.values.length - 1) * STEP_MS))
  const n = (end - t0) / STEP_MS + 1
  const cols = grids.map((g) => {
    const col = new Float64Array(n).fill(NaN)
    const offset = (g.t0 - t0) / STEP_MS
    g.values.forEach((v, i) => v !== null && (col[offset + i] = v))
    return col
  })
  return { t0, cols }
}

/** Rows [from, to) of every column; positions outside the frame are NaN (pandas reindex). */
export function rows(frame: Frame, from: number, to: number): Frame {
  return {
    t0: frame.t0 + from * STEP_MS,
    cols: frame.cols.map((c) => Float64Array.from({ length: to - from }, (_, i) => c[from + i] ?? NaN)),
  }
}

export function correlation(a: Float64Array, b: Float64Array): number {
  const [x, y] = pairs(a, b)
  if (x.length < 2) return NaN
  const mx = mean(x)
  const my = mean(y)
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < x.length; i++) {
    sxy += (x[i] - mx) * (y[i] - my)
    sxx += (x[i] - mx) ** 2
    syy += (y[i] - my) ** 2
  }
  return sxy / Math.sqrt(sxx * syy)
}

/** Rows where both are measured, in order (pandas dropna on the pair). */
export function pairs(a: Float64Array, b: Float64Array): [number[], number[]] {
  const x: number[] = []
  const y: number[] = []
  a.forEach((v, i) => !Number.isNaN(v) && !Number.isNaN(b[i]) && (x.push(v), y.push(b[i])))
  return [x, y]
}

export function sum(xs: ArrayLike<number>): number {
  let s = 0
  for (let i = 0; i < xs.length; i++) s += xs[i]
  return s
}
export const mean = (xs: ArrayLike<number>) => sum(xs) / xs.length
