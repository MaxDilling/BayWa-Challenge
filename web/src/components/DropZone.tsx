import { CircleAlert, FileUp } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Section } from '@/components/Section'
import { ImportError, readFiles } from '@/data'
import { cn } from '@/lib/utils'

interface Props<T> {
  title: string
  hint: string
  multiple?: boolean
  read: (name: string, text: string) => T
  onRead: (values: T[]) => void
  action?: ReactNode
  children?: ReactNode
}

/** Drop or browse CSV or Excel files; import errors are shown here, at the zone they belong to. */
export function DropZone<T>({ title, hint, multiple, read, onRead, action, children }: Props<T>) {
  const [error, setError] = useState<{ file: string; message: string }>()

  async function load(files: File[]) {
    const values: T[] = []
    for (const file of multiple ? files : files.slice(0, 1)) {
      try {
        for (const { name, text } of await readFiles([file])) values.push(read(name.replace(/\.[^.]+$/, ''), text))
      } catch (e) {
        if (!(e instanceof ImportError)) throw e
        return setError({ file: file.name, message: e.message })
      }
    }
    setError(undefined)
    if (values.length) onRead(values)
  }

  return (
    <Section title={title} description={hint} action={action}>
      <FileDrop multiple={multiple} onFiles={load}>
        Drop CSV or Excel {multiple ? 'files' : 'file'} here or <span className="font-medium text-primary">browse</span>
      </FileDrop>
      {error && <FileError {...error} />}
      {children}
    </Section>
  )
}

export function FileError({ file, message }: { file: string; message: string }) {
  return (
    <Alert variant="destructive" className="bg-destructive-soft">
      <CircleAlert />
      <AlertTitle>Could not read {file}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}

/** The drop target with a hidden file input behind it. */
export function FileDrop({ multiple, onFiles, className, children }: { multiple?: boolean; onFiles: (files: File[]) => void; className?: string; children: ReactNode }) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          onFiles([...e.dataTransfer.files])
        }}
        className={cn(
          'flex w-full flex-col items-center gap-1 rounded-lg border border-dashed border-input p-card-sm text-label text-muted-foreground transition-colors hover:border-primary hover:bg-accent',
          over && 'border-primary bg-accent text-accent-foreground',
          className,
        )}
      >
        <FileUp className="size-5 text-primary" />
        <span>{children}</span>
      </button>
      <input
        ref={input}
        type="file"
        accept=".csv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        multiple={multiple}
        hidden
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])])
          e.target.value = ''
        }}
      />
    </>
  )
}
