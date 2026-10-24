// The insurer's report as a PDF file, drawn with jsPDF: the words of Results, Method and the email (components/metrics.ts)
// and the charts of the ECharts wrapper as images. Inter (OFL, fonts/OFL.txt) because Geist has no Greek; the files are a
// subset of fonts.gstatic.com Inter v20, 400 and 600: pyftsubset --unicodes=U+0020-007E,U+00A0-00FF,U+0152-0153,U+0302,
// U+0391-03A9,U+03B1-03C9,U+2009,U+2010-2027,U+2030-203A,U+2070-209C,U+2122,U+2190-2193,U+2212,U+2248,U+2264-2265,
// U+1D62-1D63 --layout-features='' --no-hinting --desubroutinize
import { jsPDF } from 'jspdf'
import { chartImage, type ChartTheme } from '@/components/charts/Chart'
import { readTheme } from '@/components/charts/theme'
import { fmtAmount, fmtDateTimeZone, fmtDuration, fmtNum, fmtSpanZone } from '@/components/format'
import {
  ACCURACY,
  BAND_HINT,
  compass,
  densityText,
  farmText,
  KEYS,
  keyValue,
  rangeText,
  referenceRoles,
  SECTOR_TEXT,
  sectorWeights,
  toolText,
  trainingDays,
  verdict,
  wakeSectors,
  wakeText,
} from '@/components/metrics'
import { plausibility, type Dataset, type Span } from '@/data'
import type { AnalyzeResponse } from '@/engine'
import { wakeOption } from '@/steps/MethodStep'
import { cumulativeOption, windOption } from '@/steps/ResultsStep'
import regular from './fonts/inter-400.ttf?inline'
import semibold from './fonts/inter-600.ttf?inline'

/** One target; `response` is missing when the selected model has no result for it. */
export interface Case {
  id: string
  dataset?: Dataset
  outage?: Span
  response?: AnalyzeResponse
  failure?: string
  /** Name or file of the target's power curve. */
  curve: string
}

export interface ReportInput {
  cases: Case[]
  /** Label of the selected model. */
  method: string
  /** DWD stations among the references. */
  stations: string[]
  /** Names of the dropped files. */
  files: string[]
  created: number
}

/** Why a target has no result, in words for the overview. */
export const missing = ({ outage, failure }: Case) =>
  !outage ? 'No outage detected or selected' : failure !== undefined ? `Not calculated: ${failure}` : 'Still calculating'

/** Shown with the references or the wake chart, not among the parameters. */
const OWN_PLACE = /^(reference_index|(r|b|lag_min)_ref_\d+|wake_(factor|steps)_.+|sector_steps_.+|a_\d+|b_\d+_ref_\d+)$/
const MM_PER_PT = 25.4 / 72
const LEADING = 1.35
const GAP = 6
// Unicode has no subscript comma; the plain one reads the same in b_{s(t),i}
const SUB: Record<string, string> = { t: 'ₜ', r: 'ᵣ', i: 'ᵢ', s: 'ₛ', '(': '₍', ')': '₎', ',': ',' }

/** The engine's LaTeX formula as text with Unicode subscripts; a command our models do not use throws. */
export function formulaText(tex: string) {
  return tex.replace(/\\hat\{(\w)\}|\\(cdot|tau|sum|Big)(?![a-zA-Z])|_\{([^}]*)\}|_(\w)|\\[a-zA-Z]+|-/g, (match, hat, command, group, single) => {
    if (hat) return `${hat}̂`
    if (command) return { cdot: '·', tau: 'τ', sum: 'Σ', Big: '' }[command as string]!
    if (match === '-') return '−'
    if (group === undefined && single === undefined) throw new Error(`The PDF report cannot write ${match} in ${tex}`)
    return [...((group ?? single) as string)]
      .map((c) => {
        if (!(c in SUB)) throw new Error(`The PDF report has no subscript ${c} for ${tex}`)
        return SUB[c]
      })
      .join('')
  })
}

