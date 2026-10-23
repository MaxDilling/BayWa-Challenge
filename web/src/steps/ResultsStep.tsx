import { Info } from 'lucide-react'
import { observer } from 'mobx-react-lite'
import { useCallback } from 'react'
import { AnalysisState } from '@/components/AnalysisState'
import { Chart, type ChartTheme } from '@/components/charts/Chart'
import { byId, gridPoints, tooltipHtml } from '@/components/charts/series'
import { fmtAxisTime, fmtDayTime, fmtDuration, fmtNum, fmtPct, fmtSpan, STEP_MS } from '@/components/format'
import { Notice } from '@/components/Notice'
import { Section } from '@/components/Section'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Dataset, Span } from '@/data'
import type { AnalyzeResponse } from '@/engine'
import { store } from '@/state/store'

const HOUR = 3_600_000

export const ResultsStep = observer(function ResultsStep() {
  const { response, dataset, outage } = store
  if (!response || !dataset || !outage) return <AnalysisState />
  return (
    <div className="grid gap-section lg:grid-cols-12">
      <EnergyCard response={response} outage={outage} />
      <AccuracyCard validation={response.validation} outage={outage} />
      <WindCard dataset={dataset} response={response} outage={outage} />
      <EnergyCharts response={response} />
    </div>
  )
})

function EnergyCard({ response, outage }: { response: AnalyzeResponse; outage: Span }) {
  const { kwhP10, kwhP50, kwhP90 } = response.energy
  const position = kwhP90 > kwhP10 ? (100 * (kwhP50 - kwhP10)) / (kwhP90 - kwhP10) : 50
  return (
    <Section
      title="Lost energy"
      description={`${fmtDuration(outage.endMs - outage.startMs)} outage · ${fmtSpan(outage)}`}
      className="lg:col-span-4"
    >
      <p className="flex items-baseline gap-2">
        <span className="text-kpi font-semibold tabular-nums">{fmtNum(kwhP50)}</span>
        <span className="text-stat text-muted-foreground">kWh</span>
      </p>
      <p className="text-label text-muted-foreground">P50, the expected loss</p>
      <div className="relative mt-2 h-2 rounded-full bg-energy/25" aria-hidden>
        <span
          className="absolute top-1/2 size-3.5 -translate-1/2 rounded-full border-2 border-card bg-energy"
          style={{ left: `${position}%` }}
        />
      </div>
      <div className="flex justify-between text-label tabular-nums">
        <span>
          <span className="block font-medium">{fmtNum(kwhP10)} kWh</span>
          <span className="text-muted-foreground">P10 · 10 % quantile</span>
        </span>
        <span className="text-right">
          <span className="block font-medium">{fmtNum(kwhP90)} kWh</span>
          <span className="text-muted-foreground">P90 · 90 % quantile</span>
        </span>
      </div>
    </Section>
  )
}

const METRICS: { key: string; label: string; format: (v: number) => string; hint: string }[] = [
  {
    key: 'energy_dev_pct',
    label: 'Energy deviation',
    format: (v) => `${fmtNum(v, 1)} %`,
    hint: 'Deviation of the summed energy from the measured one, per simulated outage, as an absolute value.',
  },
  {
    key: 'wind_rmse',
    label: 'Wind RMSE',
    format: (v) => `${fmtNum(v, 2)} m/s`,
    hint: 'Root-mean-square error of the 10-minute wind speed.',
  },
  { key: 'wind_mae', label: 'Wind MAE', format: (v) => `${fmtNum(v, 2)} m/s`, hint: 'Mean absolute error of the 10-minute wind speed.' },
  {
    key: 'power_rmse',
    label: 'Power RMSE',
    format: (v) => `${fmtNum(v)} kW`,
    hint: 'Root-mean-square error of the farm power per 10 minutes.',
  },
  {
    key: 'coverage_80',
    label: '80 % band coverage',
    format: (v) => fmtPct(v, 0),
    hint: 'Share of measured values inside the 80 % band; ideally 80 %.',
  },
  {
    key: 'bias',
    label: 'Bias',
    format: (v) => `${v > 0 ? '+' : ''}${fmtNum(v, 2)} m/s`,
    hint: 'Mean wind error. A bias does not average out, so it drives the energy sum.',
  },
]

