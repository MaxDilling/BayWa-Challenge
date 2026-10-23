import { reaction } from 'mobx'
import { addDisposer, flow, toGenerator, types } from 'mobx-state-tree'
import { buildDataset, toRequest, type Dataset, type PowerCurve, type Span, type WindSeries } from '@/data'
import { createEngine, requestedEngine, type AnalyzeResponse, type EngineHandle, type EngineId } from '@/engine'

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
    model: 'linear_regression',
    response: types.frozen<AnalyzeResponse | undefined>(),
    status: types.optional(types.enumeration(['idle', 'running', 'error']), 'idle'),
    error: '',
    step: types.optional(types.enumeration<Step>([...STEPS]), 'upload'),
  })
  .volatile(() => ({
    engine: undefined as EngineHandle | undefined,
    /** Set while an engine starts up. */
    engineProgress: undefined as { msg: string; pct: number } | undefined,
    models: [] as string[],
  }))
  .views((self) => ({
    get dataset(): Dataset | undefined {
      const { target, references, powerCurve, nTurbines } = self
      return target && powerCurve && references.length ? buildDataset(target, references, powerCurve, nTurbines) : undefined
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
  .actions((self) => {
    let run = 0
    let engineCall = 0
    return {
      setEngine: flow(function* (id: EngineId) {
        const current = ++engineCall
        self.engineProgress = { msg: id === 'py' ? 'Starting Python engine' : 'Starting TypeScript engine', pct: 0 }
        const handle = yield* toGenerator(createEngine(id, (msg, pct) => current === engineCall && self.setEngineProgress(msg, pct)))
        const models = (yield* toGenerator(handle.engine.listModels())).map((m) => m.name)
        if (current !== engineCall) return
        self.models = models
        if (!models.includes(self.model)) self.model = models[0]
        self.engine = handle
        self.engineProgress = undefined
      }),
      runAnalysis: flow(function* () {
        const { dataset, outage, engine, model } = self
        self.response = undefined
        self.status = 'idle'
        if (!dataset || !outage || !engine) return
        const current = ++run
        self.status = 'running'
        try {
          const response = yield* toGenerator(engine.engine.analyze(toRequest(dataset, outage, model)))
          if (current !== run) return
          self.response = response
          self.status = 'idle'
        } catch (e) {
          if (current !== run) return
          self.status = 'error'
          self.error = message(e)
        }
      }),
    }
  })
  .actions((self) => ({
    afterCreate() {
      addDisposer(
        self,
        reaction(
          () => [self.dataset, self.outage, self.model, self.engine],
          () => self.runAnalysis(),
        ),
      )
      self.setEngine(requestedEngine())
    },
  }))

export const store = RootStore.create()
