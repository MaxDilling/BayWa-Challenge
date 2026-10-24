import { observer } from 'mobx-react-lite'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { chartImage, type ChartTheme } from '@/components/charts/Chart'
import { readTheme } from '@/components/charts/theme'
import { fmtAmount, fmtDateTimeZone, fmtDuration, fmtNum, fmtSpanZone, toLocalInput } from '@/components/format'
import { Formula } from '@/components/Formula'
import {
  ACCURACY,
  BAND_HINT,
  farmText,
  KEYS,
  keyValue,
  rangeText,
  referenceRoles,
  toolText,
  trainingDays,
  verdict,
  wakeSectors,
  wakeText,
} from '@/components/metrics'
import { KNOWN_CURVES, plausibility, type Dataset, type Span } from '@/data'
import type { AnalyzeResponse } from '@/engine'
import { cn } from '@/lib/utils'
import { store } from '@/state/store'
import { wakeOption } from '@/steps/MethodStep'
import { cumulativeOption, windOption } from '@/steps/ResultsStep'

/** Shown with the references or the wake chart, not among the parameters. */
const OWN_PLACE = /^(reference_index|(r|b|lag_min)_ref_\d+|wake_(factor|steps)_.+)$/

/** One target as the report needs it; `response` is missing when the selected model has no result for it. */
interface Case {
  id: string
  dataset?: Dataset
  outage?: Span
  response?: AnalyzeResponse
  failure?: string
}

const cases = (): Case[] =>
  store.targets.map(({ id }) => ({
    id,
    dataset: store.datasets[id],
    outage: store.outages[id],
    response: store.resultsByTarget[id]?.[store.model],
    failure: store.failuresByTarget[id]?.[store.model],
  }))

/** Why a target has no result, in words for the overview. */
const missing = ({ outage, failure }: Case) =>
  !outage ? 'No outage detected or selected' : failure !== undefined ? `Not calculated: ${failure}` : 'Still calculating'

/** The insurer's PDF: mounted on demand, printed once its charts are drawn, hidden on screen (index.css). */
export const Report = observer(function Report() {
  const root = useRef<HTMLDivElement>(null)
  const [theme, setTheme] = useState<ChartTheme>()
  const [created] = useState(Date.now)
  useLayoutEffect(() => setTheme(readTheme(root.current!)), [])
  useEffect(() => {
    if (!theme) return
    const images = [...root.current!.querySelectorAll('img')].map((img) => img.decode())
    Promise.all(images).then(() => {
      const title = document.title
      document.title = `windgap_report_${store.targets.map((t) => t.id).join('_')}_${toLocalInput(created).slice(0, 10)}`
      window.print()
      document.title = title
    })
  }, [theme, created])

  const all = cases()
  const done = all.filter((c) => c.response)
  return createPortal(
    <div ref={root} className="report light bg-card text-label text-foreground">
      <header className="mb-6 border-b pb-4">
        <p className="text-muted-foreground">Wind Outage Tool</p>
        <h1 className="text-heading font-semibold">Energy loss estimate</h1>
        <p className="mt-1 text-muted-foreground">
          {all.length === 1 ? `Target ${all[0].id}` : `Targets ${all.map((c) => c.id).join(', ')}`} · created {fmtDateTimeZone(created)} ·
          method {store.label(store.model)}
          {done[0] && ` · ${toolText(done[0].response!)}`}
        </p>
      </header>
      {all.length > 1 && <Overview all={all} />}
      {all.map((c) => c.response && <TargetSection key={c.id} c={c as Required<Case>} theme={theme} newPage={all.length > 1} />)}
      <div className="break-before-page">
        <Assumptions done={done} />
        <Glossary done={done} />
      </div>
    </div>,
    document.body,
  )
})

function Block({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn('mt-5 break-inside-avoid', className)}>
      <h3 className="mb-1.5 text-body font-semibold">{title}</h3>
      {children}
    </section>
  )
}

const th = 'py-1 pr-3 text-left font-medium text-muted-foreground'
const td = 'py-1 pr-3 align-top'

