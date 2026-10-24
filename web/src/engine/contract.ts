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
  /** grid is complete during the outage: gap filling happens at import, not in the engine. direction: degrees,
   * temperature: °C, pressure: hPa, gaps allowed. */
  references: { id: string; grid: Grid; direction?: Grid; temperature?: Grid; pressure?: Grid }[]
  /** °C and hPa at the target, for the air density (S4). */
  targetTemperature?: Grid
  targetPressure?: Grid
  powerCurve: { windMs: number[]; powerKw: number[]; nTurbines: number }
  /** endMs exclusive */
  outage: { startMs: number; endMs: number }
  /** Registry name, e.g. "sector_regression" */
  model: string
  params?: Record<string, number | string>
}

export interface AnalyzeResponse {
  prediction: { t0: number; stepS: 600; mean: number[]; q10: number[]; q90: number[] }
  /** Backtest metrics of simulated outages before the real one, each fitted on the data on both sides of it, e.g. wind_rmse, energy_dev_pct, coverage_80. Absent = not computable. */
  validation: Record<string, number>
  explanation: {
    summary: string
    formula: string
    params: Record<string, number>
    diagnostics: Record<string, number>
  }
  /** P10 = 10 % quantile (low), P90 = 90 % quantile (high). airDensity: absent without a correction (S4); kgM3 = mean
   * density at the target in the outage, ratio = target / reference density outside it, kwhP50AtCurveDensity = P50 at
   * the 1.225 kg/m³ of the power curve. */
  energy: {
    kwhP10: number
    kwhP50: number
    kwhP90: number
    cumulativeKwh: number[]
    /** P50 of the same fitted model predicted without wind direction (wake factor 1); absent when no reference has a direction. */
    kwhP50WithoutDirection?: number
    airDensity?: { kgM3: number; ratio: number; kwhP50AtCurveDensity: number }
  }
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
