import { Check, X } from 'lucide-react'
import { observer } from 'mobx-react-lite'
import { useCallback, useState, type ReactNode } from 'react'
import { Chart, type ChartTheme } from '@/components/charts/Chart'
import { DropZone, FileDrop, FileError } from '@/components/DropZone'
import { fmtAmount, fmtDate, fmtDateTime, fmtNum, fmtPct, STEP_MS } from '@/components/format'
import { Section } from '@/components/Section'
import { Warnings } from '@/components/Warnings'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ImportError, KNOWN_CURVES, loadDemo, parsePowerCurveCsv, parseWindCsv, readFiles, turbineCount, type PowerCurve, type WindSeries } from '@/data'
import { cn } from '@/lib/utils'
import { ASK_TURBINES, store } from '@/state/store'

const WIND_HINT = 'CSV or Excel with a timestamp (Europe/Berlin) and the 10-minute wind speed in m/s; a wind direction column is used too.'

export const UploadStep = observer(function UploadStep() {
  const { warnings, assignment } = store
  return (
    <div className="flex flex-col gap-section">
      <AllFiles />
      <Warnings items={warnings.filter((w) => w.step === 'upload')} />
      <Stations />
      <RoleZones key={assignment ? 'assigned' : 'by role'} />
    </div>
  )
})

/** The zones per role: open while files came in one role at a time, a disclosure once the all-files drop assigned them. */
const RoleZones = observer(function RoleZones() {
  const { targets, references, powerCurve, response, assignment } = store
  const [open, setOpen] = useState(!assignment && !!(targets.length || references.length || powerCurve))
  const d = response?.explanation.diagnostics
  return (
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer font-medium text-primary">
        {assignment ? 'Correct the assignment one role at a time' : 'Or add files one role at a time'}
      </summary>
      <div className="mt-3 grid gap-section lg:grid-cols-3">
        <DropZone
          title="Target farm(s)"
          hint={`One or more farms or turbines with an outage, one file each. ${WIND_HINT}`}
          multiple
          read={parseWindCsv}
          onRead={(files) => {
            const added = files.map(([t, ...others]) => ({ ...t, report: { ...t.report, ignoredColumns: [...t.report.ignoredColumns, ...others.map((o) => o.id)] } }))
            store.setInputs({ targets: [...targets.filter((t) => !added.some((a) => a.id === t.id)), ...added] })
          }}
        >
          {targets.map((t) => (
            <SeriesReport key={t.id} series={t} onRemove={() => store.setInputs({ targets: targets.filter((x) => x !== t) })} />
          ))}
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
          read={(name, text) => ({ name, curve: parsePowerCurveCsv(text), turbines: turbineCount(name, text) })}
          onRead={([upload]) => store.setUploadedCurve(upload)}
        >
          {powerCurve && <CurveReport curve={powerCurve} />}
        </DropZone>
      </div>
    </details>
  )
})

const AllFiles = observer(function AllFiles() {
  const { assignment } = store
  const [unreadable, setUnreadable] = useState<{ file: string; message: string }[]>([])
  async function drop(files: File[]) {
    const read: Awaited<ReturnType<typeof readFiles>> = []
    const errors: typeof unreadable = []
    for (const file of files) {
      try {
        read.push(...(await readFiles([file])))
      } catch (e) {
        if (!(e instanceof ImportError)) throw e
        errors.push({ file: file.name, message: e.message })
      }
    }
    setUnreadable(errors)
    if (read.length) store.addFiles(read)
  }
  return (
    <Section
      title="All files at once"
      description="Drop the target(s), the reference(s) and the power curve, together or one after the other; CSV and Excel (.xlsx) both work. The power curve is the file without timestamps; targets are the series with an outage."
      action={<Button onClick={() => store.loadDataset(loadDemo())}>Load demo data</Button>}
    >
      <FileDrop multiple onFiles={drop} className="gap-2 py-8 text-body">
        Drop files here (targets, references, power curve) or <span className="font-medium text-primary">browse</span>
      </FileDrop>
      {unreadable.map((e) => (
        <FileError key={e.file} {...e} />
      ))}
      {assignment ? (
        <AssignmentView />
      ) : (
        !store.dataset && (
          <p className="text-label text-muted-foreground">
            No files at hand? The demo has one month of 10-minute data, one reference farm and a 30 h outage.
          </p>
        )
      )}
      <KnownCurves />
      {ASK_TURBINES && store.powerCurve && <TurbineDecision />}
    </Section>
  )
})

const KnownCurves = observer(function KnownCurves() {
  const { uploadedCurve } = store
  return (
    <div className="flex flex-wrap items-center gap-2 text-label">
      <span className="text-muted-foreground">{uploadedCurve ? 'Power curve' : 'No power curve file? Use the published curve of'}</span>
      {[...(uploadedCurve ? [uploadedCurve] : []), ...KNOWN_CURVES].map(({ name, curve }) => (
        <Button key={name} size="sm" variant={store.powerCurve === curve ? 'default' : 'outline'} onClick={() => store.chooseCurve(curve)}>
          {name}
        </Button>
      ))}
    </div>
  )
})

