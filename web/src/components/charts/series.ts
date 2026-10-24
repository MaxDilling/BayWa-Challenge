import type { Grid } from '@/engine'
import { fmtDayTime, STEP_MS } from '@/components/format'

/** [time, value] pairs of a grid within [fromMs, toMs); null stays null so lines break at gaps. */
export function gridPoints(grid: Grid, fromMs = grid.t0, toMs = grid.t0 + grid.values.length * STEP_MS): [number, number | null][] {
  const first = Math.max(0, Math.ceil((fromMs - grid.t0) / STEP_MS))
  const last = Math.min(grid.values.length, Math.ceil((toMs - grid.t0) / STEP_MS))
  return grid.values.slice(first, last).map((v, i) => [grid.t0 + (first + i) * STEP_MS, v])
}

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)

/** Tooltip body in the app's typography; rows without a value are left out. */
export function tooltipHtml(timeMs: number, rows: { color: string; name: string; value?: string }[]) {
  const body = rows
    .filter((r) => r.value !== undefined)
    .map(
      (r) =>
        `<div class="flex items-center gap-2"><span class="size-2 rounded-full" style="background:${r.color}"></span>` +
        `<span class="text-muted-foreground">${escape(r.name)}</span><span class="ml-auto pl-4 font-medium tabular-nums">${r.value}</span></div>`,
    )
    .join('')
  return `<div class="text-label"><div class="mb-1 font-medium">${fmtDayTime(timeMs)}</div>${body}</div>`
}

/** The axis tooltip's points by series id. */
type AxisParams = { seriesId: string; value: [number, number | null]; axisValue: number }[]
export const byId = (params: unknown) => new Map((params as AxisParams).map((p) => [p.seriesId, p.value[1]]))

/** Line style of the i-th series of one kind, e.g. each target under Total. */
export const dash = (i: number) => (['solid', 'dashed', 'dotted'] as const)[i % 3]
