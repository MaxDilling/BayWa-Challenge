import { useEffect, useState } from 'react'
import { createEngine, demoCase, type AnalyzeResponse, type EngineHandle } from '@/engine'

export default function App() {
  const [progress, setProgress] = useState('Starting engine')
  const [handle, setHandle] = useState<EngineHandle>()
  const [response, setResponse] = useState<AnalyzeResponse>()
  const [error, setError] = useState<string>()
  const [startMs, setStartMs] = useState<number>()

  useEffect(() => {
    const t0 = performance.now()
    createEngine(undefined, (msg, pct) => setProgress(`${msg} (${pct} %)`))
      .then(async (h) => {
        setStartMs(performance.now() - t0)
        setHandle(h)
        setResponse(await h.engine.analyze(demoCase.request))
      })
      .catch((e) => setError(String(e)))
  }, [])

  return (
    <main className="mx-auto max-w-5xl p-6 font-mono text-sm" data-testid="spike">
      <h1 className="mb-4 font-sans text-2xl font-semibold">Wind Outage Tool</h1>
      <p>{progress}</p>
      {handle?.fallback && <p className="text-amber-600">{handle.fallback}</p>}
      {startMs !== undefined && <p>engine start: {Math.round(startMs)} ms</p>}
      {response && (
        <p data-testid="result">
          engine {response.engine.id} {response.engine.version}, {Math.round(response.engine.ms)} ms · energy P50{' '}
          {response.energy.kwhP50.toFixed(1)} kWh · wind RMSE {response.validation.wind_rmse?.toFixed(3)} m/s
        </p>
      )}
      {error && <p className="text-red-600">{error}</p>}
    </main>
  )
}
