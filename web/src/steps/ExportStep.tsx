import { Check, Copy, Download, FileText, LoaderCircle, Mail, Share } from 'lucide-react'
import { observer } from 'mobx-react-lite'
import { useEffect, useState } from 'react'
import { AnalysisState } from '@/components/AnalysisState'
import { fmtAmount, fmtDateTime, fmtDuration, fmtNum, fmtPct, HOUR, isoBerlin, STEP_MS, toLocalInput } from '@/components/format'
import { densityText, farmText, referenceText } from '@/components/metrics'
import { Section } from '@/components/Section'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/Notice'
import { FILLED_HEADER, filledTargetCsv, type Dataset, type Span, type Warning } from '@/data'
import type { AnalyzeResponse } from '@/engine'
import { store } from '@/state/store'

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

function emailDraft(dataset: Dataset, outage: Span, model: string, response: AnalyzeResponse, warnings: Warning[]) {
  const v = response.validation
  const target = dataset.target.id
  const { kwhP10, kwhP50, kwhP90 } = response.energy
  const accuracy = [
    v.energy_wape_pct !== undefined && `• Lost-energy error: ${fmtNum(v.energy_wape_pct, 1)} % of the measured energy`,
    v.wind_rmse !== undefined && `• Wind speed error (RMSE): ${fmtNum(v.wind_rmse, 2)} m/s`,
    v.coverage_80 !== undefined && `• Measured values inside the 80 % band: ${fmtPct(v.coverage_80, 0)}`,
  ].filter(Boolean)
  const subject = `Energy loss estimate – wind farm ${target} – outage of ${fmtDateTime(outage.startMs)}`
  const body = [
    'Dear Sir/Madam,',
    `Please find below our estimate of the energy lost during the outage of wind farm ${target}. Attached are the report (PDF) with charts, method and accuracy, and the prediction as a CSV file with 10-minute values in Berlin and UTC time.`,
    [
      'Outage',
      `• Wind farm: ${target} (${farmText(dataset)})`,
      `• Period: ${fmtDateTime(outage.startMs)} – ${fmtDateTime(outage.endMs)} (Berlin)`,
      `• Duration: ${fmtDuration(outage.endMs - outage.startMs)}`,
    ].join('\n'),
    [
      'Lost energy',
      `• Best estimate (P50): ${fmtAmount(kwhP50)} kWh`,
      `• 80 % range (low / high estimate: 10 % / 90 % quantile): ${fmtAmount(kwhP10)} – ${fmtAmount(kwhP90)} kWh`,
      densityText(response.energy),
    ].join('\n'),
    [
      'Method',
      `The missing 10-minute wind speeds were predicted from ${referenceText(dataset.references, response.explanation)} using ${model}. Each prediction, including its uncertainty, was converted to energy with the turbine power curve.`,
    ].join('\n'),
    [
      'Validation',
      ...(v.n_folds && accuracy.length
        ? [`Backtest on ${fmtNum(v.n_folds)} simulated outages of the same length before the event:`, ...accuracy]
        : ['There was not enough data before the outage for a backtest.']),
    ].join('\n'),
    warnings.length > 0 && ['Data notes', ...warnings.map((w) => `• ${w.title}. ${w.detail}`)].join('\n'),
    'Kind regards',
  ]
    .filter(Boolean)
    .join('\n\n')
  return { subject, body }
}

