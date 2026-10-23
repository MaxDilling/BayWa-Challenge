import { Sparkles, X } from 'lucide-react'
import { observer } from 'mobx-react-lite'
import { useCallback, useState, type ReactNode } from 'react'
import { Chart, type ChartTheme } from '@/components/charts/Chart'
import { DropZone } from '@/components/DropZone'
import { fmtDateTime, fmtNum, fmtPct, STEP_MS } from '@/components/format'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { loadDemo, parsePowerCurveCsv, parseWindCsv, type PowerCurve, type WindSeries } from '@/data'
import { store } from '@/state/store'

const WIND_HINT = 'CSV with a timestamp (Europe/Berlin) and the 10-minute wind speed in m/s.'

export const UploadStep = observer(function UploadStep() {
  const { target, references, powerCurve, response } = store
  const r = response?.explanation.diagnostics.r
  return (
    <div className="flex flex-col gap-section">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-accent px-card py-3 text-accent-foreground">
        <span className="flex items-center gap-2">
          <Sparkles className="size-4" />
          No files at hand? The demo has one month of 10-minute data, one reference farm and a 30 h outage.
        </span>
        <Button onClick={() => store.loadDataset(loadDemo())}>Load demo data</Button>
      </div>
      <div className="grid gap-section lg:grid-cols-3">
        <DropZone
          title="Target farm"
          hint={`The farm with the outage. ${WIND_HINT}`}
          read={parseWindCsv}
          onRead={([t]) => store.setInputs({ target: t })}
        >
          {target && <SeriesReport series={target} />}
        </DropZone>
        <DropZone
          title="Reference farms"
          hint={`One or more neighbouring farms that kept measuring. ${WIND_HINT}`}
          multiple
          read={parseWindCsv}
          onRead={(added) => store.setInputs({ references: [...references.filter((r) => !added.some((a) => a.id === r.id)), ...added] })}
        >
          {references.map((ref, i) => (
            <SeriesReport
              key={ref.id}
              series={ref}
              correlation={i === 0 ? r : undefined}
              onRemove={() => store.setInputs({ references: references.filter((x) => x !== ref) })}
            />
          ))}
        </DropZone>
        <DropZone
          title="Power curve"
          hint="CSV with wind speed (m/s) and power (kW) of one turbine."
          read={(_, text) => parsePowerCurveCsv(text)}
          onRead={([curve]) => store.setInputs({ powerCurve: curve })}
        >
          <TurbineCount />
          {powerCurve && <CurveReport curve={powerCurve} />}
        </DropZone>
      </div>
    </div>
  )
})

function Facts({ title, action, rows }: { title: string; action?: ReactNode; rows: [string, ReactNode][] }) {
  return (
    <div className="rounded-lg bg-muted px-3 py-2.5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="truncate font-medium">{title}</span>
        {action}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-label">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function SeriesReport({ series, correlation, onRemove }: { series: WindSeries; correlation?: number; onRemove?: () => void }) {
  const { grid, report } = series
  const steps = grid.values.length
  const rows: [string, ReactNode][] = [
    ['First value', fmtDateTime(grid.t0)],
    ['Last value', fmtDateTime(grid.t0 + (steps - 1) * STEP_MS)],
    ['Values', `${fmtNum(report.measured)} of ${fmtNum(steps)} × 10 min`],
    ['Missing', `${fmtNum(report.missing)} (${fmtPct(report.missing / steps)})`],
  ]
  if (report.negative) rows.push(['Negative', `${fmtNum(report.negative)}, counted as missing`])
  if (report.ignoredColumns.length) rows.push(['Ignored columns', report.ignoredColumns.join(', ')])
  if (correlation !== undefined) rows.push(['Correlation r', `${fmtNum(correlation, 3)} with the target, before the outage`])
  return (
    <Facts
      title={series.id}
      rows={rows}
      action={
        onRemove && (
          <Button variant="ghost" size="icon-xs" onClick={onRemove} aria-label={`Remove ${series.id}`}>
            <X />
          </Button>
        )
      }
    />
  )
}

function curveOption({ windMs, powerKw }: PowerCurve, t: ChartTheme) {
  return {
    grid: { top: t.label, left: t.label * 0.5 },
    tooltip: { trigger: 'axis', valueFormatter: (v: number) => `${fmtNum(v)} kW` },
    xAxis: { type: 'value', name: 'm/s', min: 0 },
    yAxis: { type: 'value', name: 'kW', splitNumber: 2 },
    series: [{ type: 'line', data: windMs.map((v, i) => [v, powerKw[i]]), lineStyle: { color: t.prediction, width: t.line } }],
  }
}

const CurveReport = observer(function CurveReport({ curve }: { curve: PowerCurve }) {
  const option = useCallback((t: ChartTheme) => curveOption(curve, t), [curve])
  const rated = Math.max(...curve.powerKw)
  const producing = curve.windMs.filter((_, i) => curve.powerKw[i] > 0)
  return (
    <>
      <Facts
        title="Turbine power curve"
        rows={[
          ['Points', fmtNum(curve.windMs.length)],
          ['Rated power', `${fmtNum(rated)} kW per turbine · ${fmtNum(rated * store.nTurbines)} kW farm`],
          ['Producing', producing.length ? `${fmtNum(producing[0], 1)} to ${fmtNum(producing[producing.length - 1], 1)} m/s` : 'never'],
        ]}
      />
      <Chart option={option} className="h-chart-xs" />
    </>
  )
})

const TurbineCount = observer(function TurbineCount() {
  const [draft, setDraft] = useState<string>()
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor="turbines">Turbines in the target farm</Label>
      <Input
        id="turbines"
        type="number"
        min={1}
        step={1}
        className="w-24 tabular-nums"
        value={draft ?? store.nTurbines}
        onChange={(e) => {
          setDraft(e.target.value)
          const n = Number(e.target.value)
          if (Number.isInteger(n) && n >= 1) store.setInputs({ nTurbines: n })
        }}
        onBlur={() => setDraft(undefined)}
      />
    </div>
  )
})