/** The tokens of index.css under the forced light scheme. */
function lightTokens() {
  const el = document.createElement('div')
  el.className = 'light'
  document.body.append(el)
  const css = getComputedStyle(el)
  const token = (name: string) => css.getPropertyValue(`--${name}`).trim()
  const style = {
    text: token('foreground'),
    muted: token('muted-foreground'),
    border: token('border'),
    warning: token('warning'),
    error: token('destructive'),
    kpi: parseFloat(token('pdf-size-kpi')),
    heading: parseFloat(token('pdf-size-heading')),
    title: parseFloat(token('pdf-size-title')),
    body: parseFloat(token('pdf-size-body')),
    label: parseFloat(token('pdf-size-label')),
    margin: parseFloat(token('pdf-margin')),
  }
  const chart = readTheme(el)
  el.remove()
  return { style, chart }
}

type Style = ReturnType<typeof lightTokens>['style']
interface Cell {
  text: string
  /** mm; the last cell takes what is left */
  width?: number
  bold?: boolean
  color?: string
  align?: 'left' | 'right'
}

/** A cursor over A4 pages: wrapped text, rows, images and blocks kept on one page. In `dry` mode it only measures. */
class Writer {
  readonly doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  readonly top: number
  readonly bottom: number
  x: number
  width: number
  y: number
  dry = false
  readonly s: Style

  constructor(s: Style) {
    this.s = s
    this.doc.addFileToVFS('inter-400.ttf', regular.slice(regular.indexOf(',') + 1))
    this.doc.addFont('inter-400.ttf', 'Inter', 'normal')
    this.doc.addFileToVFS('inter-600.ttf', semibold.slice(semibold.indexOf(',') + 1))
    this.doc.addFont('inter-600.ttf', 'Inter', 'bold')
    this.top = this.x = this.y = s.margin
    this.width = this.doc.internal.pageSize.getWidth() - 2 * s.margin
    this.bottom = this.doc.internal.pageSize.getHeight() - s.margin - this.line(s.label)
  }

  line = (size: number) => size * MM_PER_PT * LEADING

  newPage() {
    this.doc.addPage()
    this.y = this.top
  }

  fits(height: number) {
    if (!this.dry && this.y + height > this.bottom) this.newPage()
  }

  private style(size: number, bold = false, color = this.s.text) {
    this.doc.setFont('Inter', bold ? 'bold' : 'normal').setFontSize(size).setTextColor(color)
  }

  text(text: string, { size = this.s.body, bold = false, color = this.s.text, gap = 0.6 } = {}) {
    this.row([{ text, bold, color }], size)
    this.y += gap
  }

  title(text: string) {
    this.y += 3
    this.text(text, { size: this.s.title, bold: true, gap: 1 })
  }

  /** Cells side by side, each wrapped in its width; the row is as tall as its tallest cell. */
  row(cells: Cell[], size = this.s.body) {
    let x = this.x
    const placed = cells.map((c, i) => {
      const width = i === cells.length - 1 ? this.x + this.width - x : c.width!
      const inner = width - (i < cells.length - 1 ? 2.5 : 0)
      this.style(size, c.bold, c.color)
      const lines: string[] = this.doc.splitTextToSize(c.text, inner)
      const cell = { ...c, x, inner, lines }
      x += width
      return cell
    })
    const height = Math.max(...placed.map((c) => c.lines.length)) * this.line(size)
    this.fits(height)
    if (!this.dry)
      for (const c of placed) {
        this.style(size, c.bold, c.color)
        this.doc.text(c.lines, c.align === 'right' ? c.x + c.inner : c.x, this.y, { baseline: 'top', lineHeightFactor: LEADING, align: c.align })
      }
    this.y += height
  }

  /** One line of formula; jsPDF does not place combining marks, so each is drawn back over the letter before it. */
  formula(text: string) {
    const height = this.line(this.s.title)
    this.fits(height)
    if (!this.dry) {
      this.style(this.s.title)
      let x = this.x
      for (const [, base, mark] of text.matchAll(/([^\u0302]+)(\u0302?)/g)) {
        this.doc.text(base, x, this.y, { baseline: 'top' })
        x += this.doc.getTextWidth(base)
        if (mark) this.doc.text(mark, x - this.doc.getTextWidth(base.at(-1)!), this.y, { baseline: 'top' })
      }
    }
    this.y += height + 1.5
  }

  rule() {
    if (!this.dry) this.doc.setDrawColor(this.s.border).setLineWidth(0.2).line(this.x, this.y, this.x + this.width, this.y)
    this.y += 0.8
  }

