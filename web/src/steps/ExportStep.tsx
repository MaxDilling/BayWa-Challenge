import { Check, Copy, Download, FileText, LoaderCircle, Mail, Share } from 'lucide-react'
import { observer } from 'mobx-react-lite'
import { useEffect, useState } from 'react'
import { AnalysisState } from '@/components/AnalysisState'
import { fmtAmount, fmtDateTime, fmtDuration, fmtNum, fmtPct, fmtSpan, HOUR, isoBerlin, STEP_MS, toLocalInput } from '@/components/format'
import {
  BAND_HINT,
  calculating,
  densityText,
  farmText,
  missing,
  referenceText,
  toolText,
  TOTAL_HINT,
  totalText,
  trainingDays,
  type Case,
} from '@/components/metrics'
import { Section } from '@/components/Section'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/Notice'
import { plausibility, type Dataset, type Span, type Warning } from '@/data'
import type { AnalyzeResponse } from '@/engine'
import { store } from '@/state/store'
import { TotalCard } from '@/steps/ResultsStep'

const COLUMNS = ['time_berlin', 'time_utc', 'wind_mean_ms', 'wind_q10_ms', 'wind_q90_ms', 'power_mean_kw', 'energy_kwh', 'cumulative_kwh']

/** power_mean_kw is the expected farm power E[P(v)] behind the energy figure, recovered from the cumulative P50 energy. */
function predictionRows({ prediction, energy }: AnalyzeResponse): string[][] {
  const cumulative = energy.cumulativeKwh
  return prediction.mean.map((mean, i) => {
    const t = prediction.t0 + i * STEP_MS
    const kwh = cumulative[i] - (i ? cumulative[i - 1] : 0)
    return [
      isoBerlin(t),
      new Date(t).toISOString().replace(':00.000Z', 'Z'),
      mean.toFixed(3),
      prediction.q10[i].toFixed(3),
      prediction.q90[i].toFixed(3),
      (kwh / (STEP_MS / HOUR)).toFixed(2),
      kwh.toFixed(3),
      cumulative[i].toFixed(3),
    ]
  })
}

function download(name: string, data: string | Blob) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(typeof data === 'string' ? new Blob([data], { type: 'text/csv' }) : data)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href))
}

const accuracyLines = (v: Record<string, number>) =>
  [
    v.energy_wape_pct !== undefined && `Lost-energy error: ${fmtNum(v.energy_wape_pct, 1)} % of the measured energy`,
    v.wind_rmse !== undefined && `Wind speed error (RMSE): ${fmtNum(v.wind_rmse, 2)} m/s`,
    v.coverage_80 !== undefined && `Measured values inside the 80 % band: ${fmtPct(v.coverage_80, 0)}`,
  ].filter((line) => line !== false)

function emailDraft(dataset: Dataset, outage: Span, model: string, response: AnalyzeResponse, warnings: Warning[]) {
  const v = response.validation
  const target = dataset.target.id
  const { kwhP10, kwhP50, kwhP90 } = response.energy
  const accuracy = accuracyLines(v).map((line) => `• ${line}`)
  const subject = `Energy loss estimate – wind farm ${target} – outage of ${fmtDateTime(outage.startMs)}`
  const body = [
    'Dear Sir/Madam,',
    `Please find below our estimate of the energy lost during the outage of wind farm ${target}. Attached are the report (PDF) with charts, method and accuracy, and the prediction as a CSV file with 10-minute values in Europe/Berlin and UTC time.`,
    [
      'Outage',
      `• Wind farm: ${target} (${farmText(dataset)})`,
      `• Period: ${fmtDateTime(outage.startMs)} – ${fmtDateTime(outage.endMs)} (Europe/Berlin)`,
      `• Duration: ${fmtDuration(outage.endMs - outage.startMs)}`,
    ].join('\n'),
    [
      'Lost energy',
      `• Best estimate (P50): ${fmtAmount(kwhP50)} kWh`,
      `• 80 % range (P10 – P90): ${fmtAmount(kwhP10)} – ${fmtAmount(kwhP90)} kWh`,
      densityText(response.energy),
    ].join('\n'),
    [
      'Method',
      `The missing 10-minute wind speeds were predicted from ${referenceText(dataset.references, response.explanation)}. The relationship between the farms was learned from the ${fmtNum(trainingDays(dataset, outage))} days of target data outside the outage (${model}). Each prediction, including its uncertainty, was converted to energy with the turbine power curve. ${BAND_HINT}`,
    ].join('\n'),
    [
      'Validation',
      ...(v.n_folds && accuracy.length
        ? [`Backtest on ${fmtNum(v.n_folds)} simulated outages of the same length before the event:`, ...accuracy]
        : ['There was not enough data before the outage for a backtest.']),
    ].join('\n'),
    warnings.length > 0 && ['Data notes', ...warnings.map((w) => `• ${w.title}. ${w.detail}`)].join('\n'),
    'Kind regards',
    `—\nCalculated with ${toolText(response)}`,
  ]
    .filter(Boolean)
    .join('\n\n')
  return { subject, body }
}

