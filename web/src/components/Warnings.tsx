import { TriangleAlert } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import type { Warning } from '@/data'

/** Plausibility warnings from the import layer: worth a look, not errors. */
export function Warnings({ items }: { items: Warning[] }) {
  return items.map((w) => (
    <Alert key={w.title} className="border-warning/40 bg-warning-soft *:[svg]:text-warning">
      <TriangleAlert />
      <AlertTitle>{w.title}</AlertTitle>
      <AlertDescription>{w.detail}</AlertDescription>
    </Alert>
  ))
}
