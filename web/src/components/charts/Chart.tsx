import { BarChart, LineChart, ScatterChart } from 'echarts/charts'
import {
  BrushComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  TooltipComponent,
} from 'echarts/components'
import { init, use, type ECharts, type EChartsCoreOption } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { echartsTheme, useChartTheme, type ChartTheme } from './theme'

use([
  LineChart,
  BarChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkAreaComponent,
  BrushComponent,
  DataZoomComponent,
  CanvasRenderer,
])

export type { ChartTheme }

/** A chart as a PNG for print, drawn off screen (at the print width unless given) without animation, tooltip or zoom. */
export function chartImage(option: EChartsCoreOption, theme: ChartTheme, height: number, width = theme.print.width): string {
  const chart = init(document.createElement('div'), echartsTheme(theme), { width, height, devicePixelRatio: theme.print.scale })
  chart.setOption({ ...option, animation: false, tooltip: undefined, dataZoom: [] })
  const url = chart.getDataURL({ type: 'png' })
  chart.dispose()
  return url
}

interface Props {
  /** Builds the option from the token theme; keep it referentially stable (useCallback). */
  option: (theme: ChartTheme) => EChartsCoreOption
  /** Called after every setOption, e.g. to bind events or draw a brush. */
  onChart?: (chart: ECharts) => void
  className?: string
}

/** The one ECharts wrapper: token theme, resize with the container, dispose on unmount. */
export function Chart({ option, onChart, className }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const theme = useChartTheme()
  const [chart, setChart] = useState<ECharts>()

  useEffect(() => {
    const instance = init(el.current, echartsTheme(theme))
    const resize = new ResizeObserver(() => instance.resize())
    resize.observe(el.current!)
    setChart(instance)
    return () => {
      resize.disconnect()
      instance.dispose()
    }
  }, [theme])

  useEffect(() => {
    if (!chart) return
    chart.setOption(option(theme), { notMerge: true })
    onChart?.(chart)
  }, [chart, option, onChart, theme])

  return <div ref={el} className={cn('w-full', className)} />
}
