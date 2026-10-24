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
import type { Case } from '@/components/metrics'
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
    /** Names the user gave series, by the id from the files; the id stays the key everywhere in the store. */
    names: types.frozen<Record<string, string>>({}),
    nTurbines: 1,
    /** False after a power curve came from files: the turbine count is a decision the user must make. */
    turbinesConfirmed: true,
    /** Id of the target that steps 2–5 show. */
    active: '',
    /** With several targets, steps 2–5 show them all until one is picked. */
    total: true,
    /** One outage for every target, so that their losses cover the same period. */
    outage: types.frozen<Span | undefined>(undefined),
    /** Empty until the engine lists its models; then the recommended one. */
    model: '',
    /** Every model's response per target for the current data and outage, so the Method step can compare them. */
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
    get showsTotal(): boolean {
      return self.total && self.targets.length > 1 && self.step !== 'upload'
    },
    get target(): WindSeries | undefined {
      return self.targets.find((t) => t.id === self.active) ?? self.targets[0]
    },
    /** References of every target: the uploaded ones and the chosen DWD stations. */
    get usedReferences(): WindSeries[] {
      return [...self.references, ...self.dwd.filter((s) => self.stations.includes(s.id))]
    },
    nameOf(id: string) {
      return self.names[id] ?? id
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
    /** By target id; the series in them carry the names the user gave, so charts, report, email and CSV show those. */
    get datasets(): Record<string, Dataset> {
      const { nTurbines, usedReferences, names } = self
      if (!usedReferences.length) return {}
      const named = (s: WindSeries) => (names[s.id] ? { ...s, id: names[s.id] } : s)
      const references = usedReferences.map(named)
      return Object.fromEntries(self.targets.map((t) => [t.id, buildDataset(named(t), references, self.curveOf(t.id).curve, nTurbines)]))
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
    /** Every target with the selected model's result. */
    get cases(): Case[] {
      return self.targets.map(({ id }) => ({
        id: self.nameOf(id),
        dataset: self.datasets[id],
        outage: self.outage,
        response: self.resultsByTarget[id]?.[self.model],
        failure: self.failuresByTarget[id]?.[self.model],
        curve: self.curveOf(id).name,
      }))
    },
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
    /** The datasets steps 2–5 show: every target's under Total, else the one on view. */
    get shown(): Dataset[] {
      if (!self.showsTotal) return self.dataset ? [self.dataset] : []
      return self.targets.flatMap((t) => self.datasets[t.id] ?? [])
    },
    /** The targets the report covers: all of them under Total, else the one on view. */
    get reportCases(): Case[] {
      return self.showsTotal ? self.cases : self.cases.filter((_, i) => self.targets[i] === self.target)
    },
    get status(): 'idle' | 'running' | 'error' {
      if (self.response) return 'idle'
      if (self.error !== undefined) return 'error'
      return self.dataset && self.outage && self.engine && self.turbinesConfirmed ? 'running' : 'idle'
    },
    warningsOf(id: string) {
      const dataset = self.datasets[id]
      return dataset ? plausibility(dataset, self.outage, self.resultsByTarget[id]?.[self.model]?.explanation.diagnostics.r) : []
    },
  }))
  .views((self) => ({
    /** The shown targets with the selected model's result: what the Results charts draw. */
    get calculated(): Required<Case>[] {
      return self.shown.flatMap((d) => self.cases.filter((c): c is Required<Case> => c.dataset === d && !!c.response))
    },
    /** The checks of the target on view, or under Total of every target, each named. */
    get warnings() {
      if (!self.showsTotal) return self.target ? self.warningsOf(self.target.id) : []
      return self.targets.flatMap((t) => self.warningsOf(t.id).map((w) => ({ ...w, title: `${self.nameOf(t.id)}: ${w.title}` })))
    },
  }))
  .actions((self) => ({
    setStep(step: Step) {
      self.step = step
    },
    /** Without an outage the first detected one of the first target that has one. */
    fillOutage() {
      self.outage ??= self.targets.map((t) => self.datasets[t.id]?.outages[0]).find(Boolean)
      if (!self.targets.some((t) => t.id === self.active)) self.active = self.targets[0]?.id ?? ''
    },
  }))
  .actions((self) => ({
    /** New targets or references: the outage is detected afresh. */
    setInputs(inputs: Inputs) {
      Object.assign(self, inputs)
      self.outage = undefined
      self.fillOutage()
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
    /** Returns why the name cannot be used; it goes into file names and the CSV, and must tell the series apart. */
    rename(id: string, name: string): string | undefined {
      const trimmed = name.trim()
      if (!trimmed) return 'The name cannot be empty.'
      if (/[,/\\:*?"<>|]/.test(trimmed)) return 'The name cannot contain , / \\ : * ? " < > |'
      const others = [...self.targets, ...self.references, ...self.dwd].filter((s) => s.id !== id)
      if (others.some((s) => s.id === trimmed || self.names[s.id] === trimmed)) return `Another series is already called ${trimmed}.`
      const { [id]: _, ...names } = self.names
      self.names = trimmed === id ? names : { ...names, [id]: trimmed }
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
      self.outage = outage
    },
    selectTarget(id: string) {
      self.active = id
      self.total = false
    },
    selectTotal() {
      self.total = true
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
      const outage = self.outage
      self.targetsChosen = true
      self.setInputs({ targets: series.filter((s) => ids.includes(s.id)), references: series.filter((s) => !ids.includes(s.id)) })
      if (outage && ids.length) self.outage = outage
    },
    toggleStation(id: string) {
      self.stations = self.stations.includes(id) ? self.stations.filter((s) => s !== id) : [...self.stations, id]
      self.fillOutage()
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
        const { datasets, outage, engine, models, model, turbinesConfirmed, target } = self
        self.resultsByTarget = {}
        self.failuresByTarget = {}
        if (!engine || !turbinesConfirmed || !target) return
        const current = ++run
        for (const id of [target.id, ...self.targets.map((t) => t.id).filter((t) => t !== target.id)]) {
          const dataset = datasets[id]
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
          () => [self.datasets, self.outage, self.engine, self.turbinesConfirmed],
          () => self.runAnalysis(),
        ),
      )
      self.setEngine(requestedEngine())
    },
  }))

export const store = RootStore.create()
