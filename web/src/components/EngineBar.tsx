import { Cpu, LoaderCircle, Moon, Sun, TriangleAlert } from 'lucide-react'
import { observer } from 'mobx-react-lite'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { fmtNum } from '@/components/format'
import type { EngineId } from '@/engine'
import { store } from '@/state/store'

const SINGLE_FILE = import.meta.env.MODE === 'single'
const NAMES: Record<EngineId, string> = { py: 'Python (windgap in Pyodide)', ts: 'TypeScript port' }

/** Footer: active engine, version, run time, the py/ts switch and the fallback notice. */
export const EngineBar = observer(function EngineBar() {
  const { engine, engineProgress, response } = store
  return (
    <footer className="border-t bg-card">
      <div className="mx-auto flex max-w-page flex-wrap items-center gap-x-5 gap-y-2 px-section py-3 text-label text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Cpu className="size-4" />
          Engine <strong className="font-medium text-foreground">{engine ? NAMES[engine.engine.id] : 'starting'}</strong>
        </span>
        {response && (
          <span className="tabular-nums">
            windgap {response.engine.version} · last run {fmtNum(response.engine.ms)} ms
          </span>
        )}
        {engineProgress && (
          <span className="flex items-center gap-2" role="status">
            <LoaderCircle className="size-4 animate-spin text-primary" />
            {engineProgress.msg}
            <Progress value={engineProgress.pct} className="w-24" />
          </span>
        )}
        {engine?.fallback && (
          <span
            className="flex min-w-0 max-w-xl items-center gap-1.5 rounded-md bg-warning-soft px-2 py-1 text-warning"
            role="status"
            title={engine.fallback}
          >
            <TriangleAlert className="size-4 shrink-0" />
            <span className="truncate">Python failed to start, the TypeScript port took over: {engine.fallback}</span>
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={engine?.engine.id ?? ''}
            onValueChange={(id) => id && store.setEngine(id as EngineId)}
            aria-label="Engine"
            className="[&_[data-state=on]]:bg-accent [&_[data-state=on]]:text-accent-foreground"
          >
            <ToggleGroupItem
              value="py"
              disabled={SINGLE_FILE}
              title={SINGLE_FILE ? 'Python needs windgap-web/ over http://' : 'Python, the same code as our test harness'}
            >
              Python
            </ToggleGroupItem>
            <ToggleGroupItem value="ts" title="TypeScript port, identical results">
              TypeScript
            </ToggleGroupItem>
          </ToggleGroup>
          <ThemeToggle />
        </div>
      </div>
    </footer>
  )
})

function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  const toggle = () => setDark(document.documentElement.classList.toggle('dark'))
  return (
    <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label={dark ? 'Light mode' : 'Dark mode'}>
      {dark ? <Sun /> : <Moon />}
    </Button>
  )
}