function AccuracyCard({ validation, outage }: { validation: Record<string, number>; outage: Span }) {
  const folds = validation.n_folds
  return (
    <Section
      title="Accuracy"
      description={
        folds
          ? `Backtest on your data: ${fmtNum(folds)} simulated outages of ${fmtDuration(outage.endMs - outage.startMs)} before this one, compared with the measurements.`
          : undefined
      }
      className="lg:col-span-8"
    >
      {folds ? (
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {METRICS.map((m) => (
            <div key={m.key} className="rounded-lg bg-muted px-3 py-2.5">
              <dt className="flex items-center gap-1 text-label text-muted-foreground">
                {m.label}
                <Tooltip>
                  <TooltipTrigger aria-label={`About ${m.label}`}>
                    <Info className="size-3.5" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-64">{m.hint}</TooltipContent>
                </Tooltip>
              </dt>
              <dd className="text-stat font-semibold tabular-nums">{m.key in validation ? m.format(validation[m.key]) : 'n/a'}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <Notice tone="empty" title="No backtest possible">
          There is not enough data before the outage to simulate an outage of the same length, so accuracy cannot be measured.
        </Notice>
      )}
    </Section>
  )
}

function windOption(dataset: Dataset, response: AnalyzeResponse, outage: Span, t: ChartTheme) {
  const length = outage.endMs - outage.startMs
  const pad = Math.min(Math.max(length, 12 * HOUR), 72 * HOUR)
  const [from, to] = [outage.startMs - pad, outage.endMs + pad]
  const { t0, mean, q10, q90 } = response.prediction
  const at = (values: number[]) => values.map((v, i) => [t0 + i * STEP_MS, v])
  const refs = dataset.references
  return {
    legend: {},
    grid: { bottom: t.label * 4.5 },
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        const v = byId(params)
        const [lo, width] = [v.get('band-lo'), v.get('band')]
        const ms = (x: number | null | undefined) => (x == null ? undefined : `${fmtNum(x, 2)} m/s`)
        return tooltipHtml((params as { axisValue: number }[])[0].axisValue, [
          { color: t.prediction, name: 'Predicted', value: ms(v.get('mean')) },
          {
            color: t.band,
            name: '80 % band',
            value: lo == null || width == null ? undefined : `${fmtNum(lo, 2)}–${fmtNum(lo + width, 2)} m/s`,
          },
          { color: t.measured, name: 'Measured', value: ms(v.get('target')) },
          ...refs.map((r, i) => ({ color: t.reference, name: r.id, value: ms(v.get(`ref-${i}`)) })),
        ])
      },
    },
    xAxis: { type: 'time', min: from, max: to },
    yAxis: { type: 'value', name: 'm/s', min: 0 },
    dataZoom: [{ type: 'inside' }, { type: 'slider', height: t.label * 2, bottom: t.label * 0.5 }],
    series: [
      {
        id: 'target',
        name: 'Measured (target)',
        type: 'line',
        data: gridPoints(dataset.target.grid, from, to),
        lineStyle: { color: t.measured, width: t.lineThin },
        itemStyle: { color: t.measured },
        markArea: { silent: true, itemStyle: { color: t.outage }, data: [[{ xAxis: outage.startMs }, { xAxis: outage.endMs }]] },
      },
      ...refs.map((r, i) => ({
        id: `ref-${i}`,
        name: refs.length > 1 ? r.id : 'Reference',
        type: 'line',
        data: gridPoints(r.grid, from, to),
        lineStyle: { color: t.reference, width: t.lineThin, type: i ? 'dashed' : 'solid' },
        itemStyle: { color: t.reference },
      })),
      {
        id: 'band-lo',
        name: '80 % band',
        type: 'line',
        stack: 'band',
        data: at(q10),
        lineStyle: { opacity: 0 },
        itemStyle: { color: t.band },
      },
      {
        id: 'band',
        name: '80 % band',
        type: 'line',
        stack: 'band',
        data: at(q90.map((v, i) => v - q10[i])),
        lineStyle: { opacity: 0 },
        itemStyle: { color: t.band },
        areaStyle: { color: t.band, opacity: t.bandOpacity },
      },
      {
        id: 'mean',
        name: 'Predicted',
        type: 'line',
        data: at(mean),
        lineStyle: { color: t.prediction, width: t.line },
        itemStyle: { color: t.prediction },
      },
    ],
  }
}

function WindCard({ dataset, response, outage }: { dataset: Dataset; response: AnalyzeResponse; outage: Span }) {
  const option = useCallback((t: ChartTheme) => windOption(dataset, response, outage, t), [dataset, response, outage])
  return (
    <Section
      title="Wind speed"
      description="Prediction with its 80 % band (10 % to 90 % quantile) during the outage, and the measurements before and after."
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

function cumulativeOption(response: AnalyzeResponse, t: ChartTheme) {
  const { t0 } = response.prediction
  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        const [p] = params as { value: [number, number] }[]
        return tooltipHtml(p.value[0], [{ color: t.energy, name: 'Lost so far (P50)', value: `${fmtNum(p.value[1])} kWh` }])
      },
    },
    grid: { top: t.label * 2 },
    xAxis: { type: 'time' },
    yAxis: { type: 'value', name: 'kWh' },
    series: [
      {
        type: 'line',
        data: [[t0, 0], ...response.energy.cumulativeKwh.map((c, i) => [t0 + (i + 1) * STEP_MS, c])],
        lineStyle: { color: t.energy, width: t.line },
        itemStyle: { color: t.energy },
        areaStyle: { color: t.energy, opacity: t.areaOpacity },
      },
    ],
  }
}

function hourlyOption(response: AnalyzeResponse, t: ChartTheme) {
  const hours = hourly(response)
  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        const [p] = params as { dataIndex: number }[]
        const [hour, kwh] = hours[p.dataIndex]
        return tooltipHtml(hour, [{ color: t.energy, name: 'Lost in this hour (P50)', value: `${fmtNum(kwh)} kWh` }])
      },
    },
    grid: { top: t.label * 2 },
    xAxis: { type: 'category', data: hours.map(([h]) => fmtAxisTime(h)), axisLabel: { hideOverlap: true } },
    yAxis: { type: 'value', name: 'kWh' },
    series: [{ type: 'bar', data: hours.map(([, kwh]) => kwh), itemStyle: { color: t.energy, borderRadius: t.point } }],
  }
}

function EnergyCharts({ response }: { response: AnalyzeResponse }) {
  const cumulative = useCallback((t: ChartTheme) => cumulativeOption(response, t), [response])
  const bars = useCallback((t: ChartTheme) => hourlyOption(response, t), [response])
  const end = response.prediction.t0 + response.energy.cumulativeKwh.length * STEP_MS
  return (
    <>
      <Section title="Cumulative loss" description={`Expected energy (P50) lost until ${fmtDayTime(end)}.`} className="lg:col-span-6">
        <Chart option={cumulative} className="h-chart-sm" />
      </Section>
      <Section title="Loss per hour" description="Expected energy (P50) lost in each clock hour of the outage." className="lg:col-span-6">
        <Chart option={bars} className="h-chart-sm" />
      </Section>
    </>
  )
}
