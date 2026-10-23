import type { ReactNode } from 'react'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface Props {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
  children: ReactNode
}

/** A titled card: the building block of every step. */
export function Section({ title, description, action, className, children }: Props) {
  return (
    <Card className={cn('shadow-card', className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription className="text-label">{description}</CardDescription>}
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">{children}</CardContent>
    </Card>
  )
}
