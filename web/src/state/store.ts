import { reaction } from 'mobx'
import { addDisposer, flow, toGenerator, types } from 'mobx-state-tree'
import {
  assignFiles,
  buildDataset,
  loadStations,
  plausibility,
  toRequest,
  type Assignment,
  type Dataset,
  type PowerCurve,
  type Span,
  type WindSeries,
} from '@/data'
import { createEngine, requestedEngine, type AnalyzeResponse, type EngineHandle, type EngineId, type ModelInfo } from '@/engine'

export const STEPS = ['upload', 'outage', 'method', 'results', 'export'] as const
export type Step = (typeof STEPS)[number]

type Inputs = { targets?: WindSeries[]; references?: WindSeries[] }
export type UploadedCurve = { name: string; curve: PowerCurve; turbines?: number }

/** Every target is one turbine (team decision, 24.10.); true brings back the turbine count as a decision on the Upload step. */
export const ASK_TURBINES = false
export type DroppedFile = { name: string; text: string }

/** Python errors arrive as a traceback; the last line without the exception type is the message for people. */
const message = (e: unknown) =>
  (e instanceof Error ? e.message : String(e)).trim().split('\n').pop()!.replace(/^\w+Error: /, '')

export const RootStore = types
  .model('RootStore', {
    /** Everything dropped on the all-files zone, by name; a workbook's sheets count as files of their own. */
    files: types.frozen<DroppedFile[]>([]),
    targets: types.frozen<WindSeries[]>([]),
    /** True once the user picked targets among the dropped files; then further drops keep them. */
    targetsChosen: false,
    references: types.frozen<WindSeries[]>([]),
    /** Ids of the DWD stations used as extra references. */
    stations: types.frozen<string[]>([]),
    powerCurve: types.frozen<PowerCurve | undefined>(),
    nTurbines: 1,
    /** False after a power curve came from files: the turbine count is a decision the user must make. */
    turbinesConfirmed: true,
    /** Id of the target that steps 2–5 show. */
    active: '',
    /** Each target's outage, by target id. */
    outages: types.frozen<Record<string, Span>>({}),
    /** Empty until the engine lists its models; then the recommended one. */
    model: '',
    /** Every model's response per target for the current data and outages, so the Method step can compare them. */
    resultsByTarget: types.frozen<Record<string, Record<string, AnalyzeResponse>>>({}),
    failuresByTarget: types.frozen<Record<string, Record<string, string>>>({}),
    step: types.optional(types.enumeration<Step>([...STEPS]), 'upload'),
  })
  .volatile(() => ({
    engine: undefined as EngineHandle | undefined,
    /** Set while an engine starts up. */
    engineProgress: undefined as { msg: string; pct: number } | undefined,
    models: [] as ModelInfo[],
    /** The assignment of `files`, kept to show and correct it. */
    assignment: undefined as Assignment | undefined,
    /** Where the proposed turbine count was read, e.g. the power curve's file name. */
    turbinesSource: undefined as string | undefined,
    /** The dropped file the uploaded curve came from; undefined for one added by role. */
    powerCurveFile: undefined as string | undefined,
    /** The power curve from a file, offered next to the built-in ones. */
    uploadedCurve: undefined as UploadedCurve | undefined,
    /** The DWD stations on offer, empty until loaded. */
    dwd: [] as WindSeries[],
  }))
  .views((self) => ({
    get target(): WindSeries | undefined {
      return self.targets.find((t) => t.id === self.active) ?? self.targets[0]
    },
    /** References of every target: the uploaded ones and the chosen DWD stations. */
    get usedReferences(): WindSeries[] {
      return [...self.references, ...self.dwd.filter((s) => self.stations.includes(s.id))]
    },
    label(name: string) {
      return self.models.find((m) => m.name === name)?.label ?? name
    },
  }))
  .views((self) => ({
    get datasets(): Record<string, Dataset> {
      const { powerCurve, nTurbines, usedReferences } = self
      if (!powerCurve || !usedReferences.length) return {}
      return Object.fromEntries(self.targets.map((t) => [t.id, buildDataset(t, usedReferences, powerCurve, nTurbines)]))
    },
    get outage(): Span | undefined {
      return self.target && self.outages[self.target.id]
    },
    /** Every model's response for the target on view. */
    get results(): Record<string, AnalyzeResponse> {
      return (self.target && self.resultsByTarget[self.target.id]) ?? {}
    },
    get failures(): Record<string, string> {
      return (self.target && self.failuresByTarget[self.target.id]) ?? {}
    },
  }))
  .views((self) => ({
    get dataset(): Dataset | undefined {
      return self.target && self.datasets[self.target.id]
    },
    get response(): AnalyzeResponse | undefined {
      return self.results[self.model]
    },
    get error(): string | undefined {
      return self.failures[self.model]
    },
  }))
  .views((self) => ({
    get status(): 'idle' | 'running' | 'error' {
      if (self.response) return 'idle'
      if (self.error !== undefined) return 'error'
      return self.dataset && self.outage && self.engine && self.turbinesConfirmed ? 'running' : 'idle'
    },
    get warnings() {
      return self.dataset ? plausibility(self.dataset, self.outage, self.response?.explanation.diagnostics.r) : []
    },
  }))
  .actions((self) => ({
    setStep(step: Step) {
      self.step = step
    },
    /** The first detected outage for every target that has none; a target without an outage gets none. */
    fillOutages() {
      self.outages = Object.fromEntries(
        self.targets.flatMap((t) => {
          const outage = self.outages[t.id] ?? self.datasets[t.id]?.outages[0]
          return outage ? [[t.id, outage]] : []
        }),
      )
      if (!self.targets.some((t) => t.id === self.active)) self.active = self.targets[0]?.id ?? ''
    },
  }))
  .actions((self) => ({
    /** New targets or references: every target's outage is detected afresh. */
    setInputs(inputs: Inputs) {
      Object.assign(self, inputs)
      self.outages = {}
      self.fillOutages()
    },
    /** A power curve from a file is chosen; when its file is gone, so is the choice of it, not that of a built-in curve. */
    setUploadedCurve(upload: UploadedCurve | undefined) {
      if (upload || self.powerCurve === self.uploadedCurve?.curve) self.powerCurve = upload?.curve
      self.uploadedCurve = upload
      self.powerCurveFile = undefined
      if (ASK_TURBINES && upload) {
        if (upload.turbines) self.nTurbines = upload.turbines
        self.turbinesSource = upload.turbines ? upload.name : undefined
        self.turbinesConfirmed = false
      }
      self.fillOutages()
    },
    /** The uploaded curve or a built-in one, by button. */
    chooseCurve(curve: PowerCurve) {
      self.powerCurve = curve
      if (ASK_TURBINES) self.turbinesConfirmed = false
      self.fillOutages()
    },
    setTurbines(n: number) {
      self.nTurbines = n
      self.turbinesConfirmed = true
    },
    setOutage(outage: Span) {
      self.outages = { ...self.outages, [self.target!.id]: outage }
    },
    selectTarget(id: string) {
      self.active = id
    },
    selectModel(model: string) {
      self.model = model
    },
    setEngineProgress(msg: string, pct: number) {
      self.engineProgress = { msg, pct }
    },
    setStations(dwd: WindSeries[]) {
      self.dwd = dwd
    },
  }))
  .actions((self) => ({
    loadDataset({ target, references, powerCurve, nTurbines }: Dataset) {
      Object.assign(self, { files: [], stations: [], targetsChosen: false, powerCurve, nTurbines, turbinesConfirmed: true })
      self.assignment = undefined
      self.turbinesSource = undefined
      self.powerCurveFile = undefined
      self.uploadedCurve = undefined
      self.setInputs({ targets: [target], references })
    },
    /** Assign all dropped files again: targets the user chose stay while their series exist, else the assignment's. */
    reassign() {
      const assignment = self.files.length ? assignFiles(self.files) : undefined
      self.assignment = assignment
      const series = assignment?.series ?? []
      if (assignment?.powerCurve && assignment.powerCurveFile !== self.powerCurveFile) {
        self.setUploadedCurve({ name: assignment.powerCurveFile!, curve: assignment.powerCurve, turbines: assignment.turbines })
        self.powerCurveFile = assignment.powerCurveFile
      } else if (!assignment?.powerCurve && self.powerCurveFile) self.setUploadedCurve(undefined)
      const kept = self.targets.filter((t) => series.some((s) => s.id === t.id)).map((t) => t.id)
      self.targetsChosen &&= kept.length > 0
      const ids = self.targetsChosen ? kept : (assignment?.targets ?? [])
      self.setInputs({ targets: series.filter((s) => ids.includes(s.id)), references: series.filter((s) => !ids.includes(s.id)) })
    },
  }))
  .actions((self) => ({
    /** Dropped files join the ones before; a file with the same name replaces its namesake. */
    addFiles(files: DroppedFile[]) {
      self.files = [...self.files.filter((f) => !files.some((n) => n.name === f.name)), ...files]
      self.reassign()
    },
    removeFile(name: string) {
      self.files = self.files.filter((f) => f.name !== name)
      self.reassign()
    },
    /** A series from the dropped files becomes a target, or a target becomes a reference again. */
    toggleTarget(id: string) {
      const series = self.assignment!.series
      const ids = self.targets.some((t) => t.id === id) ? self.targets.filter((t) => t.id !== id).map((t) => t.id) : [...self.targets.map((t) => t.id), id]
      const outages = self.outages
      self.targetsChosen = true
      self.setInputs({ targets: series.filter((s) => ids.includes(s.id)), references: series.filter((s) => !ids.includes(s.id)) })
      self.outages = { ...self.outages, ...Object.fromEntries(Object.entries(outages).filter(([t]) => ids.includes(t))) }
    },
    toggleStation(id: string) {
      self.stations = self.stations.includes(id) ? self.stations.filter((s) => s !== id) : [...self.stations, id]
      self.fillOutages()
    },
  }))
  .actions((self) => {
    let run = 0
    let engineCall = 0
    return {
      loadStations: flow(function* () {
        if (!self.dwd.length) self.setStations(yield* toGenerator(loadStations()))
      }),
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
      /** All models for every target, the target on view and the selected model first; a model or target change then
       * only switches the view. */
      runAnalysis: flow(function* () {
        const { datasets, outages, engine, models, model, turbinesConfirmed, target } = self
        self.resultsByTarget = {}
        self.failuresByTarget = {}
        if (!engine || !turbinesConfirmed || !target) return
        const current = ++run
        for (const id of [target.id, ...self.targets.map((t) => t.id).filter((t) => t !== target.id)]) {
          const dataset = datasets[id]
          const outage = outages[id]
          if (!dataset || !outage) continue
          for (const name of [model, ...models.map((m) => m.name).filter((m) => m !== model)]) {
            try {
              const response = yield* toGenerator(engine.engine.analyze(toRequest(dataset, outage, name)))
              if (current !== run) return
              self.resultsByTarget = { ...self.resultsByTarget, [id]: { ...self.resultsByTarget[id], [name]: response } }
            } catch (e) {
              if (current !== run) return
              self.failuresByTarget = { ...self.failuresByTarget, [id]: { ...self.failuresByTarget[id], [name]: message(e) } }
            }
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
          () => [self.datasets, self.outages, self.engine, self.turbinesConfirmed],
          () => self.runAnalysis(),
        ),
      )
      self.setEngine(requestedEngine())
    },
  }))

export const store = RootStore.create()
