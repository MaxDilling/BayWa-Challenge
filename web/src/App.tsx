import { Check, ChevronLeft, ChevronRight, TriangleAlert, Wind } from 'lucide-react'
import { observer } from 'mobx-react-lite'
import type { ReactNode } from 'react'
import { EngineBar } from '@/components/EngineBar'
import { HowItWorks } from '@/components/HowItWorks'
import { fmtAmount, fmtDuration } from '@/components/format'
import { Button } from '@/components/ui/button'
import { checksText } from '@/components/Warnings'
import { TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { STEPS, store, type Step } from '@/state/store'
import { ExportStep } from '@/steps/ExportStep'
import { MethodStep } from '@/steps/MethodStep'
import { OutageStep } from '@/steps/OutageStep'
import { ResultsStep } from '@/steps/ResultsStep'
import { UploadStep } from '@/steps/UploadStep'

const STEP_INFO: Record<Step, { label: string; sentence?: string; View: () => ReactNode }> = {
  upload: {
    label: 'Upload',
    sentence: 'Add the 10-minute wind series of the affected farm and of one or more reference farms, plus the turbine power curve.',
    View: UploadStep,
  },
  outage: {
    label: 'Outage',
    View: OutageStep,
  },
  method: {
    label: 'Method',
    sentence: 'The model learns from the data before the outage how the target wind follows the reference wind.',
    View: MethodStep,
  },
  results: {
    label: 'Results',
    sentence: 'Predicted wind during the outage with its 80 % band, the backtested accuracy and the lost energy in kWh.',
    View: ResultsStep,
  },
  export: {
    label: 'Export',
    sentence: 'Download the prediction as CSV and copy a summary email for the insurer.',
    View: ExportStep,
  },
}

/** One line per step in the stepper: what has been decided there so far. */
function stepStatus(step: Step): string {
  const { dataset, outage, model, response, status } = store
  if (step === 'upload')
    return dataset ? `${store.targets.length} target${store.targets.length === 1 ? '' : 's'} · ${dataset.references.length} references` : 'Add files'
  if (!dataset) return '—'
  if (step === 'outage') return outage ? fmtDuration(outage.endMs - outage.startMs) : 'Select a period'
  if (step === 'method') return store.label(model)
  if (!store.turbinesConfirmed) return 'Confirm turbines'
  if (status === 'running') return 'Calculating…'
  if (step === 'results') return response ? `${fmtAmount(response.energy.kwhP50)} kWh lost` : status === 'error' ? 'Not available' : '—'
  return response ? 'CSV · email' : '—'
}

const Stepper = observer(function Stepper() {
  const current = STEPS.indexOf(store.step)
  const checks = store.response ? store.warnings.length : 0
  return (
    <nav aria-label="Steps" className="grid grid-cols-5 gap-2">
      {STEPS.map((step, i) => {
        const enabled = step === 'upload' || !!store.dataset
        const active = i === current
        return (
          <button
            key={step}
            type="button"
            disabled={!enabled}
            aria-current={active ? 'step' : undefined}
            onClick={() => store.setStep(step)}
            className={cn(
              'flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-left shadow-card transition-colors hover:border-primary disabled:pointer-events-none disabled:opacity-50',
              active && 'border-primary ring-1 ring-primary',
            )}
          >
            <span
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-full border text-label font-semibold',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : i < current
                    ? 'border-primary text-primary'
                    : 'text-muted-foreground',
              )}
            >
              {i < current ? <Check className="size-4" /> : i + 1}
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 font-medium">
                {STEP_INFO[step].label}
                {step === 'results' && checks > 0 && (
                  <TriangleAlert role="img" aria-label={checksText(checks)} className="size-3.5 text-warning" />
                )}
              </span>
              <span className="block truncate text-label text-muted-foreground tabular-nums">{stepStatus(step)}</span>
            </span>
          </button>
        )
      })}
    </nav>
  )
})

/** Several targets: steps 2–5 show one; each button carries that target's lost energy with the selected model. */
const TargetSwitch = observer(function TargetSwitch() {
  const { targets, target, resultsByTarget, model } = store
  return (
    <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Target">
      <span className="text-label text-muted-foreground">Target</span>
      {targets.map((t) => {
        const response = resultsByTarget[t.id]?.[model]
        return (
          <Button
            key={t.id}
            size="sm"
            role="radio"
            aria-checked={t === target}
            variant={t === target ? 'default' : 'outline'}
            onClick={() => store.selectTarget(t.id)}
          >
            {t.id}
            <span className="tabular-nums opacity-80">{response ? `${fmtAmount(response.energy.kwhP50)} kWh` : '…'}</span>
          </Button>
        )
      })}
    </div>
  )
})

export default observer(function App() {
  const index = STEPS.indexOf(store.step)
  const { label, sentence, View } = STEP_INFO[store.step]
  const go = (offset: number) => store.setStep(STEPS[index + offset])
  return (
    <TooltipProvider>
      <div className="flex min-h-svh flex-col">
        <header className="border-b bg-card">
          <div className="mx-auto flex max-w-page items-center gap-3 px-section py-4">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Wind className="size-5" />
            </span>
            <div>
              <h1 className="text-heading font-semibold">Wind Outage Tool</h1>
              <p className="text-label text-muted-foreground">
                Lost energy of a wind farm during an outage: the missing wind is predicted from a neighbouring reference farm and turned
                into kWh with the power curve.
              </p>
            </div>
            <HowItWorks />
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-page flex-1 flex-col gap-section px-section py-section">
          <Stepper />
          {store.step !== 'upload' && store.targets.length > 1 && <TargetSwitch />}
          <div>
            <h2 className="text-heading font-semibold">
              {index + 1}. {label}
            </h2>
            {sentence && <p className="text-muted-foreground">{sentence}</p>}
          </div>
          <View />
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => go(-1)} disabled={index === 0}>
              <ChevronLeft /> Back
            </Button>
            {index < STEPS.length - 1 && (
              <Button onClick={() => go(1)} disabled={!store.dataset}>
                {STEP_INFO[STEPS[index + 1]].label} <ChevronRight />
              </Button>
            )}
          </div>
        </main>
        <EngineBar />
      </div>
    </TooltipProvider>
  )
})
