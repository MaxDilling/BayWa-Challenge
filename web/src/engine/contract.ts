// Engine contract S5 (SPEC.md). Mirrors windgap/engine.py; change SPEC.md first, then both sides.

export type EngineId = 'py' | 'ts'

/** Fixed 10-minute grid. t0 = UTC epoch ms, null = missing. */
export interface Grid {
  t0: number
  stepS: 600
  values: (number | null)[]
}

export interface ModelInfo {
  /** Registry id, e.g. "linear_regression"; used in requests and file names. */
  name: string
  /** For people, e.g. "Linear regression (MCP)". */
  label: string
  /** One line on what the model does. */
  tagline: string
  /** Exactly one model: the default, chosen by the harness. */
  recommended: boolean
}

export interface AnalyzeRequest {
  target: Grid
  /** Complete during the outage: gap filling happens at import, not in the engine. */
  references: { id: string; grid: Grid }[]
  powerCurve: { windMs: number[]; powerKw: number[]; nTurbines: number }
  /** endMs exclusive */
  outage: { startMs: number; endMs: number }
  /** Registry name, e.g. "variance_ratio" */
  model: string
  params?: Record<string, number | string>
}

export interface AnalyzeResponse {
  prediction: { t0: number; stepS: 600; mean: number[]; q10: number[]; q90: number[] }
  /** Backtest metrics on the data before the outage, e.g. wind_rmse, energy_dev_pct, coverage_80. Absent = not computable. */
  validation: Record<string, number>
  explanation: {
    summary: string
    formula: string
    params: Record<string, number>
    diagnostics: Record<string, number>
  }
  /** P10 = 10 % quantile (low), P90 = 90 % quantile (high). */
  energy: { kwhP10: number; kwhP50: number; kwhP90: number; cumulativeKwh: number[] }
  /** Training pairs as the model sees them: target(t) vs. the chosen reference (diagnostics.reference_index) at t − τ (τ = diagnostics.lag_min), max. 2000 points. */
  scatter: { ref: number[]; target: number[]; fitLine: [number, number][] }
  engine: { id: EngineId; version: string; ms: number }
}

export interface Engine {
  id: EngineId
  init(onProgress?: (msg: string, pct: number) => void): Promise<void>
  listModels(): Promise<ModelInfo[]>
  analyze(req: AnalyzeRequest): Promise<AnalyzeResponse>
}

/** A file in fixtures/golden/<model>/<case>.json, written by `make fixtures`. */
export interface GoldenCase {
  request: AnalyzeRequest
  response: Omit<AnalyzeResponse, 'engine'>
}
