import { BookOpen } from 'lucide-react'
import { observer } from 'mobx-react-lite'
import type { ReactNode } from 'react'
import { Formula } from '@/components/Formula'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { store } from '@/state/store'

/** Harness result behind the recommendation (SPEC.md, Modellarchitektur); update together with registry.RECOMMENDED. */
export const BENCHMARK = {
  run: '24 Oct 2026, commit 1a9b2d0 with the changes of that day',
  scenarios: 645,
  datasets: 10,
  rows: [
    { model: 'sector_regression', variant: '', score: 0.64, energyPct: 24 },
    { model: 'multi_regression', variant: '', score: 0.64, energyPct: 24 },
    { model: 'linear_regression', variant: '', score: 0.67, energyPct: 25 },
    { model: 'variance_ratio', variant: '', score: 0.72, energyPct: 31 },
    { model: 'identity', variant: '', score: 1, energyPct: 118 },
  ],
}

const STEPS: { title: string; task: string; body: ReactNode; tex?: string }[] = [
  {
    title: 'Analyze',
    task: 'Learn how the wind at both farms is related, from the data outside the outage.',
    tex: String.raw`\hat{v}_t = a_{s(t)} + \sum_i b_{s(t),i} \cdot v_i(t - \tau_i)`,
    body: (
      <>
        A weighted sum of all reference farms, fitted by least squares on the 10-minute values outside the outage. Each reference is read
        at its own delay τ (up to ±60 min), the shift at which it tracks the target best. The weights are fitted separately for each of 8
        wind directions s, so a neighbouring turbine’s wake or the terrain in one direction gets its own weights; a direction with less
        than two days of values uses the weights of all directions.
      </>
    ),
  },
  {
    title: 'Predict',
    task: 'Apply the relationship to the reference wind during the outage.',
    body: (
      <>
        Every missing 10-minute value gets a prediction and an 80 % band. The band is not taken from how well the line fits, but measured on
        your own data: the data outside the outage is cut into 5 blocks, each block is predicted by a line fitted on the other four, and
        the band is scaled so that 80 % of these unseen errors fall inside. It grows with the wind, because errors do.
      </>
    ),
  },
  {
    title: 'Calculate',
    task: 'Turn the predicted wind into lost energy with the power curve.',
    tex: String.raw`\hat{P}_t = \mathbb{E}\left[P\big(v \cdot (\rho_t / 1.225)^{1/3}\big)\right], \quad v \sim \mathcal{N}(\hat{v}_t, \sigma_t^2)`,
    body: (
      <>
        The power is averaged over the uncertainty instead of read at the predicted wind alone, which gives back the peaks a fitted line
        smooths away. Thinner air than the 1.225 kg/m³ of the power curve yields less power, so where target and references measure
        temperature and air pressure, the wind is scaled to the air density ρ at the target, estimated from the references’ density and
        the ratio measured outside the outage. Energy is power × 10 min, summed over the outage and the turbines. For the P10–P90 range, errors are added as
        persistent as they were in the backtest: over a short outage they add up almost fully, over a long one they partly cancel.
      </>
    ),
  },
]

/** The method and why we chose it, reachable from every step: the solution concept in one sheet. */
export const HowItWorks = observer(function HowItWorks() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" className="ml-auto">
          <BookOpen /> How it works
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto data-[side=right]:sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="text-heading font-semibold">How it works</SheetTitle>
          <SheetDescription>
            Measure–correlate–predict (MCP), the standard method of wind assessors, in three steps. Every number in the tool comes from
            your data through these steps.
          </SheetDescription>
        </SheetHeader>
        <ol className="flex flex-col gap-5 px-4">
          {STEPS.map(({ title, task, body, tex }, i) => (
            <li key={title} className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <span className="flex size-7 items-center justify-center rounded-full bg-primary text-label font-semibold text-primary-foreground">
                {i + 1}
              </span>
              <p className="self-center font-medium">
                {title}: <span className="font-normal text-muted-foreground">{task}</span>
              </p>
              <div className="col-start-2 flex flex-col gap-2 text-pretty">
                {tex && <Formula tex={tex} />}
                <p>{body}</p>
              </div>
            </li>
          ))}
        </ol>
        <section className="flex flex-col gap-3 border-t px-4 pt-5 pb-4">
          <h3 className="font-medium">How we chose the method</h3>
          <p className="text-pretty">
            Our test harness hides the measurements of {BENCHMARK.scenarios.toLocaleString('en-US')} simulated outages from 6 h to 5 days on{' '}
            {BENCHMARK.datasets} datasets (a synthetic pair with known truth, the demo data, 5 real pairs of German weather stations 29–41
            km apart and the three challenge turbines T1–T3 with seven reference turbines each) and compares every method with the reference as is. The score averages wind RMSE and MAE, power RMSE and MAE and the
            energy error relative to that baseline: 1 is the baseline, lower is better. The accuracy in Results repeats this test on your
            data.
          </p>
          <table className="w-full text-left tabular-nums">
            <thead className="text-label text-muted-foreground">
              <tr className="border-b">
                <th className="py-1.5 pr-3 font-medium">Method</th>
                <th className="px-3 py-1.5 text-right font-medium">Score</th>
                <th className="py-1.5 pl-3 text-right font-medium">Energy error</th>
              </tr>
            </thead>
            <tbody>
              {BENCHMARK.rows.map(({ model, variant, score, energyPct }) => (
                <tr key={model + variant} className="border-b last:border-0">
                  <td className="py-1.5 pr-3">
                    {store.label(model)} {variant}
                  </td>
                  <td className="px-3 py-1.5 text-right">{score.toFixed(2)}</td>
                  <td className="py-1.5 pl-3 text-right">{energyPct} %</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-pretty">
            Linear regression wins on wind and on energy. Variance ratio keeps the spread of the wind, but averaging the power over the
            uncertainty already gives that spread back to the regression. Harder-to-explain models such as gradient boosting are not offered:
            when accuracy and explainability conflict, the task asks for explainability.
          </p>
          <p className="text-label text-muted-foreground">Harness run of {BENCHMARK.run}.</p>
        </section>
      </SheetContent>
    </Sheet>
  )
})
