import type { Grid } from '@/engine'
import { align, STEP_MS } from '@/engine/ts/frame'

export interface Span {
  startMs: number
  /** exclusive */
  endMs: number
}

const MIN_OUTAGE_STEPS = 3

/**
 * Runs of missing target values while a reference is measuring. Runs of ≥ 3 steps (30 min) are outages,
 * shorter ones measurement gaps. Outages are sorted longest first, those before the first target value last,
 * because there is nothing to learn from. windgap/core/outage.py is the Python twin.
 */
export function detectOutages(target: Grid, references: Grid[]): { outages: Span[]; gaps: Span[] } {
  const { t0, cols } = align([target, ...references])
  const [tgt, ...refs] = cols
  const runs: Span[] = []
  let start = -1
  for (let i = 0; i <= tgt.length; i++) {
    const missing = i < tgt.length && Number.isNaN(tgt[i])
    if (missing && start < 0) start = i
    if (!missing && start >= 0) {
      if (refs.some((r) => r.subarray(start, i).some((v) => !Number.isNaN(v))))
        runs.push({ startMs: t0 + start * STEP_MS, endMs: t0 + i * STEP_MS })
      start = -1
    }
  }
  const steps = (s: Span) => (s.endMs - s.startMs) / STEP_MS
  const firstValue = t0 + tgt.findIndex((v) => !Number.isNaN(v)) * STEP_MS
  const leading = (s: Span) => Number(s.startMs < firstValue)
  return {
    outages: runs.filter((s) => steps(s) >= MIN_OUTAGE_STEPS).sort((a, b) => leading(a) - leading(b) || steps(b) - steps(a)),
    gaps: runs.filter((s) => steps(s) < MIN_OUTAGE_STEPS),
  }
}
