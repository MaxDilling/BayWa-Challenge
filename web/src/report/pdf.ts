// The insurer's report as a PDF file, drawn with jsPDF: the words of Results, Method and the email (components/metrics.ts)
// and the charts of the ECharts wrapper as images. Inter (OFL, fonts/OFL.txt) because Geist has no Greek; the files are a
// subset of fonts.gstatic.com Inter v20, 400 and 600: pyftsubset --unicodes=U+0020-007E,U+00A0-00FF,U+0152-0153,U+0302,
// U+0391-03A9,U+03B1-03C9,U+2009,U+2010-2027,U+2030-203A,U+2070-209C,U+2122,U+2190-2193,U+2212,U+2248,U+2264-2265,
// U+1D62-1D63 --layout-features='' --no-hinting --desubroutinize
import { jsPDF } from 'jspdf'
import { chartImage, type ChartTheme } from '@/components/charts/Chart'
import { readTheme } from '@/components/charts/theme'
import { fmtAmount, fmtDateTimeZone, fmtDuration, fmtNum, fmtSpanZone } from '@/components/format'
import { compass, farmText, referenceRoles, SECTOR_TEXT, sectorWeights, toolText, wakeSectors, wakeText } from '@/components/metrics'
import type { Dataset, Span } from '@/data'
import type { AnalyzeResponse } from '@/engine'
import { wakeOption } from '@/steps/MethodStep'
import { cumulativeOption, windOption } from '@/steps/ResultsStep'
// the challenge organiser's logo, from www.baywa-re.com (320 × 77 px)
import logo from './baywa-re-logo.png?inline'
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
  /** One line on what the selected model does. */
  tagline: string
  /** DWD stations among the references. */
  stations: string[]
  /** Names of the dropped files. */
  files: string[]
  created: number
}

/** Why a target has no result, in words for the overview. */
export const missing = ({ outage, failure }: Case) =>
  !outage ? 'No outage detected or selected' : failure !== undefined ? `Not calculated: ${failure}` : 'Still calculating'