function Overview({ all }: { all: Case[] }) {
  const done = all.filter((c) => c.response)
  return (
    <Block title="All targets">
      <table className="w-full tabular-nums">
        <thead className="border-b">
          <tr>
            <th className={th}>Target</th>
            <th className={th}>Outage</th>
            <th className={th}>Duration</th>
            <th className={cn(th, 'text-right')}>Lost energy P50</th>
            <th className={cn(th, 'text-right')}>10–90 % range</th>
            <th className={th}>Method</th>
          </tr>
        </thead>
        <tbody>
          {all.map((c) => (
            <tr key={c.id} className="border-b">
              <td className={cn(td, 'font-medium')}>{c.id}</td>
              {c.response ? (
                <>
                  <td className={td}>{fmtSpanZone(c.outage!)}</td>
                  <td className={td}>{fmtDuration(c.outage!.endMs - c.outage!.startMs)}</td>
                  <td className={cn(td, 'text-right font-medium')}>{fmtAmount(c.response.energy.kwhP50)} kWh</td>
                  <td className={cn(td, 'text-right')}>
                    {fmtAmount(c.response.energy.kwhP10)}–{fmtAmount(c.response.energy.kwhP90)} kWh
                  </td>
                  <td className={td}>{store.label(store.model)}</td>
                </>
              ) : (
                <td className={cn(td, 'text-destructive')} colSpan={5}>
                  {missing(c)}
                </td>
              )}
            </tr>
          ))}
          {done.length > 1 && (
            <tr className="font-medium">
              <td className={td} colSpan={3}>
                Total of {done.length === all.length ? `all ${done.length}` : `the ${done.length} calculated`} targets, P50 only
              </td>
              <td className={cn(td, 'text-right')}>{fmtAmount(done.reduce((s, c) => s + c.response!.energy.kwhP50, 0))} kWh</td>
              <td className={cn(td, 'text-right text-muted-foreground')}>not added</td>
              <td className={td} />
            </tr>
          )}
        </tbody>
      </table>
      {done.length > 1 && (
        <p className="mt-2 text-pretty text-muted-foreground">
          The P50 values add up to the expected total. The 10–90 % ranges cannot be added: adding the P10 or the P90 values would assume
          that the errors of all targets go the same way at every moment, so the range of the total is not stated.
        </p>
      )}
    </Block>
  )
}

function TargetSection({ c, theme, newPage }: { c: Required<Case>; theme?: ChartTheme; newPage: boolean }) {
  const { id, dataset, outage, response } = c
  const { energy, explanation, validation } = response
  const sectors = useMemo(() => wakeSectors(explanation), [explanation])
  const roles = useMemo(() => referenceRoles(dataset.references, explanation), [dataset, explanation])
  const images = useMemo(
    () =>
      theme && {
        wind: chartImage(
          {
            ...windOption({ ...dataset, references: dataset.references.filter((_, i) => roles[i].used) }, response, outage, theme),
            grid: {},
          },
          theme,
          theme.print.height,
        ),
        cumulative: chartImage(cumulativeOption(response, theme), theme, theme.print.heightSm, theme.print.width / 2),
        wake: sectors.length > 0 ? chartImage(wakeOption(sectors, theme), theme, theme.print.height) : undefined,
      },
    [theme, dataset, response, outage, sectors, roles],
  )
  const params = Object.entries({ ...explanation.params, ...explanation.diagnostics }).filter(([key]) => !OWN_PLACE.test(key))
  const curve = [...(store.uploadedCurve ? [store.uploadedCurve] : []), ...KNOWN_CURVES].find((k) => k.curve === dataset.powerCurve)
  const warnings = plausibility(dataset, outage, explanation.diagnostics.r)
  const sentence = verdict(validation, outage.endMs - outage.startMs)
  return (
    <article className={cn(newPage && 'break-before-page')}>
      <h2 className="text-heading font-semibold">Target {id}</h2>
      <p className="text-muted-foreground">
        Outage {fmtSpanZone(outage)} · {fmtDuration(outage.endMs - outage.startMs)}
      </p>

      <dl className="mt-2 grid grid-cols-[auto_1fr_auto_1fr] gap-x-3 gap-y-0.5">
        <dt className="text-muted-foreground">Turbines</dt>
        <dd>{farmText(dataset)}</dd>
        <dt className="text-muted-foreground">Learned from</dt>
        <dd>{fmtNum(trainingDays(dataset, outage))} days of data before the outage</dd>
        <dt className="text-muted-foreground">Power curve</dt>
        <dd>
          {curve?.name ?? 'source not recorded'}, rated {fmtAmount(Math.max(...dataset.powerCurve.powerKw))} kW per turbine
        </dd>
        <dt className="text-muted-foreground">Method</dt>
        <dd>{store.label(store.model)}</dd>
      </dl>

      <div className="mt-4 grid grid-cols-2 gap-6 break-inside-avoid">
        <div>
          <p className="flex items-baseline gap-2">
            <span className="text-kpi font-semibold tabular-nums">{fmtAmount(energy.kwhP50)}</span>
            <span className="text-stat text-muted-foreground">kWh</span>
          </p>
          <p className="text-muted-foreground">Lost energy, most likely value (P50)</p>
          <p className="mt-2 text-pretty font-medium">The loss lies {rangeText(energy)} (P10 to P90, the 10 % and 90 % quantiles).</p>
          <p className="mt-1 text-pretty text-muted-foreground">{BAND_HINT}</p>
        </div>
        <figure>
          <figcaption className="text-muted-foreground">Expected energy (P50) lost since the start of the outage</figcaption>
          {images && <img src={images.cumulative} alt="Cumulative lost energy" className="w-full" />}
        </figure>
      </div>

      <Block title="References">
        <p className="text-pretty">
          {roles.map((ref, i) => (
            <span key={ref.id} className={cn(!ref.used && 'text-muted-foreground')}>
              {i > 0 && ' · '}
              <span className="font-medium">{ref.id}</span> {ref.role}
              {store.stations.includes(ref.id) && ' (DWD weather station)'}
            </span>
          ))}
        </p>
      </Block>

      <Block title="Wind speed">
        <p className="mb-1 text-muted-foreground">
          Prediction with its 80 % band (10 % to 90 % quantile) during the outage (grey), the measurements before and after, and the
          references the model uses.
        </p>
        {images && <img src={images.wind} alt="Predicted wind speed with 80 % band and measurements" className="w-full" />}
      </Block>

      <div className="grid grid-cols-2 gap-6">
        <Block title={`Method: ${store.label(store.model)}`}>
          <Formula tex={explanation.formula} />
          <p className="text-pretty">{explanation.summary}</p>
          <Values rows={params.map(([key, value]) => [KEYS[key]?.label ?? key, keyValue(key, value)])} />
        </Block>
        <div>
          <Block title="Accuracy">
            {validation.n_folds ? (
              <>
                {sentence && <p className="text-pretty">{sentence}</p>}
                <Values rows={ACCURACY.map((m) => [m.label, m.key in validation ? m.format(validation[m.key]) : 'n/a'])} />
              </>
            ) : (
              <p>There is not enough data before the outage to simulate an outage of the same length, so accuracy could not be measured.</p>
            )}
          </Block>
          <Block title="Data checks">
            {warnings.length ? (
              <ul className="flex flex-col gap-1">
                {warnings.map((w) => (
                  <li key={w.title}>
                    <span className="font-medium text-warning">{w.title}.</span> {w.detail}
                  </li>
                ))}
              </ul>
            ) : (
              <p>None of the plausibility checks found anything to note.</p>
            )}
          </Block>
        </div>
      </div>

      {images?.wake && (
        <Block title="Wake and terrain by wind direction">
          <p className="mb-1 text-pretty text-muted-foreground">{wakeText(sectors)}</p>
          <img src={images.wake} alt="Wind factor per direction sector" className="w-full" />
        </Block>
      )}
    </article>
  )
}

