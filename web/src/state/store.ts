import { reaction } from 'mobx'
import { addDisposer, flow, toGenerator, types } from 'mobx-state-tree'
import {
  assignFiles,
  buildDataset,
  defaultCurve,
  DEMO_FILES,
  KNOWN_CURVES,
  loadStations,
  plausibility,
  toRequest,
  site,
  type Assignment,
  type CurveOption,
  type Dataset,
  type Span,
  type WindSeries,
} from '@/data'
import { createEngine, requestedEngine, type AnalyzeResponse, type EngineHandle, type EngineId, type ModelInfo } from '@/engine'

export const STEPS = ['upload', 'outage', 'method', 'results', 'export'] as const
export type Step = (typeof STEPS)[number]

type Inputs = { targets?: WindSeries[]; references?: WindSeries[] }
type UploadedCurve = CurveOption & { turbines?: number }

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
    /** Power curves added on the role zone; dropped ones come from `assignment`. */
    roleCurves: types.frozen<UploadedCurve[]>([]),
    /** The curve the user picked per target id, by name; other targets use `defaultCurve`. */
    curveChoice: types.frozen<Record<string, string>>({}),
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
    get uploadedCurves(): CurveOption[] {
      const dropped = (self.assignment?.curves ?? []).map(({ file, curve }) => ({ name: file, curve }))
      return [...dropped, ...self.roleCurves.filter((c) => !dropped.some((d) => d.name === c.name))]
    },
  }))
  .views((self) => ({
    curveOf(target: string): CurveOption {
      const ids = [...self.targets, ...self.references].map((s) => s.id)
      const chosen = [...self.uploadedCurves, ...KNOWN_CURVES].find((c) => c.name === self.curveChoice[target])
      return chosen ?? defaultCurve(target, self.uploadedCurves, ids)
    },
  }))
  .views((self) => ({
    get datasets(): Record<string, Dataset> {
      const { nTurbines, usedReferences } = self
      if (!usedReferences.length) return {}
      return Object.fromEntries(self.targets.map((t) => [t.id, buildDataset(t, usedReferences, self.curveOf(t.id).curve, nTurbines)]))
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
    /** Newly uploaded curves: a target of the same site switches to its curve, whatever was picked before. */
    curvesArrived(curves: UploadedCurve[]) {
      self.curveChoice = Object.fromEntries(Object.entries(self.curveChoice).filter(([t]) => !curves.some((c) => site(c.name) === site(t))))
      const stated = curves.find((c) => c.turbines)
      if (ASK_TURBINES && curves.length) {
        if (stated) self.nTurbines = stated.turbines!
        self.turbinesSource = stated?.name
        self.turbinesConfirmed = false
      }
    },
    chooseCurve(target: string, name: string) {
      self.curveChoice = { ...self.curveChoice, [target]: name }
      if (ASK_TURBINES) self.turbinesConfirmed = false
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
    /** Assign all dropped files again: targets the user chose stay while their series exist, else the assignment's.
     * `added` are the files just dropped. */
    reassign(added: string[]) {
      const assignment = self.files.length ? assignFiles(self.files) : undefined
      self.assignment = assignment
      const series = assignment?.series ?? []
      self.curvesArrived((assignment?.curves ?? []).filter((c) => added.includes(c.file)).map((c) => ({ ...c, name: c.file })))
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
      self.reassign(files.map((f) => f.name))
    },
    removeFile(name: string) {
      self.files = self.files.filter((f) => f.name !== name)
      self.reassign([])
    },
    /** The demo files instead of everything dropped before. */
    loadDemo() {
      Object.assign(self, { files: DEMO_FILES, stations: [], targetsChosen: false, roleCurves: [], curveChoice: {} })
      self.reassign(DEMO_FILES.map((f) => f.name))
    },
    addRoleCurve(curve: UploadedCurve) {
      self.roleCurves = [...self.roleCurves.filter((c) => c.name !== curve.name), curve]
      self.curvesArrived([curve])
    },
    removeRoleCurve(name: string) {
      self.roleCurves = self.roleCurves.filter((c) => c.name !== name)
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