/** The email for every target at once: one line per target, the P50 total, and per target its references, backtest and data notes. */
function totalEmailDraft(cases: Case[], model: string) {
  const done = cases.filter((c) => c.response) as Required<Case>[]
  const ids = cases.map((c) => c.id).join(', ')
  const perTarget = (title: string, lines: (c: Required<Case>) => string[]) =>
    [title, ...done.flatMap((c) => lines(c).map((line, i) => (i ? `  – ${line}` : `• ${c.id}: ${line}`)))].join('\n')
  const notes = done.flatMap((c) => plausibility(c.dataset, c.outage, c.response.explanation.diagnostics.r).map((w) => `• ${c.id}: ${w.title}. ${w.detail}`))
  const subject = `Energy loss estimate – targets ${ids}`
  const body = [
    'Dear Sir/Madam,',
    `Please find below our estimate of the energy lost during the outages of targets ${ids}. Attached is the report (PDF) with charts, method and accuracy for each target.`,
    [
      'Lost energy (Europe/Berlin)',
      ...cases.map((c) => {
        const e = c.response?.energy
        return e
          ? `• ${c.id}: ${fmtSpan(c.outage!)} (${fmtDuration(c.outage!.endMs - c.outage!.startMs)}), most likely ${fmtAmount(e.kwhP50)} kWh, 80 % range ${fmtAmount(e.kwhP10)} – ${fmtAmount(e.kwhP90)} kWh`
          : `• ${c.id}: ${missing(c)}`
      }),
      ...(done.length > 1 ? [`${totalText(done.length, cases.length)} (P50): ${fmtAmount(done.reduce((sum, c) => sum + c.response.energy.kwhP50, 0))} kWh. ${TOTAL_HINT}`] : []),
    ].join('\n'),
    perTarget(
      `Method\nThe missing 10-minute wind speeds were predicted with ${model}, learned from the target data outside the outage, and converted to energy with the turbine power curve. ${BAND_HINT}`,
      (c) => [`predicted from ${referenceText(c.dataset.references, c.response.explanation)}.`, densityText(c.response.energy)],
    ),
    perTarget('Validation', (c) => {
      const accuracy = accuracyLines(c.response.validation)
      return c.response.validation.n_folds && accuracy.length
        ? [`backtest on ${fmtNum(c.response.validation.n_folds)} simulated outages of the same length.`, ...accuracy]
        : ['not enough data before the outage for a backtest.']
    }),
    notes.length > 0 && ['Data notes', ...notes].join('\n'),
    'Kind regards',
    done[0] && `—\nCalculated with ${toolText(done[0].response)}`,
  ]
    .filter(Boolean)
    .join('\n\n')
  return { subject, body }
}

export const ExportStep = observer(function ExportStep() {
  const { dataset, outage, model, response, warnings } = store
  if (store.showsTotal) {
    const { subject, body } = totalEmailDraft(store.cases, store.label(model))
    return (
      <div className="flex flex-col gap-section">
        <ReportCard title={subject} text={body} />
        <TotalCard />
        <EmailCard subject={subject} body={body} attach="Attach the PDF report." />
      </div>
    )
  }
  if (!dataset || !outage || !response) return <AnalysisState />
  const rows = predictionRows(response)
  const csv = [COLUMNS, ...rows].map((r) => r.join(',')).join('\n') + '\n'
  const file = `windgap_${dataset.target.id}_${toLocalInput(outage.startMs).replace(/\D/g, '').slice(0, 12)}.csv`
  const { subject, body } = emailDraft(dataset, outage, store.label(model), response, warnings)
  return (
    <div className="grid gap-section lg:grid-cols-2">
      <ReportCard title={subject} text={body} csv={new File([csv], file, { type: 'text/csv' })} />
      <EmailCard subject={subject} body={body} />
      <Section
        title="Prediction with uncertainty and energy"
        description={`${fmtNum(rows.length)} rows of 10 minutes: wind in m/s (mean, 10 % and 90 % quantile), expected farm power in kW, energy in kWh.`}
        action={
          <Button onClick={() => download(file, csv)}>
            <Download /> Download CSV
          </Button>
        }
      >
        <Table columns={COLUMNS} rows={rows.slice(0, 6)} />
        <p className="text-label text-muted-foreground">
          {file} · first 6 of {fmtNum(rows.length)} rows
        </p>
      </Section>
    </div>
  )
})

