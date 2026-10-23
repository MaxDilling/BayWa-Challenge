import { color } from 'echarts/core'
import { useSyncExternalStore } from 'react'
import { fmtAxisTime } from '@/components/format'

/** The design tokens of index.css as values ECharts understands. */
export interface ChartTheme {
  measured: string
  reference: string
  prediction: string
  band: string
  outage: string
  outageEdge: string
  gap: string
  energy: string
  text: string
  textMuted: string
  surface: string
  border: string
  grid: string
  axis: string
  bandOpacity: number
  areaOpacity: number
  line: number
  lineThin: number
  point: number
  label: number
  font: string
}

function readTheme(): ChartTheme {
  const css = getComputedStyle(document.documentElement)
  const token = (name: string) => css.getPropertyValue(`--${name}`).trim()
  const number = (name: string) => parseFloat(token(name))
  return {
    measured: token('series-measured'),
    reference: token('series-reference'),
    prediction: token('series-prediction'),
    band: token('series-band'),
    outage: token('series-outage'),
    outageEdge: token('series-outage-edge'),
    gap: token('series-gap'),
    energy: token('series-energy'),
    text: token('foreground'),
    textMuted: token('muted-foreground'),
    surface: token('popover'),
    border: token('border'),
    grid: token('chart-grid'),
    axis: token('chart-axis'),
    bandOpacity: number('chart-band-opacity'),
    areaOpacity: number('chart-area-opacity'),
    line: number('chart-line'),
    lineThin: number('chart-line-thin'),
    point: number('chart-point'),
    label: number('size-label') * parseFloat(css.fontSize),
    font: token('font-body'),
  }
}

let cached: { key: string; theme: ChartTheme } | undefined

function snapshot() {
  const key = document.documentElement.className
  if (cached?.key !== key) cached = { key, theme: readTheme() }
  return cached.theme
}

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => observer.disconnect()
}

/** Re-read when the theme class on <html> changes (dark mode). */
export const useChartTheme = () => useSyncExternalStore(subscribe, snapshot)

/** Defaults for every chart: text, axes, tooltip and legend from the tokens. */
export function echartsTheme(t: ChartTheme) {
  const axis = {
    axisLine: { lineStyle: { color: t.axis } },
    axisTick: { lineStyle: { color: t.axis } },
    axisLabel: { color: t.textMuted, fontSize: t.label },
    splitLine: { lineStyle: { color: t.grid } },
    nameTextStyle: { color: t.textMuted, fontSize: t.label },
  }
  return {
    color: [t.prediction, t.measured, t.reference, t.energy],
    backgroundColor: 'transparent',
    textStyle: { fontFamily: t.font, color: t.text, fontSize: t.label },
    grid: { left: t.label, right: t.label * 1.5, top: t.label * 2.5, bottom: t.label, outerBoundsMode: 'same' },
    legend: { top: 0, left: 0, textStyle: { color: t.textMuted, fontSize: t.label }, itemHeight: t.label * 0.8, itemWidth: t.label * 1.6 },
    tooltip: {
      backgroundColor: t.surface,
      borderColor: t.border,
      textStyle: { color: t.text, fontSize: t.label },
      axisPointer: { lineStyle: { color: t.axis }, crossStyle: { color: t.axis } },
    },
    timeAxis: { ...axis, splitLine: { show: false }, axisLabel: { ...axis.axisLabel, formatter: fmtAxisTime, hideOverlap: true } },
    valueAxis: axis,
    categoryAxis: axis,
    line: { symbol: 'none', lineStyle: { width: t.line } },
    dataZoom: {
      textStyle: { color: t.textMuted },
      borderColor: t.border,
      fillerColor: color.modifyAlpha(t.prediction, t.areaOpacity),
      handleStyle: { color: t.surface, borderColor: t.axis },
      moveHandleStyle: { color: t.axis },
      dataBackground: { lineStyle: { color: t.axis }, areaStyle: { color: t.grid } },
      selectedDataBackground: { lineStyle: { color: t.textMuted }, areaStyle: { color: t.axis } },
      emphasis: { handleStyle: { borderColor: t.prediction }, moveHandleStyle: { color: t.prediction } },
    },
  }
}
