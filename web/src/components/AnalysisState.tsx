import { observer } from 'mobx-react-lite'
import { Notice } from '@/components/Notice'
import { Button } from '@/components/ui/button'
import { loadDemo } from '@/data'
import { store } from '@/state/store'

/** What the result steps show until there is a response: missing input, engine start, running, error. */
export const AnalysisState = observer(function AnalysisState() {
  const { dataset, outage, engine, engineProgress, status, error } = store
  if (!dataset)
    return (
      <Notice
        tone="empty"
        title="No data yet"
        action={
          <div className="flex gap-2">
            <Button onClick={() => store.loadDataset(loadDemo())}>Load demo data</Button>
            <Button variant="outline" onClick={() => store.setStep('upload')}>
              Upload files
            </Button>
          </div>
        }
      >
        Upload the target and reference wind series and a power curve, or try the demo data.
      </Notice>
    )
  if (!outage)
    return (
      <Notice tone="empty" title="No outage selected" action={<Button onClick={() => store.setStep('outage')}>Select the outage</Button>}>
        The target series has no gap of 30 min or more. Mark the outage period on the timeline.
      </Notice>
    )
  if (!engine)
    return (
      <Notice tone="loading" title={engineProgress?.msg ?? 'Starting the engine'} progress={engineProgress?.pct}>
        The first start loads Python, numpy and pandas into your browser, which takes a few seconds. Upload and outage selection keep
        working meanwhile.
      </Notice>
    )
  if (status === 'error')
    return (
      <Notice
        tone="error"
        title="The analysis could not run"
        action={
          <Button variant="outline" onClick={() => store.setStep('outage')}>
            Check the outage
          </Button>
        }
      >
        {error}
      </Notice>
    )
  return <Notice tone="loading" title="Calculating…" />
})
