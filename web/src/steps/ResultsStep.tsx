import { observer } from 'mobx-react-lite'
import { useCallback } from 'react'
import { AnalysisState } from '@/components/AnalysisState'
import { Chart, type ChartTheme } from '@/components/charts/Chart'
import { byId, dash, gridPoints, tooltipHtml } from '@/components/charts/series'
import { fmtAmount, fmtAxisTime, fmtDayTime, fmtDuration, fmtNum, fmtPct, fmtSpan, HOUR, STEP_MS } from '@/components/format'
import { Hint } from '@/components/Hint'
import { ACCURACY, BAND_HINT, calculating, densityText, farmText, METRICS, missing, rangeText, TOTAL_HINT, totalText, verdict } from '@/components/metrics'
import { Notice } from '@/components/Notice'
import { Section } from '@/components/Section'
import { Warnings, WarningSummary } from '@/components/Warnings'
import type { Dataset, Span } from '@/data'
import type { AnalyzeResponse } from '@/engine'
import { cn } from '@/lib/utils'
import { store } from '@/state/store'

const CHECKS_ID = 'data-checks'

export const ResultsStep = observer(function ResultsStep() {
  const { response, dataset, outage, warnings, calculated, showsTotal } = store
  if (!dataset || !outage || !calculated.length || (!showsTotal && !response)) return <AnalysisState />
  return (
    <div className="grid gap-section lg:grid-cols-12">
      {warnings.length > 0 && (
        <div className="lg:col-span-12">
          <WarningSummary items={warnings} detailsId={CHECKS_ID} />
        </div>
      )}
      {showsTotal ? (
        <>
          <TotalEnergyCard outage={outage} />
          <TotalCard />
        </>
      ) : (
        <>
          <EnergyCard response={response!} outage={outage} dataset={dataset} />
          <AccuracyCard
            validation={response!.validation}
            outage={outage}
            farmKw={Math.max(...dataset.powerCurve.powerKw) * dataset.nTurbines}
          />
        </>
      )}
      <WindCard cases={calculated} outage={outage} />
      <EnergyCharts cases={calculated} />
      {warnings.length > 0 && (
        <Section id={CHECKS_ID} title="Data checks" description="Worth a look before the numbers are sent; they also go into the email." className="lg:col-span-12">
          <Warnings items={warnings} />
        </Section>
      )}
    </div>
  )
})

/** Total: the P50 of every calculated target summed; the ranges are not added (SPEC.md S4). */
const TotalEnergyCard = observer(function TotalEnergyCard({ outage }: { outage: Span }) {
  const { cases, calculated } = store
  return (
    <Section
      title="Lost energy"
      description={`${fmtNum(cases.length)} targets · ${fmtDuration(outage.endMs - outage.startMs)} outage · ${fmtSpan(outage)}`}
      className="lg:col-span-4"
    >
      <p className="flex items-baseline gap-2">
        <span className="text-kpi font-semibold tabular-nums">{fmtAmount(calculated.reduce((sum, c) => sum + c.response.energy.kwhP50, 0))}</span>
        <span className="text-stat text-muted-foreground">kWh</span>
      </p>
      <p className="text-label text-muted-foreground">Most likely loss (P50), {totalText(calculated.length, cases.length).toLowerCase()}</p>
      <p className="text-label text-pretty text-muted-foreground">{TOTAL_HINT}</p>
    </Section>
  )
})

const COMPARED = [METRICS.energy_wape_pct, METRICS.wind_rmse, METRICS.coverage_80]

