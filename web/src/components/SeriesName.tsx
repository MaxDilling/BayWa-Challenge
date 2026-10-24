import { Pencil } from 'lucide-react'
import { observer } from 'mobx-react-lite'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { store } from '@/state/store'

/** A series' name; double-click it or the pencil to rename it. Enter or leaving the field keeps the name, Escape drops it. */
export const SeriesName = observer(function SeriesName({ id }: { id: string }) {
  const [draft, setDraft] = useState<string>()
  const [error, setError] = useState<string>()
  const name = store.nameOf(id)
  const close = () => {
    setDraft(undefined)
    setError(undefined)
  }
  const commit = () => {
    const problem = store.rename(id, draft!)
    if (problem) setError(problem)
    else close()
  }
  if (draft === undefined)
    return (
      <span className="flex min-w-0 items-center gap-1" onDoubleClick={() => setDraft(name)} title={name === id ? undefined : `From the files: ${id}`}>
        <span className="truncate font-medium">{name}</span>
        <Button variant="ghost" size="icon-xs" aria-label={`Rename ${name}`} className="text-muted-foreground" onClick={() => setDraft(name)}>
          <Pencil />
        </Button>
      </span>
    )
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <Input
        autoFocus
        value={draft}
        aria-label={`New name for ${name}`}
        aria-invalid={!!error}
        className="h-7 w-56 text-label"
        onChange={(e) => {
          setDraft(e.target.value)
          setError(undefined)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') close()
        }}
        onBlur={commit}
      />
      {error && <span className="text-label text-destructive">{error}</span>}
    </span>
  )
})
