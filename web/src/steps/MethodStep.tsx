import { observer } from 'mobx-react-lite'
import { useCallback } from 'react'
import { AnalysisState } from '@/components/AnalysisState'
import { Chart, type ChartTheme } from '@/components/charts/Chart'
import { fmtAmount, fmtDuration, fmtNum } from '@/components/format'
import { Formula } from '@/components/Formula'
import { Hint } from '@/components/Hint'
import { BENCHMARK } from '@/components/HowItWorks'
import { METRICS } from '@/components/metrics'
import { Section } from '@/components/Section'
import { Warnings } from '@/components/Warnings'
import { Badge } from '@/components/ui/badge'
import type { AnalyzeResponse, ModelInfo } from '@/engine'
import { cn } from '@/lib/utils'
import { store } from '@/state/store'

/** Plain names, units and explanations for the keys of `params` and `diagnostics`; other keys are shown as they come. */
const KEYS: Record<string, { label: string; unit?: string; digits: number; hint: string }> = {
  a: { label: 'Intercept a', unit: 'm/s', digits: 2, hint: 'Where the line starts: the predicted target wind when the reference is calm.' },
  b: { label: 'Slope b', digits: 3, hint: 'How much the target wind changes per 1 m/s of reference wind.' },
  r: { label: 'Correlation r', digits: 3, hint: 'How closely target and reference move together before the outage; 1 is perfect, below 0.7 is weak.' },
  lag_min: {
    label: 'Delay τ',
    unit: 'min',
    digits: 0,
    hint: 'How long the weather takes from one farm to the other. The model reads the reference this much earlier (later if negative).',
  },
  n_train: { label: 'Training values', unit: '× 10 min', digits: 0, hint: '10-minute values before the outage where both farms measured.' },
  sigma_0: {
    label: 'Uncertainty in calm wind',
    unit: 'm/s',
    digits: 2,
    hint: 'Width σ of the uncertainty at 0 m/s, measured on training data the model had not seen. The 80 % band is ±1.28 σ.',
  },
  sigma_slope: {
    label: 'Uncertainty growth',
    unit: 'm/s per m/s',
    digits: 3,
    hint: 'How much σ grows per 1 m/s of predicted wind: errors are larger in strong wind.',
  },
  error_memory_h: {
    label: 'How long errors persist',
    unit: 'h',
    digits: 1,
    hint: 'If the model is too high now, it tends to stay too high for about this long. The longer, the less errors cancel over an outage and the wider the energy range.',
  },
}

const COMPARED = [METRICS.energy_wape_pct, METRICS.wind_rmse, METRICS.coverage_80]
/** Reference choice and wake factors, shown in their own cards. */
const OWN_CARD = /^(reference_index|r_ref_\d+|wake_(factor|steps)_.+)$/
const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
const compass = (deg: number) => `${COMPASS[Math.round(deg / 22.5) % 16]} ${fmtNum(deg)}°`