const AssignmentView = observer(function AssignmentView() {
  const { assignment, targets, powerCurve, files } = store
  const { series, fileOf, targetCandidates, powerCurveFile, errors } = assignment!
  const isTarget = (s: WindSeries) => targets.some((t) => t.id === s.id)
  const listed = new Set([...Object.values(fileOf), powerCurveFile])
  const ask = !targets.length && series.length > 1
  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5 text-label">
        <span className="text-muted-foreground">
          {fmtNum(files.length)} file{files.length === 1 ? '' : 's'}:
        </span>
        {files.map((f) => (
          <Badge key={f.name} variant="outline" className={cn('gap-1', !listed.has(f.name) && 'pr-0.5')}>
            {f.name}
            {!listed.has(f.name) && <RemoveFile file={f.name} />}
          </Badge>
        ))}
      </div>
      {ask && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary bg-accent px-3 py-2.5 text-accent-foreground">
          <span className="font-medium">Which farm had the outage?</span>
          {(targetCandidates.length ? targetCandidates : series.map((s) => s.id)).map((id) => (
            <Button key={id} size="sm" variant="outline" onClick={() => store.toggleTarget(id)}>
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
              <span className="block text-muted-foreground tabular-nums">
                {seriesLine(s)}
                {s.direction && ' · with wind direction'}
              </span>
            </span>
            <span className="flex items-center gap-2">
              {isTarget(s) ? <Badge>Target</Badge> : targets.length > 0 && <Badge variant="secondary">Reference</Badge>}
              <Button size="xs" variant="ghost" onClick={() => store.toggleTarget(s.id)}>
                {isTarget(s) ? 'Make reference' : 'Make target'}
              </Button>
              <RemoveFile file={fileOf[s.id]} />
            </span>
          </li>
        ))}
        <li className="flex items-center justify-between gap-3 px-3 py-2">
          <span className="min-w-0">
            <span className="block font-medium">Power curve</span>
            {powerCurveFile && <span className="block truncate text-muted-foreground">{powerCurveFile}</span>}
          </span>
          {powerCurveFile ? (
            <span className="flex items-center gap-2">
              <Badge variant="secondary">
                <Check /> found
              </Badge>
              <RemoveFile file={powerCurveFile} />
            </span>
          ) : (
            <span className="text-muted-foreground">{powerCurve ? 'kept from before' : 'not among the files; pick a turbine or add it below'}</span>
          )}
        </li>
      </ul>
      {errors.map((e) => (
        <FileError key={e.file} {...e} />
      ))}
    </>
  )
})

/** Removes a dropped file with every series it holds. */
function RemoveFile({ file }: { file: string }) {
  return (
    <Button variant="ghost" size="icon-xs" onClick={() => store.removeFile(file)} aria-label={`Remove ${file}`} title={`Remove ${file}`}>
      <X />
    </Button>
  )
}

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
    tooltip: { trigger: 'axis', valueFormatter: (v: number) => `${fmtAmount(v)} kW` },
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
          ['Rated power', `${fmtAmount(rated)} kW per turbine · ${fmtAmount(rated * store.nTurbines)} kW farm`],
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
        × {fmtAmount(rated)} kW = <span className="font-medium">{fmtAmount(rated * nTurbines)} kW</span> rated farm power
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

/** DWD weather stations around the challenge farms as extra references; off unless chosen. */
const Stations = observer(function Stations() {
  const { dwd, stations, target, outage } = store
  const [open, setOpen] = useState(stations.length > 0)
  const end = (s: WindSeries) => s.grid.t0 + s.grid.values.length * STEP_MS
  const covers = (s: WindSeries) => !outage || (s.grid.t0 <= outage.startMs && end(s) >= outage.endMs)
  return (
    <details
      open={open}
      onToggle={(e) => {
        setOpen(e.currentTarget.open)
        if (e.currentTarget.open) store.loadStations()
      }}
    >
      <summary className="cursor-pointer font-medium text-primary">Add DWD weather stations as references</summary>
      <Section
        title="DWD weather stations"
        className="mt-3"
        description={
          <>
            Wind measured by Germany&apos;s weather service around the challenge farms, at about 10 m height and 10 to 150 km away, from{' '}
            {dwd.length ? `${fmtDate(dwd[0].grid.t0)} to ${fmtDate(end(dwd[0]) - STEP_MS)}` : 'July to September 2026'}. On the challenge data
            they did not beat the reference turbines; they help when no reference farm measured. Chosen stations count as references for
            every target.
          </>
        }
      >
        <div className="flex flex-wrap gap-2">
          {dwd.map((s) => (
            <Button
              key={s.id}
              size="sm"
              variant={stations.includes(s.id) ? 'default' : 'outline'}
              disabled={!covers(s) && !stations.includes(s.id)}
              title={covers(s) ? seriesLine(s) : `Does not cover the outage of ${target?.id}`}
              onClick={() => store.toggleStation(s.id)}
            >
              {s.id.replace('DWD_', '')}
            </Button>
          ))}
        </div>
      </Section>
    </details>
  )
})
