import { Info } from 'lucide-react'
import type { ReactNode } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/** A label with an info icon that explains it on hover or focus. */
export function Hint({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      <Tooltip>
        <TooltipTrigger aria-label="Explain">
          <Info className="size-3.5" />
        </TooltipTrigger>
        <TooltipContent className="max-w-72">{children}</TooltipContent>
      </Tooltip>
    </span>
  )
}