export const ExportStep = observer(function ExportStep() {
  const { dataset, outage, model, response, warnings } = store
  if (!dataset || !outage || !response) return <AnalysisState />
  const rows = predictionRows(response)
  const csv = [COLUMNS, ...rows].map((r) => r.join(',')).join('\n') + '\n'
  const file = `windgap_${dataset.target.id}_${toLocalInput(outage.startMs).replace(/\D/g, '').slice(0, 12)}.csv`
  const { subject, body } = emailDraft(dataset, outage, store.label(model), response, warnings)
  return (
    <div className="grid gap-section lg:grid-cols-2">
      <ReportCard subject={subject} body={body} csv={new File([csv], file, { type: 'text/csv' })} />
      <FilledCard dataset={dataset} response={response} />
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

/** The target file with the gaps of the outage filled: what a test that hides measurements compares against. */
function FilledCard({ dataset, response }: { dataset: Dataset; response: AnalyzeResponse }) {
  const csv = filledTargetCsv(dataset.target.grid, [response.prediction])
  const lines = csv.trimEnd().split('\n')
  const first = lines.findIndex((l) => l.endsWith(',1'))
  const filled = lines.filter((l) => l.endsWith(',1')).length
  const file = `${dataset.target.id}_filled.csv`
  return (
    <Section
      title="Filled target series"
      description={`The target file in the challenge format (Europe/Berlin time, m/s) with the predicted mean in its ${fmtNum(filled)} missing outage values; Predicted = 1 marks them. Use this file to submit predictions.`}
      action={
        <div className="flex gap-2">
          {store.targets.length > 1 && <DownloadAll />}
          <Button onClick={() => download(file, csv)}>
            <Download /> Download filled series
          </Button>
        </div>
      }
    >
      <Table columns={FILLED_HEADER.split(',')} rows={lines.slice(Math.max(first - 2, 1), first + 4).map((l) => l.split(','))} />
      <p className="text-label text-muted-foreground">
        {file} · {fmtNum(lines.length - 1)} rows, shown around the start of the outage
      </p>
    </Section>
  )
}

/** Every target's filled series with the selected model, one file each; targets without a result are left out. */
const DownloadAll = observer(function DownloadAll() {
  const { targets, datasets, resultsByTarget, model } = store
  const ready = targets.filter((t) => datasets[t.id] && resultsByTarget[t.id]?.[model])
  return (
    <Button
      variant="outline"
      disabled={ready.length < targets.length}
      title={ready.length < targets.length ? 'Some targets are still being calculated or failed' : undefined}
      onClick={() => ready.forEach((t) => download(`${t.id}_filled.csv`, filledTargetCsv(t.grid, [resultsByTarget[t.id][model].prediction])))}
    >
      <Download /> All {targets.length} targets
    </Button>
  )
})

/** The insurer's PDF for every target with a result for the selected model. Made in the background once no target is still
 * being calculated, so that download and share run within the click: browsers share only from a user gesture. */
const ReportCard = observer(function ReportCard({ subject, body, csv }: { subject: string; body: string; csv: File }) {
  const { targets, datasets, outages, resultsByTarget, failuresByTarget, model, stations, files, curveChoice } = store
  const pending = targets.filter((t) => datasets[t.id] && outages[t.id] && !resultsByTarget[t.id]?.[model] && failuresByTarget[t.id]?.[model] === undefined)
  const left = targets.filter((t) => !resultsByTarget[t.id]?.[model] && !pending.includes(t))
  const [pdf, setPdf] = useState<{ file: File } | { error: string }>()
  const [shareError, setShareError] = useState<string>()
  useEffect(() => {
    setPdf(undefined)
    if (pending.length) return
    let current = true
    const created = Date.now()
    const input = {
      cases: targets.map(({ id }) => ({
        id,
        dataset: datasets[id],
        outage: outages[id],
        response: resultsByTarget[id]?.[model],
        failure: failuresByTarget[id]?.[model],
        curve: store.curveOf(id).name,
      })),
      method: store.label(model),
      tagline: store.models.find((m) => m.name === model)!.tagline,
      stations,
      files: files.map((f) => f.name),
      created,
    }
    const name = `windgap_report_${targets.map((t) => t.id).join('_')}_${toLocalInput(created).slice(0, 10)}.pdf`
    import('@/report/pdf')
      .then(({ reportPdf }) => new File([reportPdf(input)], name, { type: 'application/pdf' }))
      .then(
        (file) => current && setPdf({ file }),
        (e: unknown) => current && setPdf({ error: e instanceof Error ? e.message : String(e) }),
      )
    return () => {
      current = false
    }
  }, [targets, datasets, outages, resultsByTarget, failuresByTarget, model, stations, files, curveChoice, pending.length])
  const file = pdf && 'file' in pdf ? pdf.file : undefined
  const share = (file: File) => {
    setShareError(undefined)
    navigator.share({ title: subject, text: body, files: [file, csv] }).catch((e: Error) => e.name !== 'AbortError' && setShareError(e.message))
  }
  return (
    <Section
      title="Report for the insurer"
      className="lg:col-span-2"
      description="One PDF with lost energy and range, wind and energy charts, method, accuracy and data checks for every target. Share hands it with the CSV and the email text to a mail app."
      action={
        <div className="flex gap-2">
          {file && navigator.canShare?.({ files: [file, csv] }) && (
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
              : `${targets.length > 1 ? `${targets.length - left.length} of ${targets.length} targets, a page or two each` : `Target ${targets[0].id}`} · ${store.label(model)}${left.length > 0 ? ` · without a result, named in the report: ${left.map((t) => t.id).join(', ')}` : ''}`}
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

function EmailCard({ subject, body }: { subject: string; body: string }) {
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
      description="A draft with period, method, lost energy, accuracy and data checks. Attach the PDF report and the CSV."
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
