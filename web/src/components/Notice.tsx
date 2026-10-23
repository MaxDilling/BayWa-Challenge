import { CircleAlert, Inbox, LoaderCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

const TONES = {
  empty: { Icon: Inbox, className: 'text-muted-foreground' },
  loading: { Icon: LoaderCircle, className: 'text-primary [&>svg]:animate-spin' },
  error: { Icon: CircleAlert, className: 'text-destructive' },
}

interface Props {
  tone: keyof typeof TONES
  title: string
  children?: ReactNode
  /** 0–100, shown as a bar under the text */
  progress?: number
  action?: ReactNode
}

/** Designed empty, loading and error states. */
export function Notice({ tone, title, children, progress, action }: Props) {
  const { Icon, className: toneClass } = TONES[tone]
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-card text-center',
        tone === 'error' && 'border-destructive/40 bg-destructive-soft',
      )}
    >
      <span className={toneClass}>
        <Icon className="size-6" />
      </span>
      <p className="font-medium">{title}</p>
      {children && <div className="max-w-prose text-label text-muted-foreground">{children}</div>}
      {progress !== undefined && <Progress value={progress} className="w-48" />}
      {action}
    </div>
  )
}
