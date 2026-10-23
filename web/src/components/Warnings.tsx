import { TriangleAlert } from 'lucide-react'
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { Warning } from '@/data'

const TONE = 'border-warning/40 bg-warning-soft *:[svg]:text-warning'

/** "2 data checks need attention" */
export const checksText = (n: number) => `${n} data check${n === 1 ? ' needs' : 's need'} attention`

/** Plausibility warnings from the import layer: worth a look, not errors. */
export function Warnings({ items }: { items: Warning[] }) {
  return items.map((w) => (
    <Alert key={w.title} className={TONE}>
      <TriangleAlert />
      <AlertTitle>{w.title}</AlertTitle>
      <AlertDescription>{w.detail}</AlertDescription>
    </Alert>
  ))
}

/** One line above a result the warnings may invalidate, with a jump to their details. */
export function WarningSummary({ items, detailsId }: { items: Warning[]; detailsId: string }) {
  return (
    <Alert className={TONE}>
      <TriangleAlert />
      <AlertTitle>{checksText(items.length)} before these numbers are used</AlertTitle>
      <AlertDescription>{items.map((w) => w.title).join(' · ')}</AlertDescription>
      <AlertAction>
        <Button size="sm" variant="outline" onClick={() => document.getElementById(detailsId)?.scrollIntoView({ behavior: 'smooth' })}>
          Details
        </Button>
      </AlertAction>
    </Alert>
  )
}
