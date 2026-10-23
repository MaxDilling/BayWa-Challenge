import { Check, Copy, Download, Mail } from 'lucide-react'
import { observer } from 'mobx-react-lite'
import { useState } from 'react'
import { AnalysisState } from '@/components/AnalysisState'
import { fmtDateTime, fmtDuration, fmtNum, fmtPct, isoBerlin, STEP_MS, toLocalInput } from '@/components/format'
import { Section } from '@/components/Section'
import { Button } from '@/components/ui/button'
import type { Dataset, Span } from '@/data'
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
      (kwh / (STEP_MS / 3_600_000)).toFixed(2),
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

function emailDraft(dataset: Dataset, outage: Span, model: string, response: AnalyzeResponse) {
  const { kwhP10, kwhP50, kwhP90 } = response.energy
  const v = response.validation
  const target = dataset.target.id
  const accuracy = [
    v.energy_dev_pct !== undefined && `the summed energy deviated by ${fmtNum(v.energy_dev_pct, 1)} % on average`,
    v.wind_rmse !== undefined && `the wind speed error (RMSE) was ${fmtNum(v.wind_rmse, 2)} m/s`,
    v.coverage_80 !== undefined && `${fmtPct(v.coverage_80, 0)} of the measured values fell inside the 80 % band`,
  ].filter(Boolean)
  const subject = `Energy loss estimate for wind farm ${target}, outage from ${fmtDateTime(outage.startMs)}`
  const body = [
    'Dear Sir or Madam,',
    `we report an outage of wind farm ${target} (${fmtNum(dataset.nTurbines)} turbines) from ${fmtDateTime(outage.startMs)} to ${fmtDateTime(outage.endMs)} (Europe/Berlin), ${fmtDuration(outage.endMs - outage.startMs)} in total.`,
    `Estimated lost energy: ${fmtNum(kwhP50)} kWh (P50), with a range of ${fmtNum(kwhP10)} to ${fmtNum(kwhP90)} kWh (10 % / 90 % quantile).`,
    `Method: the missing 10-minute wind speeds were predicted from the neighbouring reference farm ${dataset.references.map((r) => r.id).join(', ')}, using the relationship learned from the ${fmtNum((outage.startMs - dataset.target.grid.t0) / 86_400_000)} days of data before the outage (model "${model}"). The predicted wind was converted to energy with the turbine power curve, taking the uncertainty of each prediction into account.`,
    v.n_folds && accuracy.length
      ? `Accuracy: in ${fmtNum(v.n_folds)} simulated outages of the same length before the event, ${accuracy.join(', ')}.`
      : 'Accuracy: there was not enough data before the outage for a backtest.',
    'The prediction is attached as a CSV file with 10-minute values in Europe/Berlin and UTC time.',
    'Kind regards',
  ].join('\n\n')
  return { subject, body }
}

export const ExportStep = observer(function ExportStep() {
  const { dataset, outage, model, response } = store
  if (!dataset || !outage || !response) return <AnalysisState />
  const rows = predictionRows(response)
  const csv = [COLUMNS, ...rows].map((r) => r.join(',')).join('\n') + '\n'
  const file = `windgap_${dataset.target.id}_${toLocalInput(outage.startMs).replace(/\D/g, '').slice(0, 12)}.csv`
  const { subject, body } = emailDraft(dataset, outage, model, response)
  return (
    <div className="grid gap-section lg:grid-cols-2">
      <Section
        title="Prediction as CSV"
        description={`${fmtNum(rows.length)} rows of 10 minutes: wind in m/s (mean, 10 % and 90 % quantile), expected farm power in kW, energy in kWh.`}
        action={
          <Button onClick={() => download(file, csv)}>
            <Download /> Download CSV
          </Button>
        }
      >
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-label tabular-nums">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                {COLUMNS.map((c) => (
                  <th key={c} className="px-2 py-1.5 text-left font-medium whitespace-nowrap">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 6).map((r) => (
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
        <p className="text-label text-muted-foreground">
          {file} · first 6 of {fmtNum(rows.length)} rows
        </p>
      </Section>
      <EmailCard subject={subject} body={body} />
    </div>
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
      description="A draft with period, method, lost energy and accuracy. Attach the CSV."
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
