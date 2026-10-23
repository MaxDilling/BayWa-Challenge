import { color, type ECharts } from 'echarts/core'
import { CircleAlert } from 'lucide-react'
import { observer } from 'mobx-react-lite'
import { useCallback, useState, type ReactNode } from 'react'
import { AnalysisState } from '@/components/AnalysisState'
import { Chart, type ChartTheme } from '@/components/charts/Chart'
import { byId, gridPoints, tooltipHtml } from '@/components/charts/series'
import { fmtDayTime, fmtDuration, fmtNum, fromLocalInput, STEP_MS, toLocalInput } from '@/components/format'
import { Notice } from '@/components/Notice'
import { Section } from '@/components/Section'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Dataset, Span } from '@/data'
import { cn } from '@/lib/utils'
import { store } from '@/state/store'

const same = (a?: Span, b?: Span) => a?.startMs === b?.startMs && a?.endMs === b?.endMs

export const OutageStep = observer(function OutageStep() {
  const { dataset, outage, status, error } = store
  if (!dataset) return <AnalysisState />
  return (
    <div className="flex flex-col gap-section">
      <Section
        title="Detected outages"
        description="Runs of at least 30 min without target data while a reference farm was measuring. The longest one is preselected."
      >
        {dataset.outages.length ? (
          <div className="flex flex-wrap gap-2">
            {dataset.outages.map((o) => (
              <button
                key={o.startMs}
                type="button"
                aria-pressed={same(o, outage)}
                onClick={() => store.setOutage(o)}
                className={cn(
                  'flex flex-col rounded-lg border px-3 py-2 text-left transition-colors hover:border-primary',
                  same(o, outage) && 'border-primary bg-accent text-accent-foreground',
                )}
              >
                <span className="font-medium tabular-nums">{fmtDuration(o.endMs - o.startMs)}</span>
                <span className="text-label text-muted-foreground">
                  {fmtDayTime(o.startMs)} – {fmtDayTime(o.endMs)}
                </span>
              </button>
            ))}
            {outage && !dataset.outages.some((o) => same(o, outage)) && (
              <span className="flex flex-col justify-center rounded-lg border border-primary bg-accent px-3 py-2 text-accent-foreground">
                <span className="font-medium">Custom period</span>
                <span className="text-label">set on the timeline</span>
              </span>
            )}
          </div>
        ) : (
          <Notice tone="empty" title="No outage detected">
            The target series has no gap of 30 min or more. Drag across the timeline below to mark the outage period.
          </Notice>
        )}
      </Section>
      <Section
        title="Timeline"
        description={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>Drag across the chart to set the outage, drag its edges to fine-tune; zoom with the slider.</span>
            <Swatch className="bg-outage-edge/40">Selected outage</Swatch>
            <Swatch className="bg-outage">Other detected outages</Swatch>
            <Swatch className="bg-gap">Measurement gaps under 30 min ({fmtNum(dataset.gaps.length)})</Swatch>
          </span>
        }
      >
        <Timeline dataset={dataset} outage={outage} />
        {outage && <PeriodFields outage={outage} />}
      </Section>
      {status === 'error' && (
        <Alert variant="destructive" className="bg-destructive-soft">
          <CircleAlert />
          <AlertTitle>The analysis cannot run for this period</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  )
})

function Swatch({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('inline-block size-3 rounded-sm border border-border', className)} />
      {children}
    </span>
  )
}

function timelineOption(dataset: Dataset, t: ChartTheme) {
  const refs = dataset.references
  const areas = (spans: Span[], fill: string) => spans.map((s) => [{ xAxis: s.startMs, itemStyle: { color: fill } }, { xAxis: s.endMs }])
  return {
    legend: {},
    grid: { bottom: t.label * 4.5 },
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        const v = byId(params)
        const ms = (x: number | null | undefined) => (x == null ? 'missing' : `${fmtNum(x, 2)} m/s`)
        return tooltipHtml((params as { axisValue: number }[])[0].axisValue, [
          { color: t.measured, name: 'Target', value: ms(v.get('target')) },
          ...refs.map((r, i) => ({ color: t.reference, name: r.id, value: ms(v.get(`ref-${i}`)) })),
        ])
      },
    },
    xAxis: { type: 'time' },
    yAxis: { type: 'value', name: 'm/s', min: 0 },
    dataZoom: [{ type: 'slider', height: t.label * 2, bottom: t.label * 0.5 }],
    brush: {
      xAxisIndex: 0,
      brushType: 'lineX',
      brushMode: 'single',
      toolbox: [],
      transformable: true,
      outOfBrush: { colorAlpha: 1 },
      brushStyle: { color: color.modifyAlpha(t.outageEdge, t.bandOpacity), borderColor: t.outageEdge, borderWidth: t.lineThin },
    },
    series: [
      ...refs.map((r, i) => ({
        id: `ref-${i}`,
        name: refs.length > 1 ? r.id : 'Reference',
        type: 'line',
        data: gridPoints(r.grid),
        lineStyle: { color: t.reference, width: t.lineThin, type: i ? 'dashed' : 'solid' },
        itemStyle: { color: t.reference },
      })),
      {
        id: 'target',
        name: 'Target (measured)',
        type: 'line',
        data: gridPoints(dataset.target.grid),
        lineStyle: { color: t.measured, width: t.lineThin },
        itemStyle: { color: t.measured },
        markArea: { silent: true, data: [...areas(dataset.gaps, t.gap), ...areas(dataset.outages, t.outage)] },
      },
    ],
  }
}