  /** A chart image at full column width, `height` in the chart's pixels. */
  image(url: string, size: { width: number; height: number }) {
    const height = (this.width * size.height) / size.width
    this.fits(height)
    if (!this.dry) this.doc.addImage(url, 'PNG', this.x, this.y, this.width, height)
    this.y += height
  }

  /** The figure and its unit on one baseline. */
  kpi(value: string, unit: string) {
    const height = this.line(this.s.kpi)
    this.fits(height)
    if (!this.dry) {
      const baseline = this.y + this.s.kpi * MM_PER_PT
      this.style(this.s.kpi, true)
      this.doc.text(value, this.x, baseline)
      const after = this.x + this.doc.getTextWidth(value) + 1.5
      this.style(this.s.heading, false, this.s.muted)
      this.doc.text(unit, after, baseline)
    }
    this.y += height
  }

  measure(draw: () => void) {
    const [y, dry] = [this.y, this.dry]
    this.dry = true
    draw()
    const height = this.y - y
    Object.assign(this, { y, dry })
    return height
  }

  /** On the next page when it does not fit on this one. */
  keep(draw: () => void) {
    const height = this.measure(draw)
    if (height < this.bottom - this.top) this.fits(height)
    draw()
  }

  /** Parts side by side from the same top, kept on one page; the cursor ends below the tallest. */
  columns(...parts: (() => void)[]) {
    const [x, width] = [this.x, this.width]
    const w = (width - GAP * (parts.length - 1)) / parts.length
    this.keep(() => {
      const top = this.y
      let end = top
      parts.forEach((part, i) => {
        Object.assign(this, { x: x + i * (w + GAP), width: w, y: top })
        part()
        end = Math.max(end, this.y)
      })
      Object.assign(this, { x, width, y: end })
    })
  }
}

export function reportPdf(input: ReportInput): Blob {
  const { style: s, chart } = lightTokens()
  const w = new Writer(s)
  const done = input.cases.filter((c) => c.response)
  const tool = done[0] && toolText(done[0].response!)
  w.doc.setProperties({ title: 'Energy loss estimate', subject: input.cases.map((c) => c.id).join(', '), creator: tool ?? 'Wind Outage Tool' })

  w.text('Wind Outage Tool', { size: s.label, color: s.muted })
  w.text('Energy loss estimate', { size: s.heading, bold: true })
  const targets = input.cases.length === 1 ? `Target ${input.cases[0].id}` : `Targets ${input.cases.map((c) => c.id).join(', ')}`
  w.text(`${targets} · created ${fmtDateTimeZone(input.created)} · method ${input.method}${tool ? ` · ${tool}` : ''}`, { color: s.muted })
  w.y += 2
  w.rule()

  if (input.cases.length > 1) overview(w, input, done)
  done.forEach((c, i) => {
    if (input.cases.length > 1 || i > 0) w.newPage()
    target(w, c as Required<Case>, input, chart)
  })
  w.newPage()
  assumptions(w, input, tool)
  glossary(w, done)

  const pages = w.doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    w.doc.setPage(i)
    w.doc.setFont('Inter', 'normal').setFontSize(s.label).setTextColor(s.muted)
    const y = w.doc.internal.pageSize.getHeight() - s.margin / 2
    w.doc.text(`Energy loss estimate · ${targets} · ${fmtDateTimeZone(input.created)}`, w.x, y)
    w.doc.text(`Page ${i} of ${pages}`, w.x + w.width, y, { align: 'right' })
  }
  return w.doc.output('blob')
}