/** Name and value pairs; what the names mean is in the glossary. */
function Values({ rows }: { rows: string[][] }) {
  return (
    <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 border-t pt-2">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="text-right tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Every named figure of the target sections, explained once. */
function Glossary({ done }: { done: Case[] }) {
  const keys = new Set(done.flatMap((c) => Object.keys({ ...c.response!.explanation.params, ...c.response!.explanation.diagnostics })))
  const terms = [
    ...Object.entries(KEYS)
      .filter(([key]) => keys.has(key))
      .map(([, k]) => k),
    ...ACCURACY,
  ]
  return (
    <Block title="Terms">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        {terms.map((t) => (
          <div key={t.label} className="contents">
            <dt className="font-medium">{t.label}</dt>
            <dd className="text-pretty text-muted-foreground">{t.hint}</dd>
          </div>
        ))}
      </dl>
    </Block>
  )
}

function Assumptions({ done }: { done: Case[] }) {
  const stations = store.stations
  const files = store.files.map((f) => f.name)
  return (
    <Block title="Assumptions and limits">
      <ul className="flex list-disc flex-col gap-1 pl-4 text-pretty">
        <li>All times are local time in Germany (Europe/Berlin, CET or CEST as marked); the CSV exports also carry UTC.</li>
        <li>
          The lost energy is the output of the power curve for the predicted wind, summed over the 10-minute steps of the outage (power ×
          1/6 h). The curve is used as given: no correction for air density, and no availability, curtailment or electrical losses.
        </li>
        <li>
          P10 and P90 are the 10 % and 90 % quantiles: with 80 % probability the loss lies between them; P50 is the central estimate. In
          wind resource assessments “P90” often names the conservative value exceeded with 90 % probability; here P90 is the high value.
        </li>
        <li>{BAND_HINT}</li>
        <li>
          The model learns only from data before the outage. The accuracy figures come from simulated outages of the same length on that
          data, before the real outage.
        </li>
        <li>
          Data: {files.length ? files.join(', ') : 'the wind series and power curve loaded in the tool'}
          {stations.length > 0 && (
            <>
              ; weather stations {stations.join(', ')}: Deutscher Wetterdienst (DWD), opendata.dwd.de, 10-minute wind at about 10 m height,
              licensed under CC BY 4.0
            </>
          )}
          .
        </li>
        {done[0] && <li>Calculated with {toolText(done[0].response!)}.</li>}
      </ul>
    </Block>
  )
}