function Timeline({ dataset, outage }: { dataset: Dataset; outage?: Span }) {
  const option = useCallback((t: ChartTheme) => timelineOption(dataset, t), [dataset])
  const onChart = useCallback(
    (chart: ECharts) => {
      const draw = () =>
        chart.dispatchAction({
          type: 'brush',
          areas: outage ? [{ brushType: 'lineX', xAxisIndex: 0, coordRange: [outage.startMs, outage.endMs] }] : [],
        })
      chart.dispatchAction({ type: 'takeGlobalCursor', key: 'brush', brushOption: { brushType: 'lineX', brushMode: 'single' } })
      draw()
      chart.off('brushEnd')
      chart.on('brushEnd', (e) => {
        const [area] = (e as { areas: { coordRange: [number, number] }[] }).areas
        const [startMs, endMs] = area ? area.coordRange.map((v) => Math.round(v / STEP_MS) * STEP_MS) : [0, 0]
        if (endMs > startMs) store.setOutage({ startMs, endMs })
        else draw()
      })
    },
    [outage],
  )
  return <Chart option={option} onChart={onChart} className="h-chart" />
}

function PeriodFields({ outage }: { outage: Span }) {
  const steps = (outage.endMs - outage.startMs) / STEP_MS
  return (
    <div className="flex flex-wrap items-end gap-4 border-t pt-3">
      <DateField
        label="Start (Europe/Berlin)"
        ms={outage.startMs}
        commit={(startMs) => (startMs < outage.endMs ? store.setOutage({ ...outage, startMs }) : 'The start must be before the end.')}
      />
      <DateField
        label="End, exclusive (Europe/Berlin)"
        ms={outage.endMs}
        commit={(endMs) => (endMs > outage.startMs ? store.setOutage({ ...outage, endMs }) : 'The end must be after the start.')}
      />
      <p className="pb-2 text-label text-muted-foreground tabular-nums">
        <span className="font-medium text-foreground">{fmtDuration(outage.endMs - outage.startMs)}</span> · {fmtNum(steps)} values of 10 min
        to predict
      </p>
    </div>
  )
}

/** A Berlin wall-clock field; `commit` returns an error message when the value is not acceptable. */
function DateField({ label, ms, commit }: { label: string; ms: number; commit: (ms: number) => string | void }) {
  const [draft, setDraft] = useState<string>()
  const [error, setError] = useState<string>()
  const id = label.replace(/\W+/g, '-')
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="text-label text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        type="datetime-local"
        step={600}
        className="w-auto tabular-nums"
        value={draft ?? toLocalInput(ms)}
        aria-invalid={!!error}
        onChange={(e) => {
          setDraft(e.target.value)
          const utc = fromLocalInput(e.target.value)
          setError(utc === undefined ? 'Not a valid time in Europe/Berlin.' : (commit(utc) ?? undefined))
        }}
        onBlur={() => {
          setDraft(undefined)
          setError(undefined)
        }}
      />
      {error && <p className="text-label text-destructive">{error}</p>}
    </div>
  )
}