function overview(w: Writer, input: ReportInput, done: Case[]) {
  const s = w.s
  const widths = [18, 56, 15, 26, 34]
  const header = ['Target', 'Outage', 'Duration', 'Lost energy P50', '10–90 % range', 'Method']
  w.title('All targets')
  w.row(header.map((text, i) => ({ text, width: widths[i], color: s.muted, align: i === 3 || i === 4 ? 'right' : 'left' })))
  w.rule()
  for (const c of input.cases) {
    const e = c.response?.energy
    w.row(
      e
        ? [
            { text: c.id, width: widths[0], bold: true },
            { text: fmtSpanZone(c.outage!), width: widths[1] },
            { text: fmtDuration(c.outage!.endMs - c.outage!.startMs), width: widths[2] },
            { text: `${fmtAmount(e.kwhP50)} kWh`, width: widths[3], bold: true, align: 'right' },
            { text: `${fmtAmount(e.kwhP10)}–${fmtAmount(e.kwhP90)} kWh`, width: widths[4], align: 'right' },
            { text: input.method },
          ]
        : [{ text: c.id, width: widths[0], bold: true }, { text: missing(c), color: s.error }],
    )
    w.rule()
  }
  if (done.length < 2) return
  const scope = done.length === input.cases.length ? `all ${done.length}` : `the ${done.length} calculated`
  w.row([
    { text: `Total of ${scope} targets, P50 only`, width: widths[0] + widths[1] + widths[2], bold: true },
    { text: `${fmtAmount(done.reduce((sum, c) => sum + c.response!.energy.kwhP50, 0))} kWh`, width: widths[3], bold: true, align: 'right' },
    { text: 'not added', width: widths[4], color: s.muted, align: 'right' },
    { text: '' },
  ])
  w.y += 2
  w.text(
    'The P50 values add up to the expected total. The 10–90 % ranges cannot be added: adding the P10 or the P90 values would assume that ' +
      'the errors of all targets go the same way at every moment, so the range of the total is not stated.',
    { color: s.muted },
  )
}

function target(w: Writer, c: Required<Case>, input: ReportInput, chart: ChartTheme) {
  const s = w.s
  const { dataset, outage, response } = c
  const { energy, explanation, validation } = response
  const roles = referenceRoles(dataset.references, explanation)
  const sectors = wakeSectors(explanation)
  const used = { ...dataset, references: dataset.references.filter((_, i) => roles[i].used) }
  const half = { width: chart.print.width / 2, height: chart.print.heightSm }
  const cumulative = chartImage(cumulativeOption(response, chart), chart, half.height, half.width)

  w.text(`Target ${c.id}`, { size: s.heading, bold: true })
  w.text(`Outage ${fmtSpanZone(outage)} · ${fmtDuration(outage.endMs - outage.startMs)}`, { color: s.muted })
  w.y += 1
  const facts = [
    ['Turbines', farmText(dataset)],
    ['Learned from', `${fmtNum(trainingDays(dataset, outage))} days of target data outside the outage`],
    ['Power curve', `${c.curve}, rated ${fmtAmount(Math.max(...dataset.powerCurve.powerKw))} kW per turbine`],
    ['Method', input.method],
  ]
  w.columns(
    ...[facts.slice(0, 2), facts.slice(2)].map((pairs) => () => pairs.forEach(([k, v]) => w.row([{ text: k, width: 22, color: s.muted }, { text: v }]))),
  )
  w.y += 3
  w.columns(
    () => {
      w.kpi(fmtAmount(energy.kwhP50), 'kWh')
      w.text('Lost energy, most likely value (P50)', { color: s.muted, gap: 2 })
      w.text(`The loss lies ${rangeText(energy)} (P10 to P90, the 10 % and 90 % quantiles).`, { bold: true, gap: 1 })
      w.text(BAND_HINT, { color: s.muted, gap: 1 })
      w.text(densityText(energy), { color: s.muted })
    },
    () => {
      w.text('Expected energy (P50) lost since the start of the outage', { size: s.label, color: s.muted })
      w.image(cumulative, half)
    },
  )

  w.keep(() => {
    w.title('References')
    w.text(roles.map((r) => `${r.id} ${r.role}${input.stations.includes(r.id) ? ' (DWD weather station)' : ''}`).join(' · '))
  })

  const wind = chartImage({ ...windOption(used, response, outage, chart), grid: {} }, chart, chart.print.height)
  w.keep(() => {
    w.title('Wind speed')
    w.text(
      'Prediction with its 80 % band (10 % to 90 % quantile) during the outage (grey), the measurements before and after, and the references the model uses.',
      { color: s.muted },
    )
    w.image(wind, { width: chart.print.width, height: chart.print.height })
  })

  const params = Object.entries({ ...explanation.params, ...explanation.diagnostics }).filter(([key]) => !OWN_PLACE.test(key))
  const values = (rows: string[][]) => {
    w.rule()
    rows.forEach(([label, value]) => w.row([{ text: label, width: w.width - 28, color: s.muted }, { text: value, align: 'right' }]))
  }
  const warnings = plausibility(dataset, outage, explanation.diagnostics.r)
  const sentence = verdict(validation, outage.endMs - outage.startMs)
  w.columns(
    () => {
      w.title(`Method: ${input.method}`)
      w.formula(formulaText(explanation.formula))
      w.text(explanation.summary, { gap: 1.5 })
      values(params.map(([key, value]) => [KEYS[key]?.label ?? key, keyValue(key, value)]))
    },
    () => {
      w.title('Accuracy')
      if (validation.n_folds) {
        if (sentence) w.text(sentence, { gap: 1.5 })
        values(ACCURACY.map((m) => [m.label, m.key in validation ? m.format(validation[m.key]) : 'n/a']))
      } else w.text('There is not enough data before the outage to simulate an outage of the same length, so accuracy could not be measured.')
      w.title('Data checks')
      if (!warnings.length) w.text('None of the plausibility checks found anything to note.')
      for (const warning of warnings) {
        w.text(warning.title, { bold: true, color: s.warning, gap: 0 })
        w.text(warning.detail, { gap: 1 })
      }
    },
  )

  const weights = sectorWeights(dataset.references, explanation)
  if (weights.sectors.length)
    w.keep(() => {
      w.title('Weights by wind direction')
      w.text(SECTOR_TEXT, { color: s.muted, gap: 1 })
      const width = Math.min(22, (w.width - 44) / weights.references.length)
      const cells = (texts: string[], color?: string) =>
        [...texts, ''].map((text, k) => ({ text, width: k === 0 ? 26 : k === 1 ? 18 : width, color, align: k ? ('right' as const) : undefined }))
      w.row(cells(['Wind from', 'Values', 'a (m/s)', ...weights.references], s.muted), s.label)
      for (const sector of weights.sectors)
        w.row(
          cells([`${compass(sector.deg)}${sector.own ? '' : ' · all'}`, fmtNum(sector.steps), fmtNum(sector.a, 2), ...sector.weights.map((b) => fmtNum(b, 3))]),
          s.label,
        )
    })

  if (!sectors.length) return
  const wake = chartImage(wakeOption(sectors, chart), chart, chart.print.height)
  w.keep(() => {
    w.title('Wake and terrain by wind direction')
    w.text(wakeText(sectors), { color: s.muted })
    w.image(wake, { width: chart.print.width, height: chart.print.height })
  })
}

