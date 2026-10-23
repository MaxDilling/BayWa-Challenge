import { reaction } from 'mobx'
import { addDisposer, flow, toGenerator, types } from 'mobx-state-tree'
import { buildDataset, plausibility, toRequest, type Assignment, type Dataset, type PowerCurve, type Span, type WindSeries } from '@/data'
import { createEngine, requestedEngine, type AnalyzeResponse, type EngineHandle, type EngineId, type ModelInfo } from '@/engine'

export const STEPS = ['upload', 'outage', 'method', 'results', 'export'] as const
export type Step = (typeof STEPS)[number]

type Inputs = { target?: WindSeries; references?: WindSeries[]; powerCurve?: PowerCurve; nTurbines?: number }

/** Python errors arrive as a traceback; the last line is the message for people. */
const message = (e: unknown) => (e instanceof Error ? e.message : String(e)).trim().split('\n').pop()!

export const RootStore = types
  .model('RootStore', {
    target: types.frozen<WindSeries | undefined>(),
    references: types.frozen<WindSeries[]>([]),
    powerCurve: types.frozen<PowerCurve | undefined>(),
    nTurbines: 1,
    outage: types.frozen<Span | undefined>(),
    /** Empty until the engine lists its models; then the recommended one. */
    model: '',
    /** Every model's response for the current data and outage, so the Method step can compare them. */
    results: types.frozen<Record<string, AnalyzeResponse>>({}),
    failures: types.frozen<Record<string, string>>({}),
    step: types.optional(types.enumeration<Step>([...STEPS]), 'upload'),
  })
  .volatile(() => ({
    engine: undefined as EngineHandle | undefined,
    /** Set while an engine starts up. */
    engineProgress: undefined as { msg: string; pct: number } | undefined,
    models: [] as ModelInfo[],
    /** The last drop on the "all files" zone, kept to show and correct the assignment. */
    assignment: undefined as Assignment | undefined,
  }))
  .views((self) => ({
    get dataset(): Dataset | undefined {
      const { target, references, powerCurve, nTurbines } = self
      return target && powerCurve && references.length ? buildDataset(target, references, powerCurve, nTurbines) : undefined
    },
    get response(): AnalyzeResponse | undefined {
      return self.results[self.model]
    },
    get error(): string | undefined {
      return self.failures[self.model]
    },
    label(name: string) {
      return self.models.find((m) => m.name === name)?.label ?? name
    },
  }))
  .views((self) => ({
    get status(): 'idle' | 'running' | 'error' {
      if (self.response) return 'idle'
      if (self.error !== undefined) return 'error'
      return self.dataset && self.outage && self.engine ? 'running' : 'idle'
    },
    get warnings() {
      return self.dataset ? plausibility(self.dataset, self.outage, self.response?.explanation.diagnostics.r) : []
    },
  }))
  .actions((self) => ({
    setStep(step: Step) {
      self.step = step
    },
    setInputs(inputs: Inputs) {
      const reset = inputs.target !== undefined || inputs.references !== undefined
      Object.assign(self, inputs)
      if (reset) self.outage = self.dataset?.outages[0]
    },
    loadDataset({ target, references, powerCurve, nTurbines }: Dataset) {
      Object.assign(self, { target, references, powerCurve, nTurbines })
      self.assignment = undefined
      self.outage = self.dataset?.outages[0]
    },
    setOutage(outage: Span) {
      self.outage = outage
    },
    selectModel(model: string) {
      self.model = model
    },
    setEngineProgress(msg: string, pct: number) {
      self.engineProgress = { msg, pct }
    },
  }))
  .actions((self) => ({
    /** The series with this id from the last drop is the target, all others are references. */
    chooseTarget(id: string) {
      const series = self.assignment!.series
      self.setInputs({ target: series.find((s) => s.id === id), references: series.filter((s) => s.id !== id) })
    },
  }))
  .actions((self) => ({
    /** Files dropped together: take the power curve, and the target when exactly one series has an outage. */
    assign(assignment: Assignment) {
      self.assignment = assignment
      if (assignment.powerCurve) self.setInputs({ powerCurve: assignment.powerCurve })
      if (assignment.targetCandidates.length === 1) self.chooseTarget(assignment.targetCandidates[0])
    },
  }))
  .actions((self) => {
    let run = 0
    let engineCall = 0
    return {
      setEngine: flow(function* (id: EngineId) {
        const current = ++engineCall
        self.engineProgress = { msg: id === 'py' ? 'Starting Python engine' : 'Starting TypeScript engine', pct: 0 }
        const handle = yield* toGenerator(createEngine(id, (msg, pct) => current === engineCall && self.setEngineProgress(msg, pct)))
        const models = yield* toGenerator(handle.engine.listModels())
        if (current !== engineCall) return
        self.models = models
        if (!models.some((m) => m.name === self.model)) self.model = models.find((m) => m.recommended)!.name
        self.engine = handle
        self.engineProgress = undefined
      }),
      /** All models on the current data, the selected one first; a model change then only switches the view. */
      runAnalysis: flow(function* () {
        const { dataset, outage, engine, models, model } = self
        self.results = {}
        self.failures = {}
        if (!dataset || !outage || !engine) return
        const current = ++run
        for (const name of [model, ...models.map((m) => m.name).filter((m) => m !== model)]) {
          try {
            const response = yield* toGenerator(engine.engine.analyze(toRequest(dataset, outage, name)))
            if (current !== run) return
            self.results = { ...self.results, [name]: response }
          } catch (e) {
            if (current !== run) return
            self.failures = { ...self.failures, [name]: message(e) }
          }
        }
      }),
    }
  })
  .actions((self) => ({
    afterCreate() {
      addDisposer(
        self,
        reaction(
          () => [self.dataset, self.outage, self.engine],
          () => self.runAnalysis(),
        ),
      )
      self.setEngine(requestedEngine())
    },
  }))

export const store = RootStore.create()
