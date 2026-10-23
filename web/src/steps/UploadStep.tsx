import { Check, X } from 'lucide-react'
import { observer } from 'mobx-react-lite'
import { useCallback, useState, type ReactNode } from 'react'
import { Chart, type ChartTheme } from '@/components/charts/Chart'
import { DropZone, FileDrop, FileError } from '@/components/DropZone'
import { fmtDate, fmtDateTime, fmtNum, fmtPct, STEP_MS } from '@/components/format'
import { Section } from '@/components/Section'
import { Warnings } from '@/components/Warnings'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { assignFiles, loadDemo, parsePowerCurveCsv, parseWindCsv, turbineCount, type PowerCurve, type WindSeries } from '@/data'
import { cn } from '@/lib/utils'
import { store } from '@/state/store'

const WIND_HINT = 'CSV with a timestamp (Europe/Berlin) and the 10-minute wind speed in m/s.'

export const UploadStep = observer(function UploadStep() {
  const { warnings, assignment } = store
  return (
    <div className="flex flex-col gap-section">
      <AllFiles />
      <Warnings items={warnings.filter((w) => w.step === 'upload')} />
      <RoleZones key={assignment ? 'assigned' : 'by role'} />
    </div>
  )
})

/** The zones per role: open while files came in one role at a time, a disclosure once the all-files drop assigned them. */
const RoleZones = observer(function RoleZones() {
  const { target, references, powerCurve, response, assignment } = store
  const [open, setOpen] = useState(!assignment && !!(target || references.length || powerCurve))
  const d = response?.explanation.diagnostics
  return (
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer font-medium text-primary">
        {assignment ? 'Correct the assignment one role at a time' : 'Or add files one role at a time'}
      </summary>
      <div className="mt-3 grid gap-section lg:grid-cols-3">
        <DropZone
          title="Target farm"
          hint={`The farm with the outage. ${WIND_HINT}`}
          read={parseWindCsv}
          onRead={([[t, ...others]]) =>
            store.setInputs({ target: { ...t, report: { ...t.report, ignoredColumns: [...t.report.ignoredColumns, ...others.map((o) => o.id)] } } })
          }
        >
          {target && <SeriesReport series={target} />}
        </DropZone>
        <DropZone
          title="Reference farms"
          hint={`One or more neighbouring farms that kept measuring. ${WIND_HINT}`}
          multiple
          read={parseWindCsv}
          onRead={(files) => {
            const added = files.flat()
            store.setInputs({ references: [...references.filter((r) => !added.some((a) => a.id === r.id)), ...added] })
          }}
        >
          {references.map((ref, i) => (
            <SeriesReport
              key={ref.id}
              series={ref}
              correlation={d?.[`r_ref_${i}`] ?? (i === 0 ? d?.r : undefined)}
              onRemove={() => store.setInputs({ references: references.filter((x) => x !== ref) })}
            />
          ))}
        </DropZone>
        <DropZone
          title="Power curve"
          hint="CSV with wind speed (m/s) and power (kW) of one turbine."
          read={(name, text) => ({ curve: parsePowerCurveCsv(text), turbines: turbineCount(name, text), name })}
          onRead={([{ curve, turbines, name }]) => store.setPowerCurve(curve, turbines, name)}
        >
          {powerCurve && <CurveReport curve={powerCurve} />}
        </DropZone>
      </div>
    </details>
  )
})

async function assignDropped(files: File[]) {
  store.assign(assignFiles(await Promise.all(files.map(async (f) => ({ name: f.name, text: await f.text() })))))
}

const AllFiles = observer(function AllFiles() {
  const { assignment } = store
  return (
    <Section
      title="All files at once"
      description="Drop the target, the reference(s) and the power curve together. The power curve is the file without timestamps; the target is the series with the outage."
      action={<Button onClick={() => store.loadDataset(loadDemo())}>Load demo data</Button>}
    >
      <FileDrop multiple onFiles={assignDropped} className="gap-2 py-8 text-body">
        Drop all files here (target, reference(s), power curve) or <span className="font-medium text-primary">browse</span>
      </FileDrop>
      {assignment ? (
        <AssignmentView />
      ) : (
        !store.dataset && (
          <p className="text-label text-muted-foreground">
            No files at hand? The demo has one month of 10-minute data, one reference farm and a 30 h outage.
          </p>
        )
      )}
      {store.powerCurve && <TurbineDecision />}
    </Section>
  )
})

