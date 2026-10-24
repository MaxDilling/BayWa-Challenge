import { color, type ECharts } from 'echarts/core'
import { CircleAlert } from 'lucide-react'
import { observer } from 'mobx-react-lite'
import { useCallback, useState, type ReactNode } from 'react'
import { AnalysisState } from '@/components/AnalysisState'
import { Chart, type ChartTheme } from '@/components/charts/Chart'
import { byId, dash, gridPoints, tooltipHtml } from '@/components/charts/series'
import { axisTimes, fmtDayTime, fmtDuration, fmtNum, fromLocalInput, STEP_MS, toLocalInput } from '@/components/format'
import { Notice } from '@/components/Notice'
import { Section } from '@/components/Section'
import { Warnings } from '@/components/Warnings'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Dataset, Span } from '@/data'
import { cn } from '@/lib/utils'
import { store } from '@/state/store'

const same = (a?: Span, b?: Span) => a?.startMs === b?.startMs && a?.endMs === b?.endMs

export const OutageStep = observer(function OutageStep() {
  const { dataset, outage, warnings } = store
  if (!dataset) return <AnalysisState />
  const datasets = store.shown
  const detected = datasets
    .flatMap((d) => d.outages)
    .filter((o, i, all) => all.findIndex((x) => same(x, o)) === i)
    .map((o) => ({ ...o, ids: datasets.filter((d) => d.outages.some((x) => same(x, o))).map((d) => d.target.id) }))
  const failed = store.cases.filter((c) => c.failure !== undefined && datasets.some((d) => d.target.id === c.id))
  return (
    <div className="flex flex-col gap-section">
      <Section
        title="Detected outages"
        description={`Runs of at least 30 min without target data while a reference farm was measuring.${datasets.length > 1 ? ' The outage you pick applies to every target.' : ''}`}
      >
        {detected.length ? (
          <div className="flex flex-wrap gap-2">
            {detected.map((o) => (
              <button
                key={`${o.startMs}-${o.endMs}`}
                type="button"
                aria-pressed={same(o, outage)}
                onClick={() => store.setOutage(o)}
                className={cn(
                  'flex flex-col rounded-lg border px-3 py-2 text-left transition-colors hover:border-primary',
                  same(o, outage) && 'border-primary bg-accent text-accent-foreground',
                )}
              >
                <span className="font-medium tabular-nums">Duration: {fmtDuration(o.endMs - o.startMs)}</span>
                <span className="text-label text-muted-foreground">
                  {fmtDayTime(o.startMs)} – {fmtDayTime(o.endMs)}
                  {datasets.length > 1 && ` · ${o.ids.join(', ')}`}
                </span>
              </button>
            ))}
            {outage && !detected.some((o) => same(o, outage)) && (
              <span className="flex flex-col justify-center rounded-lg border border-primary bg-accent px-3 py-2 text-accent-foreground">
                <span className="font-medium">Custom period</span>
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
        description="Click a detected outage or drag across the chart to set the outage, drag its edges to fine-tune; zoom with the slider."
      >
        <Timeline datasets={datasets} outage={outage} />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-label text-muted-foreground">
          <Swatch className="bg-outage-edge/40">Selected outage</Swatch>
          <Swatch className="bg-outage">Other detected outages</Swatch>
          <Swatch className="bg-gap">Measurement gaps under 30 min ({fmtNum(datasets.reduce((n, d) => n + d.gaps.length, 0))})</Swatch>
        </div>
        {outage && <PeriodFields outage={outage} />}
      </Section>
      <Warnings items={warnings.filter((w) => w.step === 'outage')} />
      {failed.length > 0 && (
        <Alert variant="destructive" className="bg-destructive-soft">
          <CircleAlert />
          <AlertTitle>The analysis cannot run for this period</AlertTitle>
          <AlertDescription>{failed.map((c) => (datasets.length > 1 ? `${c.id}: ${c.failure}` : c.failure)).join(' ')}</AlertDescription>
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

const timeAxis = (ticks: number[]) => ({ axisLabel: { customValues: ticks }, axisTick: { customValues: ticks } })

/** First and last time of all series: the extent of the timeline's x axis. */
function extent(datasets: Dataset[]): [number, number] {
  const grids = [...datasets.map((d) => d.target), ...datasets[0].references].map((s) => s.grid)
  return [Math.min(...grids.map((g) => g.t0)), Math.max(...grids.map((g) => g.t0 + (g.values.length - 1) * STEP_MS))]
}

/** Several datasets share their references (every target uses the same) and lie on top of each other. */
function timelineOption(datasets: Dataset[], t: ChartTheme) {
  const refs = datasets[0].references
  const name = (d: Dataset) => (datasets.length > 1 ? d.target.id : 'Target')
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
          ...datasets.map((d, k) => ({ color: t.measured, name: name(d), value: ms(v.get(`target-${k}`)) })),
          ...refs.map((r, i) => ({ color: t.reference, name: r.id, value: ms(v.get(`ref-${i}`)) })),
        ])
      },
    },
    xAxis: { type: 'time', ...timeAxis(axisTimes(...extent(datasets))) },
    yAxis: { type: 'value', name: 'm/s', min: 0 },
    dataZoom: [{ type: 'slider', height: t.label * 2, bottom: t.label * 0.5 }],
    brush: {
      xAxisIndex: 0,
      brushType: 'lineX',
      brushMode: 'single',
      transformable: true,
      outOfBrush: { colorAlpha: 1 },
      brushStyle: { color: color.modifyAlpha(t.outageEdge, t.bandOpacity), borderColor: t.outageEdge, borderWidth: t.lineThin },
    },
    series: [
      ...refs.map((r, i) => ({
        id: `ref-${i}`,
        name: refs.length > 1 ? 'Reference farms' : 'Reference',
        type: 'line',
        data: gridPoints(r.grid),
        lineStyle: { color: t.reference, width: t.lineThin, type: i ? 'dashed' : 'solid' },
        itemStyle: { color: t.reference },
      })),
      ...datasets.map((d, k) => ({
        id: `target-${k}`,
        name: `${name(d)} (measured)`,
        type: 'line',
        data: gridPoints(d.target.grid),
        lineStyle: { color: t.measured, width: t.lineThin, type: dash(k) },
        itemStyle: { color: t.measured },
        markArea: { silent: true, data: [...areas(d.gaps, t.gap), ...areas(d.outages, t.outage)] },
      })),
    ],
  }
}

function Timeline({ datasets, outage }: { datasets: Dataset[]; outage?: Span }) {
  const option = useCallback((t: ChartTheme) => timelineOption(datasets, t), [datasets])
  const onChart = useCallback(
    (chart: ECharts) => {
      const draw = () =>
        chart.dispatchAction({
          type: 'brush',
          areas: outage ? [{ brushType: 'lineX', xAxisIndex: 0, coordRange: [outage.startMs, outage.endMs] }] : [],
        })
      chart.dispatchAction({ type: 'takeGlobalCursor', key: 'brush', brushOption: { brushType: 'lineX', brushMode: 'single' } })
      draw()
      chart.off('datazoom')
      chart.on('datazoom', () => {
        const [from, to] = extent(datasets)
        const { start, end } = (chart.getOption() as { dataZoom: { start: number; end: number }[] }).dataZoom[0]
        chart.setOption({ xAxis: timeAxis(axisTimes(from + ((to - from) * start) / 100, from + ((to - from) * end) / 100)) })
      })
      chart.getZr().off('click')
      chart.getZr().on('click', ({ offsetX, offsetY }) => {
        if (!chart.containPixel({ gridIndex: 0 }, [offsetX, offsetY])) return
        const ms = chart.convertFromPixel({ xAxisIndex: 0 }, offsetX)
        const hit = datasets.flatMap((d) => d.outages).find((o) => o.startMs <= ms && ms < o.endMs)
        if (hit) store.setOutage(hit)
      })
      chart.off('brushEnd')
      chart.on('brushEnd', (e) => {
        const [area] = (e as { areas: { coordRange: [number, number] }[] }).areas
        const [startMs, endMs] = area ? area.coordRange.map((v) => Math.round(v / STEP_MS) * STEP_MS) : [0, 0]
        if (endMs > startMs) store.setOutage({ startMs, endMs })
        else draw()
      })
    },
    [datasets, outage],
  )
  return <Chart option={option} onChart={onChart} className="h-chart" />
}

function PeriodFields({ outage }: { outage: Span }) {
  return (
    <div className="flex flex-wrap items-end gap-4 border-t pt-3">
      <DateField
        label="Start (Europe/Berlin)"
        ms={outage.startMs}
        commit={(startMs) => (startMs < outage.endMs ? store.setOutage({ ...outage, startMs }) : 'The start must be before the end.')}
      />
      <DateField
        label="End (Europe/Berlin)"
        ms={outage.endMs}
        commit={(endMs) => (endMs > outage.startMs ? store.setOutage({ ...outage, endMs }) : 'The end must be after the start.')}
      />
      <p className="pb-2 text-label text-muted-foreground tabular-nums">
        Total time <span className="font-medium text-foreground">{fmtDuration(outage.endMs - outage.startMs)}</span>
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