function assumptions(w: Writer, input: ReportInput, tool?: string) {
  const items = [
    'All times are local time in Germany (Europe/Berlin, CET or CEST as marked); the CSV exports also carry UTC.',
    'The lost energy is the output of the power curve for the predicted wind, summed over the 10-minute steps of the outage (power × 1/6 h). ' +
      'The curve is used as given apart from the air density stated for each target: no availability, curtailment or electrical losses.',
    'P10 and P90 are the 10 % and 90 % quantiles: with 80 % probability the loss lies between them; P50 is the central estimate. In wind ' +
      'resource assessments “P90” often names the conservative value exceeded with 90 % probability; here P90 is the high value.',
    BAND_HINT,
    'The model learns from the target data outside the outage, before and after it. The accuracy figures come from simulated outages of the same length before the real outage, each learned from the data on both sides of it.',
    `Data: ${input.files.length ? input.files.join(', ') : 'the wind series and power curve loaded in the tool'}` +
      (input.stations.length
        ? `; weather stations ${input.stations.join(', ')}: Deutscher Wetterdienst (DWD), opendata.dwd.de, 10-minute wind at about 10 m height, licensed under CC BY 4.0.`
        : '.'),
    ...(tool ? [`Calculated with ${tool}.`] : []),
  ]
  w.title('Assumptions and limits')
  for (const item of items) {
    w.row([{ text: '•', width: 4 }, { text: item }])
    w.y += 1
  }
}

/** Every named figure of the target pages, explained once. */
function glossary(w: Writer, done: Case[]) {
  const keys = new Set(done.flatMap((c) => Object.keys({ ...c.response!.explanation.params, ...c.response!.explanation.diagnostics })))
  const terms = [...Object.entries(KEYS).filter(([key]) => keys.has(key)).map(([, k]) => k), ...ACCURACY]
  w.y += 3
  w.title('Terms')
  for (const t of terms) {
    w.row([{ text: t.label, width: 42, bold: true }, { text: t.hint, color: w.s.muted }])
    w.y += 1
  }
}