const AssignmentView = observer(function AssignmentView() {
  const { assignment, target, powerCurve } = store
  const { series, targetCandidates, errors } = assignment!
  const chosen = series.find((s) => s.id === target?.id)
  const ask = !chosen && series.length > 1
  return (
    <>
      {ask && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary bg-accent px-3 py-2.5 text-accent-foreground">
          <span className="font-medium">Which farm had the outage?</span>
          {(targetCandidates.length ? targetCandidates : series.map((s) => s.id)).map((id) => (
            <Button key={id} size="sm" variant="outline" onClick={() => store.chooseTarget(id)}>
              {id}
            </Button>
          ))}
        </div>
      )}
      <ul className="flex flex-col divide-y rounded-lg border text-label">
        {series.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="min-w-0">
              <span className="block truncate font-medium">{s.id}</span>
              <span className="block text-muted-foreground tabular-nums">{seriesLine(s)}</span>
            </span>
            {s === chosen ? (
              <Badge>Target</Badge>
            ) : (
              <span className="flex items-center gap-2">
                {chosen && <Badge variant="secondary">Reference</Badge>}
                <Button size="xs" variant="ghost" onClick={() => store.chooseTarget(s.id)}>
                  Make target
                </Button>
              </span>
            )}
          </li>
        ))}
        <li className="flex items-center justify-between gap-3 px-3 py-2">
          <span className="min-w-0">
            <span className="block font-medium">Power curve</span>
            {assignment!.powerCurveFile && <span className="block truncate text-muted-foreground">{assignment!.powerCurveFile}</span>}
          </span>
          {assignment!.powerCurve ? (
            <Badge variant="secondary">
              <Check /> found
            </Badge>
          ) : (
            <span className="text-muted-foreground">{powerCurve ? 'kept from before' : 'not among the files; add it below'}</span>
          )}
        </li>
      </ul>
      {errors.map((e) => (
        <FileError key={e.file} {...e} />
      ))}
    </>
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

/** The farm size multiplies every kWh, so it is a decision, highlighted until the user confirms it. */
const TurbineDecision = observer(function TurbineDecision() {
  const { nTurbines, turbinesConfirmed, turbinesSource, powerCurve } = store
  const [draft, setDraft] = useState<string>()
  const rated = Math.max(...powerCurve!.powerKw)
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2.5',
        !turbinesConfirmed && 'border-primary bg-accent text-accent-foreground',
      )}
    >
      <Label htmlFor="turbines" className="font-medium">
        {turbinesConfirmed ? 'Turbines in the target farm' : 'How many turbines does the target farm have?'}
      </Label>
      <Input
        id="turbines"
        type="number"
        min={1}
        step={1}
        className="w-20 bg-card tabular-nums"
        value={draft ?? nTurbines}
        onChange={(e) => {
          setDraft(e.target.value)
          const n = Number(e.target.value)
          if (Number.isInteger(n) && n >= 1) store.setTurbines(n)
        }}
        onBlur={() => setDraft(undefined)}
      />
      <span className="text-label tabular-nums">
        × {fmtNum(rated)} kW = <span className="font-medium">{fmtNum(rated * nTurbines)} kW</span> rated farm power
      </span>
      {!turbinesConfirmed && (
        <span className="flex items-center gap-3 sm:ml-auto">
          {turbinesSource && <span className="text-label">Read from {turbinesSource}</span>}
          <Button size="sm" onClick={() => store.setTurbines(nTurbines)}>
            Confirm {fmtNum(nTurbines)} turbine{nTurbines === 1 ? '' : 's'}
          </Button>
        </span>
      )}
    </div>
  )
})

function seriesLine({ grid, report }: WindSeries) {
  const steps = grid.values.length
  return `${fmtDate(grid.t0)} – ${fmtDate(grid.t0 + (steps - 1) * STEP_MS)} · ${fmtPct(report.missing / steps)} missing`
}