const MM_PER_PT = 25.4 / 72
const LOGO_MM = { width: 45, height: (45 * 77) / 320 }
const LEADING = 1.35
const GAP = 6
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
  underline?: boolean
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
    this.y += 10
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
        if (c.underline)
          c.lines.forEach((line, k) => {
            const width = this.doc.getTextWidth(line)
            const left = c.align === 'right' ? c.x + c.inner - width : c.x
            const y = this.y + k * this.line(size) + size * MM_PER_PT + 0.3
            this.doc.setDrawColor(c.color ?? this.s.text).setLineWidth(0.2).line(left, y, left + width, y)
          })
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

  /** Bold, underlined headings over rows with a rule under each, kept on one page; `widths` in mm, the last column takes
   * the rest. A cell's alignment also applies to its heading. */
  table(widths: number[], head: string[], rows: Cell[][]) {
    const place = (cells: Cell[]) => cells.map((c, i) => ({ ...c, width: widths[i] }))
    this.keep(() => {
      this.row(place(head.map((text, i) => ({ text, bold: true, underline: true, align: rows[0]?.[i]?.align }))))
      this.y += 1
      this.rule()
      for (const cells of rows) {
        this.y += 0.6
        this.row(place(cells))
        this.y += 0.4
        this.rule()
      }
    })
    this.y += 5
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
  const done = input.cases.filter((c) => c.response) as Required<Case>[]
  const tool = done[0] && toolText(done[0].response)
  const targets = input.cases.length === 1 ? `Target ${input.cases[0].id}` : `Targets ${input.cases.map((c) => c.id).join(', ')}`
  w.doc.setProperties({ title: 'Energy loss estimate', subject: input.cases.map((c) => c.id).join(', '), creator: tool ?? 'Wind Outage Tool' })

  w.columns(
    () => {
      if (!w.dry) w.doc.addImage(logo, 'PNG', w.x, w.y, LOGO_MM.width, LOGO_MM.height)
      w.y += LOGO_MM.height
    },
    () => {
      w.text('Energy Loss Estimate', { size: s.heading, bold: true, gap: 0.5 })
      w.text(targets, { size: s.title, bold: true, gap: 0 })
      const outages = input.cases.filter((c) => c.outage)
      if (outages.length === 1) w.text(`Outage period: ${fmtSpanZone(outages[0].outage!)}`, { bold: true })
      w.text(`Method: ${input.method}`, { size: s.label })
    },
  )
  w.y += 4
  overview(w, input, done)
  done.forEach((c, i) => {
    if (i) w.newPage()
    else w.y += 6
    target(w, c, input, chart)
  })
  w.newPage()
  done.forEach((c, i) =>
    i
      ? derivation(w, c, input)
      : w.keep(() => {
          w.text('How the figures were derived', { size: s.heading, bold: true })
          w.text('Step by step from the wind to the lost energy, for each target.', { color: s.muted })
          derivation(w, c, input)
        }),
  )
  assumptions(w, input, done, tool)

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

const kwh = (v: number) => ({ text: `${fmtAmount(v)} kWh`, align: 'right' as const })

function overview(w: Writer, input: ReportInput, done: Required<Case>[]) {
  const s = w.s
  w.title('Summary of losses')
  w.table(
    [21, 78, 17, 29],
    ['Target', 'Outage (Europe/Berlin)', 'Duration', 'Lost energy P50', 'Range P10–P90'],
    [
      ...input.cases.map((c): Cell[] => {
        const e = c.response?.energy
        if (!e) return [{ text: c.id }, { text: missing(c), color: s.error }, { text: '' }, { text: '' }, { text: '' }]
        return [
          { text: c.id },
          { text: fmtSpanZone(c.outage!) },
          { text: fmtDuration(c.outage!.endMs - c.outage!.startMs) },
          kwh(e.kwhP50),
          { text: `${fmtAmount(e.kwhP10)}–${fmtAmount(e.kwhP90)} kWh`, align: 'right' },
        ]
      }),
      ...(done.length > 1
        ? [
            [
              { text: `Total of ${done.length === input.cases.length ? `all ${done.length}` : `the ${done.length} calculated`} targets`, bold: true },
              { text: '' },
              { text: '' },
              { ...kwh(done.reduce((sum, c) => sum + c.response.energy.kwhP50, 0)), bold: true },
              { text: 'not added', color: s.muted, align: 'right' as const },
            ],
          ]
        : []),
    ],
  )
  if (done.length > 1)
    w.text(
      'The P50 values add up to the expected total. The 10–90 % ranges cannot be added: adding the P10 or the P90 values would assume that ' +
        'the errors of all targets go the same way at every moment, so the range of the total is not stated.',
      { color: s.muted },
    )
}

function target(w: Writer, c: Required<Case>, input: ReportInput, chart: ChartTheme) {
  const s = w.s
  const { dataset, outage, response } = c
  const { energy, explanation } = response
  const roles = referenceRoles(dataset.references, explanation)
  const sectors = wakeSectors(explanation)
  const half = { width: chart.print.width / 2, height: chart.print.heightSm }
  const cumulative = chartImage(cumulativeOption(response, chart), chart, half.height, half.width)

  w.text(`Target ${c.id}`, { size: s.heading, bold: true, gap: 3 })
  w.table(
    [80, 18, 42],
    ['Outage (Europe/Berlin)', 'Duration', 'Turbines', 'Power curve'],
    [[{ text: fmtSpanZone(outage) }, { text: fmtDuration(outage.endMs - outage.startMs) }, { text: farmText(dataset) }, { text: c.curve }]],
  )
  w.table(
    [30],
    ['Reference', 'Source'],
    roles.map((r) => [{ text: r.id }, { text: input.stations.includes(r.id) ? 'DWD weather station' : 'Uploaded series' }]),
  )
  const used = { ...dataset, references: dataset.references.filter((_, i) => roles[i].used) }
  const wind = chartImage({ ...windOption(used, response, outage, chart), grid: {} }, chart, chart.print.height)
  w.keep(() => {
    w.title('Wind speed')
    w.text(
      'Prediction with its 80 % band (10 % to 90 % quantile) during the outage (red), the measurements before and after, and the references the model uses.',
      { color: s.muted },
    )
    w.image(wind, { width: chart.print.width, height: chart.print.height })
  })
  w.columns(
    () => {
      w.title('Lost energy')
      w.table(
        [24, 24],
        ['Quantile', 'Amount', 'Meaning'],
        [
          [{ text: 'P10' }, kwh(energy.kwhP10), { text: '10 % quantile, low end' }],
          [{ text: 'P50', bold: true }, { ...kwh(energy.kwhP50), bold: true }, { text: 'Most likely value', bold: true }],
          [{ text: 'P90' }, kwh(energy.kwhP90), { text: '90 % quantile, high end' }],
        ],
      )
    },
    () => {
      w.title('Cumulative lost energy')
      w.text('Expected energy (P50) lost since the start of the outage', { size: s.label, color: s.muted })
      w.image(cumulative, half)
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

/** From the predicted wind to the lost energy; rows 3 and 4 add up to row 5, the effect of location is what the wake factors change. */
function derivation(w: Writer, c: Required<Case>, input: ReportInput) {
  const { dataset, outage, response } = c
  const { energy, prediction, explanation } = response
  const hours = (outage.endMs - outage.startMs) / 3_600_000
  const meanWind = prediction.mean.reduce((sum, v) => sum + v, 0) / prediction.mean.length
  const plain = energy.kwhP50WithoutDirection
  const sectors = wakeSectors(explanation)
  const signed = (v: number, text: string) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${text}`
  const location = (): Cell[] => {
    if (plain === undefined)
      return [{ text: 'Not estimated: none of the references has wind direction data, so the location cannot be told apart.' }, { text: 'n/a', align: 'right' }]
    const delta = energy.kwhP50 - plain
    const pct = plain ? ` (${signed(delta, `${fmtNum(Math.abs(delta / plain) * 100, 1)} %`)})` : ''
    const strongest = sectors.length && sectors.reduce((a, b) => (Math.abs(b.factor - 1) > Math.abs(a.factor - 1) ? b : a))
    return [
      {
        text: strongest
          ? 'Row 3 with the wind of each step multiplied by the factor of its direction sector: what the references cannot see from where ' +
            `they stand, such as the wake of a neighbouring turbine or terrain. Strongest: wind from ${compass(strongest.deg)} ` +
            `× ${fmtNum(strongest.factor, 3)} (see “Wake and terrain by wind direction”).`
          : `${input.method} does not adjust the wind by direction, so the location has no effect of its own here.`,
      },
      { text: `${signed(delta, fmtAmount(Math.abs(delta)))} kWh${pct}`, align: 'right' },
    ]
  }
  const numbered: Cell[][] = [
    [
      { text: '' },
      { text: 'Outage' },
      { text: `${fmtNum(prediction.mean.length)} steps of 10 minutes, ${fmtSpanZone(outage)}` },
      { text: fmtDuration(outage.endMs - outage.startMs), align: 'right' },
    ],
    [
      { text: '' },
      { text: 'Predicted wind' },
      { text: `Mean of the predicted 10-minute wind speeds at the target, from the references by ${input.method}.` },
      { text: `${fmtNum(meanWind, 2)} m/s`, align: 'right' },
    ],
    ...(plain === undefined
      ? []
      : [
          [
            { text: '' },
            { text: 'From the references alone' },
            { text: `Lost energy of ${farmText(dataset)} with the ${c.curve} power curve, if the wind direction were unknown.` },
            kwh(plain),
          ],
        ]),
    [{ text: '' }, { text: 'Effect of the location' }, ...location()],
    [
      { text: '', bold: true },
      { text: 'Lost energy P50', bold: true },
      {
        text:
          `Expected power of ${farmText(dataset)} for the predicted wind and its uncertainty, × 1/6 h per step, summed. ` +
          `On average ${fmtAmount(energy.kwhP50 / hours)} kW for ${fmtNum(hours, 1)} h` +
          (dataset.nTurbines > 1 ? `, ${fmtAmount(energy.kwhP50 / dataset.nTurbines)} kWh per turbine.` : '.'),
      },
      { ...kwh(energy.kwhP50), bold: true },
    ],
    [
      { text: '' },
      { text: 'Range P10–P90' },
      {
        text:
          `P50 ± ${fmtAmount(energy.kwhP90 - energy.kwhP50)} kWh: 1.28 standard deviations of the summed error, with errors persisting as ` +
          `long as in the backtest${energy.kwhP10 === 0 ? '; P10 is not below 0' : ''}.`,
      },
      { text: `${fmtAmount(energy.kwhP10)}–${fmtAmount(energy.kwhP90)} kWh`, align: 'right' },
    ],
  ]
  const rows = numbered.map((row, i) => [{ ...row[0], text: String(i + 1) }, ...row.slice(1)])
  w.title(`Target ${c.id}`)
  w.table([8, 34, w.width - 8 - 34 - 34], ['', 'Step', 'How', 'Value'], rows)
}

function assumptions(w: Writer, input: ReportInput, done: Required<Case>[], tool?: string) {
  const farms = [
    ...new Set(
      done.flatMap((c) => referenceRoles(c.dataset.references, c.response.explanation).filter((r) => r.used && !input.stations.includes(r.id)).map((r) => r.id)),
    ),
  ]
  const stations = input.stations.filter((id) => done.some((c) => c.dataset.references.some((r) => r.id === id)))
  const sources = [
    farms.length && `other wind farms (${farms.join(', ')})`,
    stations.length && `DWD weather stations (${stations.join(', ')})`,
  ].filter(Boolean)
  const items = [
    `The wind at the target was not measured during the outage. It was simulated from the wind measured at the same time by ${sources.join(' and ')}, ` +
      'whose relation to the target the model learned before the outage.',
    'All times are local time in Germany (Europe/Berlin, CET or CEST as marked); the CSV exports also carry UTC.',
    'The lost energy is the output of the power curve for the predicted wind, summed over the 10-minute steps of the outage. ' +
      'The curve is used as given apart from the air density stated for each target.',
    'P10 and P90 are the 10 % and 90 % quantiles: with 80 % probability the loss lies between them; P50 is the central estimate. In wind ' +
      'resource assessments “P90” names the conservative value exceeded with 90 % probability; here P90 is the high value.',
    'The model learns from the target data outside the outage, before and after it. The accuracy figures come from simulated outages of the same length before the real outage, each learned from the data on both sides of it.',
    `Data: ${input.files.length ? input.files.join(', ') : 'the wind series and power curve loaded in the tool'}` +
      (input.stations.length
        ? `; weather stations ${input.stations.join(', ')}: Deutscher Wetterdienst (DWD), opendata.dwd.de, 10-minute wind at about 10 m height, licensed under CC BY 4.0.`
        : '.'),
    ...(tool ? [`Calculated with ${tool}.`] : []),
  ]
  w.title(`Method: ${input.method}`)
  w.text(input.tagline, { gap: 1.5 })
  for (const c of done) {
    const { explanation } = c.response
    w.keep(() => {
      w.text(`Target ${c.id}`, { gap: 0.5 })
      w.formula(formulaText(explanation.formula))
      w.text(explanation.summary, { gap: 2 })
    })
  }
  w.title('Assumptions and limits')
  for (const item of items) {
    w.row([{ text: '•', width: 5 }, { text: item }])
    w.y += 1
  }
}