/** Total: every target's lost energy and backtest with the selected model, one row each. */
const TotalCard = observer(function TotalCard() {
  const cell = 'px-3 py-2.5 text-right whitespace-nowrap'
  return (
    <Section title="Each target" description={`Lost energy and the backtest on each target's own data with ${store.label(store.model)}.`} className="lg:col-span-8">
      <div className="overflow-x-auto">
        <table className="w-full text-left tabular-nums">
          <thead className="text-label text-muted-foreground">
            <tr className="border-b">
              <th className="py-2 pr-3 font-medium">Target</th>
              <th className="px-3 py-2 text-right font-medium">Lost energy P50</th>
              <th className="px-3 py-2 text-right font-medium">Range P10–P90</th>
              {COMPARED.map((m) => (
                <th key={m.key} className="px-3 py-2 text-right font-medium whitespace-nowrap">
                  <Hint label={m.label}>{m.hint}</Hint>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {store.cases.map((c) => {
              const r = c.response
              return (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="py-2.5 pr-3 font-medium">{c.id}</td>
                  {r ? (
                    <>
                      <td className={cell}>{fmtAmount(r.energy.kwhP50)} kWh</td>
                      <td className={cell}>
                        {fmtAmount(r.energy.kwhP10)}–{fmtAmount(r.energy.kwhP90)} kWh
                      </td>
                      {COMPARED.map((m) => (
                        <td key={m.key} className={cell}>
                          {m.key in r.validation ? m.format(r.validation[m.key]) : 'n/a'}
                        </td>
                      ))}
                    </>
                  ) : (
                    <td colSpan={2 + COMPARED.length} className={cn('py-2.5 pl-3', calculating(c) ? 'text-muted-foreground' : 'text-destructive')}>
                      {missing(c)}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Section>
  )
})

function EnergyCard({ response, outage, dataset }: { response: AnalyzeResponse; outage: Span; dataset: Dataset }) {
  const { kwhP10, kwhP50, kwhP90 } = response.energy
  const position = kwhP90 > kwhP10 ? (100 * (kwhP50 - kwhP10)) / (kwhP90 - kwhP10) : 50
  return (
    <Section
      title="Lost energy"
      description={`${farmText(dataset)} · ${fmtDuration(outage.endMs - outage.startMs)} outage · ${fmtSpan(outage)}`}
      className="lg:col-span-4"
    >
      <p className="flex items-baseline gap-2">
        <span className="text-kpi font-semibold tabular-nums">{fmtAmount(kwhP50)}</span>
        <span className="text-stat text-muted-foreground">kWh</span>
      </p>
      <p className="text-label text-muted-foreground">Most likely loss (P50)</p>
      <p className="text-pretty font-medium">
        The loss lies {rangeText(response.energy)}.{' '}
        <Hint label={<span className="sr-only">How the range is made</span>}>{BAND_HINT}</Hint>
      </p>
      <div className="relative mt-2 h-2 rounded-full bg-energy/25" aria-hidden>
        <span
          className="absolute top-1/2 size-3.5 -translate-1/2 rounded-full border-2 border-card bg-energy"
          style={{ left: `${position}%` }}
        />
      </div>
      <div className="flex justify-between text-label text-muted-foreground">
        <span>P10 · 10 % quantile</span>
        <span>P90 · 90 % quantile</span>
      </div>
      <p className="text-label text-pretty text-muted-foreground">{densityText(response.energy)}</p>
    </Section>
  )
}

function AccuracyCard({ validation, outage, farmKw }: { validation: Record<string, number>; outage: Span; farmKw: number }) {
  const folds = validation.n_folds
  const sentence = verdict(validation, outage.endMs - outage.startMs)
  return (
    <Section
      title="Accuracy"
      description={folds ? 'Backtest on your data: simulated outages of the same length before this one, compared with the measurements.' : undefined}
      className="lg:col-span-8"
    >
      {folds ? (
        <>
          {sentence && <p className="text-pretty">{sentence}</p>}
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {ACCURACY.map((m) => (
              <div key={m.key} className="rounded-lg bg-muted px-3 py-2.5">
                <dt className="text-label text-muted-foreground">
                  <Hint label={m.label}>{m.hint}</Hint>
                </dt>
                <dd className="text-stat font-semibold tabular-nums">{m.key in validation ? m.format(validation[m.key]) : 'n/a'}</dd>
                {m.key === 'power_rmse' && m.key in validation && farmKw > 0 && (
                  <dd className="text-label text-muted-foreground tabular-nums">{fmtPct(validation.power_rmse / farmKw, 0)} of rated farm power</dd>
                )}
              </div>
            ))}
          </dl>
        </>
      ) : (
        <Notice tone="empty" title="No backtest possible">
          There is not enough data before the outage to simulate an outage of the same length, so accuracy cannot be measured.
        </Notice>
      )}
    </Section>
  )
}

/** A target with its result, as the charts take it; several lie on top of each other, told apart by their line style. */
type Shown = { id: string; dataset: Dataset; response: AnalyzeResponse }

/** Every target shares the references, so they are drawn once, from the first. */
export function windOption(cases: Shown[], outage: Span, t: ChartTheme) {
  const length = outage.endMs - outage.startMs
  const pad = Math.min(Math.max(length, 12 * HOUR), 72 * HOUR)
  const [from, to] = [outage.startMs - pad, outage.endMs + pad]
  const refs = cases[0].dataset.references
  const several = cases.length > 1
  const at = ({ prediction: { t0 } }: AnalyzeResponse, values: number[]) => values.map((v, i) => [t0 + i * STEP_MS, v])
  return {
    legend: {},
    grid: { bottom: t.label * 4.5, ...(several && { top: t.label * 7 }) },
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        const v = byId(params)
        const ms = (x: number | null | undefined) => (x == null ? undefined : `${fmtNum(x, 2)} m/s`)
        return tooltipHtml((params as { axisValue: number }[])[0].axisValue, [
          ...cases.flatMap(({ id }, k) => {
            const [lo, width] = [v.get(`band-lo-${k}`), v.get(`band-${k}`)]
            const name = (what: string) => (several ? `${id} ${what.toLowerCase()}` : what)
            return [
              { color: t.prediction, name: name('Predicted'), value: ms(v.get(`mean-${k}`)) },
              {
                color: t.band,
                name: name('80 % band'),
                value: lo == null || width == null ? undefined : `${fmtNum(lo, 2)}–${fmtNum(lo + width, 2)} m/s`,
              },
              { color: t.measured, name: name('Measured'), value: ms(v.get(`target-${k}`)) },
            ]
          }),
          ...refs.map((r, i) => ({ color: t.reference, name: r.id, value: ms(v.get(`ref-${i}`)) })),
        ])
      },
    },
    xAxis: { type: 'time', min: from, max: to },
    yAxis: { type: 'value', name: 'm/s', min: 0 },
    dataZoom: [{ type: 'inside' }, { type: 'slider', height: t.label * 2, bottom: t.label * 0.5 }],
    series: [
      ...cases.map(({ id, dataset }, k) => ({
        id: `target-${k}`,
        name: several ? `${id} measured` : 'Measured (target)',
        type: 'line',
        data: gridPoints(dataset.target.grid, from, to),
        lineStyle: { color: t.measured, width: t.lineThin, type: dash(k) },
        itemStyle: { color: t.measured },
        ...(k === 0 && { markArea: { silent: true, itemStyle: { color: t.outage }, data: [[{ xAxis: outage.startMs }, { xAxis: outage.endMs }]] } }),
      })),
      ...refs.map((r, i) => ({
        id: `ref-${i}`,
        name: refs.length > 1 ? r.id : 'Reference',
        type: 'line',
        data: gridPoints(r.grid, from, to),
        lineStyle: { color: t.reference, width: t.lineThin, type: i ? 'dashed' : 'solid' },
        itemStyle: { color: t.reference },
      })),
      ...cases.flatMap(({ id, response }, k) => {
        const { mean, q10, q90 } = response.prediction
        return [
          {
            id: `band-lo-${k}`,
            name: '80 % band',
            type: 'line',
            stack: `band-${k}`,
            data: at(response, q10),
            lineStyle: { opacity: 0 },
            itemStyle: { color: t.band },
          },
          {
            id: `band-${k}`,
            name: '80 % band',
            type: 'line',
            stack: `band-${k}`,
            data: at(
              response,
              q90.map((v, i) => v - q10[i]),
            ),
            lineStyle: { opacity: 0 },
            itemStyle: { color: t.band },
            areaStyle: { color: t.band, opacity: t.bandOpacity },
          },
          {
            id: `mean-${k}`,
            name: several ? `${id} predicted` : 'Predicted',
            type: 'line',
            data: at(response, mean),
            lineStyle: { color: t.prediction, width: t.line, type: dash(k) },
            itemStyle: { color: t.prediction },
          },
        ]
      }),
    ],
  }
}

function WindCard({ cases, outage }: { cases: Shown[]; outage: Span }) {
  const option = useCallback((t: ChartTheme) => windOption(cases, outage, t), [cases, outage])
  return (
    <Section
      title="Wind speed"
      description={`Prediction with its 80 % band (10 % to 90 % quantile) during the outage, and the measurements before and after${cases.length > 1 ? '; one line style per target' : ''}.`}
      className="lg:col-span-12"
    >
      <Chart option={option} className="h-chart" />
    </Section>
  )
}

/** Display only: per-step and per-hour energy are differences of the engine's cumulative P50 curve. */
function hourly(response: AnalyzeResponse) {
  const { t0 } = response.prediction
  const cumulative = response.energy.cumulativeKwh
  const hours = new Map<number, number>()
  cumulative.forEach((c, i) => {
    const hour = Math.floor((t0 + i * STEP_MS) / HOUR) * HOUR
    hours.set(hour, (hours.get(hour) ?? 0) + c - (i ? cumulative[i - 1] : 0))
  })
  return [...hours]
}

export function cumulativeOption(cases: Pick<Shown, 'id' | 'response'>[], t: ChartTheme) {
  const several = cases.length > 1
  return {
    ...(several && { legend: {} }),
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        const points = params as { seriesIndex: number; value: [number, number] }[]
        return tooltipHtml(
          points[0].value[0],
          points.map((p) => ({ color: t.energy, name: several ? `${cases[p.seriesIndex].id} lost so far (P50)` : 'Lost so far (P50)', value: `${fmtAmount(p.value[1])} kWh` })),
        )
      },
    },
    grid: { top: t.label * (several ? 4 : 2) },
    xAxis: { type: 'time' },
    yAxis: { type: 'value', name: 'kWh' },
    series: cases.map(({ id, response }, k) => ({
      name: id,
      type: 'line',
      data: [[response.prediction.t0, 0], ...response.energy.cumulativeKwh.map((c, i) => [response.prediction.t0 + (i + 1) * STEP_MS, c])],
      lineStyle: { color: t.energy, width: t.line, type: dash(k) },
      itemStyle: { color: t.energy },
      ...(!several && { areaStyle: { color: t.energy, opacity: t.areaOpacity } }),
    })),
  }
}

/** Several targets stack per hour, each a step lighter; the stack's height is their summed P50. */
function hourlyOption(cases: Shown[], t: ChartTheme) {
  const perTarget = cases.map((c) => hourly(c.response))
  const several = cases.length > 1
  return {
    ...(several && { legend: {} }),
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        const points = params as { dataIndex: number; seriesIndex: number }[]
        const [hour] = perTarget[0][points[0].dataIndex]
        return tooltipHtml(
          hour,
          points.map((p) => ({
            color: t.energy,
            name: several ? `${cases[p.seriesIndex].id} lost in this hour (P50)` : 'Lost in this hour (P50)',
            value: `${fmtAmount(perTarget[p.seriesIndex][p.dataIndex][1])} kWh`,
          })),
        )
      },
    },
    grid: { top: t.label * (several ? 4 : 2) },
    xAxis: { type: 'category', data: perTarget[0].map(([h]) => fmtAxisTime(h)), axisLabel: { hideOverlap: true } },
    yAxis: { type: 'value', name: 'kWh' },
    series: cases.map(({ id }, k) => ({
      name: id,
      type: 'bar',
      stack: 'loss',
      data: perTarget[k].map(([, kwh]) => kwh),
      itemStyle: { color: t.energy, opacity: 1 - (0.6 * k) / cases.length, ...(k === cases.length - 1 && { borderRadius: t.point }) },
    })),
  }
}

function EnergyCharts({ cases }: { cases: Shown[] }) {
  const cumulative = useCallback((t: ChartTheme) => cumulativeOption(cases, t), [cases])
  const bars = useCallback((t: ChartTheme) => hourlyOption(cases, t), [cases])
  const { response } = cases[0]
  const end = response.prediction.t0 + response.energy.cumulativeKwh.length * STEP_MS
  return (
    <>
      <Section title="Cumulative loss" description={`Expected energy (P50) lost until ${fmtDayTime(end)}${cases.length > 1 ? ', per target' : ''}.`} className="lg:col-span-6">
        <Chart option={cumulative} className="h-chart-sm" />
      </Section>
      <Section
        title="Loss per hour"
        description={`Expected energy (P50) lost in each clock hour of the outage${cases.length > 1 ? ', the targets stacked' : ''}.`}
        className="lg:col-span-6"
      >
        <Chart option={bars} className="h-chart-sm" />
      </Section>
    </>
  )
}
