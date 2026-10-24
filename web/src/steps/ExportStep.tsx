import { Check, Copy, Download, Mail } from 'lucide-react'
import { observer } from 'mobx-react-lite'
import { useState } from 'react'
import { AnalysisState } from '@/components/AnalysisState'
import { fmtDateTime, fmtDuration, fmtNum, fmtPct, HOUR, isoBerlin, STEP_MS, toLocalInput } from '@/components/format'
import { BAND_HINT, farmText, headline } from '@/components/metrics'
import { Section } from '@/components/Section'
import { Button } from '@/components/ui/button'
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

function download(name: string, text: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href))
}

/** The reference the model used; with several, why this one. */
function referenceText({ references }: Dataset, { explanation: { diagnostics: d } }: AnalyzeResponse) {
  if (d.reference_index === undefined) return references[0].id
  const others = references.filter((_, i) => i !== d.reference_index).map((r) => r.id)
  return `${references[d.reference_index].id} (chosen from ${references.length} farms because it tracked the target best before the outage, r = ${fmtNum(d[`r_ref_${d.reference_index}`], 3)}; not used: ${others.join(', ')})`
}

function emailDraft(dataset: Dataset, outage: Span, model: string, response: AnalyzeResponse, warnings: Warning[]) {
  const v = response.validation
  const target = dataset.target.id
  const accuracy = [
    v.energy_wape_pct !== undefined && `the lost-energy estimate was off by ${fmtNum(v.energy_wape_pct, 1)} % of the measured energy overall`,
    v.wind_rmse !== undefined && `the wind speed error (RMSE) was ${fmtNum(v.wind_rmse, 2)} m/s`,
    v.coverage_80 !== undefined && `${fmtPct(v.coverage_80, 0)} of the measured values fell inside the 80 % band`,
  ].filter(Boolean)
  const subject = `Energy loss estimate for wind farm ${target}, outage from ${fmtDateTime(outage.startMs)}`
  const body = [
    'Dear Sir or Madam,',
    `we report an outage of wind farm ${target} (${farmText(dataset)}) from ${fmtDateTime(outage.startMs)} to ${fmtDateTime(outage.endMs)} (Europe/Berlin), ${fmtDuration(outage.endMs - outage.startMs)} in total.`,
    `Estimated lost energy: ${headline(response.energy).replace('Most', 'most')} The range is the 10 % to 90 % quantile (P10 to P90). ${BAND_HINT}`,
    `Method: the missing 10-minute wind speeds were predicted from the neighbouring reference farm ${referenceText(dataset, response)}, using the relationship learned from the ${fmtNum((outage.startMs - dataset.target.grid.t0) / 86_400_000)} days of data before the outage (${model}). The predicted wind was converted to energy with the turbine power curve, taking the uncertainty of each prediction into account.`,
    v.n_folds && accuracy.length
      ? `Accuracy: in ${fmtNum(v.n_folds)} simulated outages of the same length before the event, ${accuracy.join(', ')}.`
      : 'Accuracy: there was not enough data before the outage for a backtest.',
    warnings.length > 0 &&
      `Data checks to note: ${warnings.map((w) => `${w.title}. ${w.detail}`).join(' ')}`,
    'The prediction is attached as a CSV file with 10-minute values in Europe/Berlin and UTC time.',
    'Kind regards',
    `Calculated with Wind Outage Tool, windgap ${response.engine.version} (${response.engine.id === 'py' ? 'Python' : 'TypeScript'} engine).`,
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
      description="A draft with period, method, lost energy, accuracy and data checks. Attach the CSV."
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