function Table({ columns, rows }: { columns: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-label tabular-nums">
        <thead className="bg-muted text-muted-foreground">
          <tr>
            {columns.map((c) => (
              <th key={c} className="px-2 py-1.5 text-left font-medium whitespace-nowrap">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[0]} className="border-t">
              {r.map((cell, i) => (
                <td key={i} className="px-2 py-1 whitespace-nowrap">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** The insurer's PDF for the targets on view (all under Total) with the selected model's results. Made in the background once no target is still
 * being calculated, so that download and share run within the click: browsers share only from a user gesture. Share sends
 * `title`, `text` and `csv` along with it. */
let madeReport: { key: unknown[]; file: File } | undefined

const ReportCard = observer(function ReportCard({ title, text, csv }: { title: string; text?: string; csv?: File }) {
  const { reportCases: cases, model, stations, files } = store
  const { outages, resultsByTarget, failuresByTarget, curveChoice, nTurbines } = store
  const pending = cases.filter(calculating)
  const left = cases.filter((c) => !c.response && !calculating(c))
  const [pdf, setPdf] = useState<{ file: File } | { error: string }>()
  const [shareError, setShareError] = useState<string>()
  useEffect(() => {
    // The inputs are immutable store state, so a report stays valid while they are the same objects: reopening the step costs nothing.
    const key = [files, stations, curveChoice, nTurbines, outages, resultsByTarget, failuresByTarget, model, cases.map((c) => c.id).join()]
    if (madeReport?.key.every((k, i) => k === key[i])) {
      setPdf({ file: madeReport.file })
      return
    }
    setPdf(undefined)
    if (pending.length) return
    let current = true
    const created = Date.now()
    const input = {
      cases,
      method: store.label(model),
      tagline: store.models.find((m) => m.name === model)!.tagline,
      stations,
      files: files.map((f) => f.name),
      created,
    }
    const name = `windgap_report_${cases.map((c) => c.id).join('_')}_${toLocalInput(created).slice(0, 10)}.pdf`
    // The report is drawn on the main thread; starting after the step has painted keeps the click on Export responsive.
    const start = setTimeout(() =>
      import('@/report/pdf')
        .then(({ reportPdf }) => new File([reportPdf(input)], name, { type: 'application/pdf' }))
        .then(
          (file) => {
            madeReport = { key, file }
            if (current) setPdf({ file })
          },
          (e: unknown) => current && setPdf({ error: e instanceof Error ? e.message : String(e) }),
        ),
    )
    return () => {
      current = false
      clearTimeout(start)
    }
  }, [cases, model, stations, files, outages, resultsByTarget, failuresByTarget, curveChoice, nTurbines, pending.length])
  const file = pdf && 'file' in pdf ? pdf.file : undefined
  const attached = (file: File) => (csv ? [file, csv] : [file])
  const share = (file: File) => {
    setShareError(undefined)
    navigator.share({ title, text, files: attached(file) }).catch((e: Error) => e.name !== 'AbortError' && setShareError(e.message))
  }
  return (
    <Section
      title="Report for the insurer"
      className="lg:col-span-2"
      description={`One PDF with lost energy and range, wind and energy charts, method, accuracy and data checks for ${cases.length > 1 ? 'every target' : `${cases[0].id}${store.targets.length > 1 ? ' (Total above covers all targets)' : ''}`}. Share hands it${csv ? ' with the CSV' : ''} and the email text to a mail app.`}
      action={
        <div className="flex gap-2">
          {file && navigator.canShare?.({ files: attached(file) }) && (
            <Button variant="outline" onClick={() => share(file)}>
              <Share /> Share with attachments
            </Button>
          )}
          <Button disabled={!file} onClick={() => download(file!.name, file!)}>
            <FileText /> Download report (PDF)
          </Button>
        </div>
      }
    >
      {pdf && 'error' in pdf ? (
        <Notice tone="error" title="The report could not be made">
          {pdf.error}
        </Notice>
      ) : (
        <p className="flex items-center gap-2 text-label text-muted-foreground">
          {!file && <LoaderCircle className="size-4 animate-spin text-primary" />}
          {pending.length > 0
            ? `Waiting for ${pending.map((t) => t.id).join(', ')} to be calculated`
            : !file
              ? 'Preparing the report'
              : `${cases.length > 1 ? `${cases.length - left.length} of ${cases.length} targets, a page or two each` : `Target ${cases[0].id}`} · ${store.label(model)}${left.length > 0 ? ` · without a result, named in the report: ${left.map((t) => t.id).join(', ')}` : ''}`}
        </p>
      )}
      {shareError && (
        <Notice tone="error" title="Sharing failed">
          {shareError}
        </Notice>
      )}
    </Section>
  )
})

function EmailCard({ subject, body, attach = 'Attach the PDF report and the CSV.' }: { subject: string; body: string; attach?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <Section
      title="Email to the insurer"
      className="lg:row-span-2"
      description={`A draft with period, method, lost energy, accuracy and data checks. ${attach}`}
      action={
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <a href={`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}>
              <Mail /> Open in mail app
            </a>
          </Button>
          <Button onClick={copy}>
            {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      }
    >
      <div className="rounded-lg border bg-muted p-card-sm">
        <p className="mb-3 font-medium">{subject}</p>
        <div className="text-pretty whitespace-pre-line">{body}</div>
      </div>
    </Section>
  )
}
