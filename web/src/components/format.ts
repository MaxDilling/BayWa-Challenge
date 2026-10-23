// Display formatting: times in Europe/Berlin, numbers in en-US with a unit.
import { berlinCandidates } from '@/data/berlin'
import type { Span } from '@/data'
import { STEP_MS } from '@/engine/ts/frame'

export { STEP_MS }
export const HOUR = 3_600_000
const TZ = 'Europe/Berlin'

const dateTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})
const dayTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})
const date = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' })
const time = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
const day = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'short' })
const parts = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZoneName: 'longOffset',
})

export const fmtDateTime = (ms: number) => dateTime.format(ms)
export const fmtDate = (ms: number) => date.format(ms)
export const fmtDayTime = (ms: number) => dayTime.format(ms)
export const fmtSpan = (s: Span) => `${fmtDateTime(s.startMs)} – ${fmtDateTime(s.endMs)}`

/** Axis labels: the time, and the date at midnight. */
export const fmtAxisTime = (ms: number) => {
  const t = time.format(ms)
  return t === '00:00' ? day.format(ms) : t
}

export function fmtDuration(ms: number) {
  const h = Math.floor(ms / HOUR)
  const min = Math.round((ms % HOUR) / 60_000)
  const d = Math.floor(h / 24)
  if (d >= 2) return `${d} d ${h % 24} h`
  return min ? `${h} h ${min} min` : `${h} h`
}

export const fmtNum = (v: number, digits = 0) => v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })

/** Energy and power: whole numbers from 100 on, below that 3 significant digits, so a small farm never reads "0 kW". */
export const fmtAmount = (v: number) => (Math.abs(v) >= 100 ? fmtNum(v) : v.toLocaleString('en-US', { maximumSignificantDigits: 3 }))

export const fmtPct = (fraction: number, digits = 1) => `${fmtNum(100 * fraction, digits)} %`

function berlinParts(ms: number) {
  const p = Object.fromEntries(parts.formatToParts(ms).map((x) => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, offset: p.timeZoneName.replace('GMT', '') }
}

/** ISO 8601 with the Berlin offset, unambiguous across the clock change: 2026-10-25T02:10+02:00 */
export function isoBerlin(ms: number) {
  const p = berlinParts(ms)
  return `${p.date}T${p.time}${p.offset}`
}

/** Value of an <input type="datetime-local">, read as Berlin time. */
export function toLocalInput(ms: number) {
  const p = berlinParts(ms)
  return `${p.date}T${p.time}`
}

/** Berlin wall-clock input → UTC on the 10-minute grid; undefined for times that do not exist (spring change). */
export function fromLocalInput(value: string): number | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value)
  if (!m) return undefined
  const [utc] = berlinCandidates(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]))
  return utc === undefined ? undefined : Math.round(utc / STEP_MS) * STEP_MS
}