/** Bonus 3: the model picks the reference that tracked the target best before the outage; this card shows why. */
const ReferenceChoice = observer(function ReferenceChoice({ response }: { response: AnalyzeResponse }) {
  const d = response.explanation.diagnostics
  const ranked = store.dataset!.references
    .map((ref, i) => ({ id: ref.id, r: d[`r_ref_${i}`], used: i === d.reference_index }))
    .sort((a, b) => (b.r ?? -1) - (a.r ?? -1))
  const used = ranked.find((x) => x.used)!
  return (
    <Section
      title="Reference farm"
      description={`We use ${used.id} because it tracked the target best before the outage: r = ${fmtNum(used.r, 3)}. Each farm is tried at its best delay τ; the others are not used.`}
      className="lg:col-span-12"
    >
      <ul className="flex flex-col gap-1.5 text-label">
        {ranked.map(({ id, r, used }) => (
          <li key={id} className="grid grid-cols-[minmax(0,12rem)_1fr_auto] items-center gap-3">
            <span className={cn('truncate', used && 'font-medium')}>{id}</span>
            <span className="h-2 rounded-full bg-muted">
              <span className={cn('block h-full rounded-full', used ? 'bg-reference' : 'bg-reference/40')} style={{ width: `${Math.max(r ?? 0, 0) * 100}%` }} />
            </span>
            <span className="flex items-center gap-2 tabular-nums">
              {r === undefined ? 'n/a' : `r = ${fmtNum(r, 3)}`}
              {used && <Badge>Used</Badge>}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  )
})

export const MethodStep = observer(function MethodStep() {
  const { response, warnings } = store
  const relevant = warnings.filter((w) => w.step === 'method')
  return (
    <div className="grid gap-section lg:grid-cols-12">
      <Comparison />
      {relevant.length > 0 && (
        <div className="flex flex-col gap-3 lg:col-span-12">
          <Warnings items={relevant} />
        </div>
      )}
      {response ? (
        <>
          {response.explanation.diagnostics.reference_index !== undefined && <ReferenceChoice response={response} />}
          <Explanation response={response} />
          <ScatterCard response={response} />
          {wakeSectors(response).length > 0 && <WakeCard response={response} />}
        </>
      ) : (
        <div className="lg:col-span-12">
          <AnalysisState />
        </div>
      )}
    </div>
  )
})

const Comparison = observer(function Comparison() {
  const { models, model, results, failures, outage } = store
  const folds = Object.values(results)[0]?.validation.n_folds
  return (
    <Section
      title="Methods on your data"
      description={
        outage && folds
          ? `Each method predicted ${fmtNum(folds)} simulated ${fmtDuration(outage.endMs - outage.startMs)} outages before this one; lower errors are better. Select a row to use that method.`
          : 'Select a row to use that method.'
      }
      className="lg:col-span-12"
    >
      <div className="overflow-x-auto">
        <table className="w-full text-left tabular-nums" role="radiogroup" aria-label="Method">
          <thead className="text-label text-muted-foreground">
            <tr className="border-b">
              <th className="py-2 pr-3 font-medium">Method</th>
              {COMPARED.map((m) => (
                <th key={m.key} className="px-3 py-2 text-right font-medium whitespace-nowrap">
                  <Hint label={m.label}>{m.hint}</Hint>
                </th>
              ))}
              <th className="py-2 pl-3 text-right font-medium whitespace-nowrap">Lost energy (10–90 %)</th>
            </tr>
          </thead>
          <tbody>
            {models.map((info) => (
              <ModelRow key={info.name} info={info} selected={info.name === model} response={results[info.name]} failure={failures[info.name]} />
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  )
})

function ModelRow({ info, selected, response, failure }: { info: ModelInfo; selected: boolean; response?: AnalyzeResponse; failure?: string }) {
  const cell = (text: string) => <td className="px-3 py-2.5 text-right whitespace-nowrap">{text}</td>
  const pending = failure ? 'failed' : '…'
  return (
    <tr
      role="radio"
      aria-checked={selected}
      tabIndex={0}
      onClick={() => store.selectModel(info.name)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && store.selectModel(info.name)}
      className={cn('cursor-pointer border-b transition-colors last:border-0 hover:bg-muted', selected && 'bg-accent text-accent-foreground hover:bg-accent')}
    >
      <td className="py-2.5 pr-3">
        <span className="flex flex-wrap items-center gap-2">
          <span className={cn('size-3 shrink-0 rounded-full border border-input', selected && 'border-4 border-primary')} aria-hidden />
          <span className="font-medium">{info.label}</span>
          {info.recommended && <Badge>Recommended</Badge>}
        </span>
        <span className="hidden pl-5 text-label text-muted-foreground sm:block">
          {info.tagline}
          {info.recommended && ` Best score on our benchmark of ${BENCHMARK.datasets} datasets (see How it works).`}
        </span>
      </td>
      {COMPARED.map((m) => cell(response ? (m.key in response.validation ? m.format(response.validation[m.key]) : 'n/a') : pending))}
      {cell(
        response
          ? `${fmtAmount(response.energy.kwhP50)} kWh (${fmtAmount(response.energy.kwhP10)}–${fmtAmount(response.energy.kwhP90)})`
          : pending,
      )}
    </tr>
  )
}

function Explanation({ response }: { response: AnalyzeResponse }) {
  const { formula, summary, params, diagnostics } = response.explanation
  const rows = Object.entries({ ...params, ...diagnostics }).filter(([key]) => !OWN_CARD.test(key))
  return (
    <Section title={store.label(store.model)} className="lg:col-span-4">
      <Formula tex={formula} />
      <p className="text-pretty">{summary}</p>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-t pt-3 text-label">
        {rows.map(([key, value]) => {
          const meta = KEYS[key]
          return (
            <div key={key} className="contents">
              <dt className="text-muted-foreground">{meta ? <Hint label={meta.label}>{meta.hint}</Hint> : key}</dt>
              <dd className="text-right font-medium tabular-nums">
                {fmtNum(value, meta?.digits ?? 3)}
                {meta?.unit && ` ${meta.unit}`}
              </dd>
            </div>
          )
        })}
      </dl>
    </Section>
  )
}

function scatterOption({ scatter, explanation }: AnalyzeResponse, t: ChartTheme) {
  const lag = explanation.diagnostics.lag_min ?? 0
  const reference = lag ? `Reference wind ${fmtNum(Math.abs(lag))} min ${lag > 0 ? 'earlier' : 'later'} (m/s)` : 'Reference wind (m/s)'
  const max = Math.ceil(Math.max(...scatter.ref, ...scatter.target, 1))
  return {
    legend: {},
    tooltip: {
      trigger: 'item',
      formatter: ({ seriesName, value }: { seriesName: string; value: [number, number] }) =>
        `<div class="text-label"><div class="font-medium">${seriesName}</div>Reference ${fmtNum(value[0], 2)} m/s · target ${fmtNum(value[1], 2)} m/s</div>`,
    },
    xAxis: { type: 'value', name: reference, nameLocation: 'middle', nameGap: t.label * 2, min: 0, max },
    yAxis: { type: 'value', name: 'Target wind (m/s)', nameLocation: 'middle', nameGap: t.label * 2.5, min: 0, max },
    grid: { left: t.label * 2, bottom: t.label * 2 },
    series: [
      {
        name: '10-min pairs before the outage',
        type: 'scatter',
        data: scatter.ref.map((r, i) => [r, scatter.target[i]]),
        symbolSize: t.point,
        itemStyle: { color: t.measured, opacity: t.bandOpacity },
      },
      {
        name: '1 : 1',
        type: 'line',
        data: [
          [0, 0],
          [max, max],
        ],
        lineStyle: { color: t.axis, width: t.lineThin, type: 'dashed' },
        itemStyle: { color: t.axis },
        silent: true,
      },
      {
        name: 'Model',
        type: 'line',
        data: scatter.fitLine,
        lineStyle: { color: t.prediction, width: t.line },
        itemStyle: { color: t.prediction },
      },
    ],
  }
}

function ScatterCard({ response }: { response: AnalyzeResponse }) {
  const option = useCallback((t: ChartTheme) => scatterOption(response, t), [response])
  const { r } = response.explanation.diagnostics
  return (
    <Section
      title="Target against reference"
      description="Each point is one 10-minute pair from before the outage, with the reference shifted by the delay τ, as the model sees it. The line is what the model predicts for each reference wind speed."
      action={
        r !== undefined && (
          <Badge variant="secondary" className="tabular-nums">
            r = {fmtNum(r, 3)}
          </Badge>
        )
      }
      className="lg:col-span-8"
    >
      <Chart option={option} className="h-chart" />
    </Section>
  )
}

/** The factor per wind direction sector (multi_regression): what the references cannot see, such as a neighbour's wake. */
function wakeSectors({ explanation: { params, diagnostics } }: AnalyzeResponse) {
  return Object.keys(params)
    .filter((k) => k.startsWith('wake_factor_'))
    .map((k) => {
      const deg = Number(k.slice('wake_factor_'.length))
      return { deg, factor: params[k], steps: diagnostics[`wake_steps_${k.slice('wake_factor_'.length)}`] }
    })
    .sort((a, b) => a.deg - b.deg)
}

function wakeOption(sectors: ReturnType<typeof wakeSectors>, t: ChartTheme) {
  return {
    grid: { left: t.label * 2.5, bottom: t.label * 2 },
    tooltip: {
      trigger: 'axis',
      formatter: ([{ dataIndex }]: { dataIndex: number }[]) => {
        const { deg, factor, steps } = sectors[dataIndex]
        return `<div class="text-label"><div class="font-medium">Wind from ${compass(deg)}</div>factor ${fmtNum(factor, 3)} · ${fmtNum(steps)} values before the outage</div>`
      },
    },
    xAxis: { type: 'category', data: sectors.map((s) => compass(s.deg)), name: 'Wind from', nameLocation: 'middle', nameGap: t.label * 1.8 },
    yAxis: { type: 'value', name: '% wind vs. references', axisLabel: { formatter: (v: number) => `${v > 0 ? '+' : ''}${v}` } },
    series: [
      {
        type: 'bar',
        data: sectors.map((s) => ({ value: (s.factor - 1) * 100, itemStyle: { color: s.factor < 1 ? t.outage : t.reference } })),
      },
    ],
  }
}

/** Bonus 2 in plain words: how much more or less wind the target sees from each direction than its references suggest. */
function WakeCard({ response }: { response: AnalyzeResponse }) {
  const sectors = wakeSectors(response)
  const option = useCallback((t: ChartTheme) => wakeOption(sectors, t), [sectors])
  const strongest = sectors.reduce((a, b) => (Math.abs(b.factor - 1) > Math.abs(a.factor - 1) ? b : a))
  const change = strongest.factor - 1
  return (
    <Section
      title="Wake and terrain by wind direction"
      description={
        <>
          From each direction, the target gets this much more or less wind than its references suggest; the model multiplies its prediction
          by that factor. Strongest: with wind from {compass(strongest.deg)} the target measures {fmtNum(Math.abs(change) * 100, 1)} %{' '}
          {change < 0 ? 'less' : 'more'} ({fmtNum(strongest.steps)} values before the outage)
          {change < 0 ? ', typical for the wake of a neighbouring turbine or terrain in that direction' : ''}. Directions with few values
          are pulled towards 0 %.
        </>
      }
      className="lg:col-span-12"
    >
      <Chart option={option} className="h-chart-sm" />
    </Section>
  )
}
