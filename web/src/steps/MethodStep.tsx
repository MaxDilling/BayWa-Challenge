import { CircleCheck } from 'lucide-react'
import { observer } from 'mobx-react-lite'
import { useCallback } from 'react'
import { AnalysisState } from '@/components/AnalysisState'
import { Chart, type ChartTheme } from '@/components/charts/Chart'
import { fmtNum } from '@/components/format'
import { Formula } from '@/components/Formula'
import { Section } from '@/components/Section'
import { Badge } from '@/components/ui/badge'
import type { AnalyzeResponse } from '@/engine'
import { cn } from '@/lib/utils'
import { store } from '@/state/store'

/** Names and units for the keys of `params` and `diagnostics`; other keys are shown as they come. */
const KEYS: Record<string, { label: string; unit?: string; digits: number }> = {
  r: { label: 'Correlation r', digits: 3 },
  n_train: { label: 'Training pairs', unit: '× 10 min', digits: 0 },
  sigma: { label: 'Spread σ', unit: 'm/s', digits: 2 },
}

export const MethodStep = observer(function MethodStep() {
  const { response, models, model } = store
  return (
    <div className="grid gap-section lg:grid-cols-12">
      <Section title="Model" description="Every model is explained by one formula and two sentences." className="lg:col-span-4">
        <div className="flex flex-col gap-2" role="radiogroup" aria-label="Model">
          {models.map((name) => (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={name === model}
              onClick={() => store.selectModel(name)}
              className={cn(
                'flex items-center justify-between rounded-lg border px-3 py-2 text-left font-medium transition-colors hover:border-primary',
                name === model && 'border-primary bg-accent text-accent-foreground',
              )}
            >
              {name}
              {name === model && <CircleCheck className="size-4 text-primary" />}
            </button>
          ))}
        </div>
        {response && <Explanation response={response} />}
      </Section>
      {response ? (
        <ScatterCard response={response} />
      ) : (
        <div className="lg:col-span-8">
          <AnalysisState />
        </div>
      )}
    </div>
  )
})

function Explanation({ response }: { response: AnalyzeResponse }) {
  const { formula, summary, params, diagnostics } = response.explanation
  const rows = Object.entries({ ...params, ...diagnostics })
  return (
    <>
      <Formula tex={formula} />
      <p className="text-pretty">{summary}</p>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 border-t pt-3 text-label">
        {rows.map(([key, value]) => {
          const meta = KEYS[key] ?? { label: key, digits: 3 }
          return (
            <div key={key} className="contents">
              <dt className="text-muted-foreground">{meta.label}</dt>
              <dd className="text-right font-medium tabular-nums">
                {fmtNum(value, meta.digits)}
                {meta.unit && ` ${meta.unit}`}
              </dd>
            </div>
          )
        })}
      </dl>
    </>
  )
}

function scatterOption({ scatter }: AnalyzeResponse, t: ChartTheme) {
  const max = Math.ceil(Math.max(...scatter.ref, ...scatter.target, 1))
  return {
    legend: {},
    tooltip: {
      trigger: 'item',
      formatter: ({ seriesName, value }: { seriesName: string; value: [number, number] }) =>
        `<div class="text-label"><div class="font-medium">${seriesName}</div>Reference ${fmtNum(value[0], 2)} m/s · target ${fmtNum(value[1], 2)} m/s</div>`,
    },
    xAxis: { type: 'value', name: 'Reference wind (m/s)', nameLocation: 'middle', nameGap: t.label * 2, min: 0, max },
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
      description="Each point is one 10-minute pair from before the outage; the model line is what it predicts for each reference wind speed."
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
