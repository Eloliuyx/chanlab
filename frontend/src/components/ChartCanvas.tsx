import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react'
import {
  createChart,
  CandlestickData,
  IChartApi,
  ISeriesApi,
  LineStyle,
  LineWidth,
  SeriesMarker,
  Time,
  UTCTimestamp,
} from 'lightweight-charts'

export type ChartCanvasHandle = {
  /** 设置可视时间范围（单位：UTCTimestamp 秒） */
  setVisibleRange: (from: UTCTimestamp, to: UTCTimestamp) => void
  /** 价格转像素 Y 坐标（用于在外层做自定义标注时计算） */
  priceToY: (price: number) => number | null

  /** 在K线上放标注（分形） */
  setMarkers: (markers: SeriesMarker<Time>[]) => void

  /** 画折线（笔/线段等） */
  drawLine: (
    id: string,
    points: { time: UTCTimestamp; value: number }[],
    opts?: { color?: string; width?: number; style?: LineStyle }
  ) => void

  /** 画水平线段（中枢上下沿） */
  drawHSegment: (
    id: string,
    seg: { from: UTCTimestamp; to: UTCTimestamp; price: number },
    opts?: { color?: string; width?: number; style?: LineStyle }
  ) => void

  /** 清除覆盖层；若传 id 只清该条 */
  clearOverlay: (id?: string) => void
}

type Props = {
  /** K线数据（time 建议传秒级时间戳 UTCTimestamp） */
  data: CandlestickData[]
  /** 组件高度；默认 380 */
  height?: number
  /** 数据更新后自动自适应到全局范围（默认 true） */
  autoFitOnData?: boolean
}

const ChartCanvas = forwardRef<ChartCanvasHandle, Props>((props, ref) => {
  const { data, height = 380, autoFitOnData = true } = props

  const hostRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null)

  // 为覆盖层维护一个可复用的折线集合，避免频繁 add/remove
  const linesRef = useRef(new Map<string, ISeriesApi<'Line'>>())

  // 初始化图表
  useEffect(() => {
    if (!hostRef.current) return

    const chart = createChart(hostRef.current, {
      height,
      layout: {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto',
      },
      rightPriceScale: { borderVisible: false },
      timeScale: {
        borderVisible: false,
        secondsVisible: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      crosshair: {
        mode: 0, // Normal
      },
      // v4+ 支持，个别类型定义缺失，忽略类型即可
      // @ts-ignore
      branding: false,
    })

    const series = chart.addCandlestickSeries({
      upColor: '#16a34a',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#16a34a',
      wickDownColor: '#ef4444',
    })

    chartRef.current = chart
    candleRef.current = series

    // 自适应容器尺寸（父容器大小变化时）
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect
      if (!cr || !chartRef.current) return
      chartRef.current.applyOptions({ width: Math.floor(cr.width), height })
    })
    ro.observe(hostRef.current)

    return () => {
      ro.disconnect()
      // 清理所有 overlay 折线
      for (const s of linesRef.current.values()) {
        chart.removeSeries(s)
      }
      linesRef.current.clear()
      // 清理主图
      chart.remove()
      chartRef.current = null
      candleRef.current = null
    }
  }, [height])

  // 数据更新
  useEffect(() => {
    if (!candleRef.current) return
    candleRef.current.setData(data)
    if (autoFitOnData && data.length) {
      const from = data[0].time as Time
      const to = data[data.length - 1].time as Time
      chartRef.current?.timeScale().setVisibleRange({ from, to })
    }
  }, [data, autoFitOnData])

  // 暴露给外层的控制 API
  useImperativeHandle(ref, () => ({
    setVisibleRange: (from, to) => {
      chartRef.current?.timeScale().setVisibleRange({ from, to })
    },

    priceToY: (price) => {
      // @ts-ignore 类型定义里 priceScale 可能缺少该签名
      return candleRef.current?.priceScale().priceToCoordinate(price) ?? null
    },

    setMarkers: (markers) => {
      candleRef.current?.setMarkers(markers)
    },

    drawLine: (id, points, opts) => {
      if (!chartRef.current) return
      let line = linesRef.current.get(id)
      if (!line) {
        line = chartRef.current.addLineSeries({
          color: opts?.color ?? '#0ea5e9',
          lineWidth: (opts?.width ?? 2) as LineWidth,
          lineStyle: opts?.style ?? LineStyle.Solid,
          priceScaleId: 'right',
        })
        linesRef.current.set(id, line)
      }
      line.applyOptions({
        color: opts?.color ?? '#0ea5e9',
        lineWidth: (opts?.width ?? 2) as LineWidth,
        lineStyle: opts?.style ?? LineStyle.Solid,
      })
      line.setData(points)
    },

    drawHSegment: (id, seg, opts) => {
      if (!chartRef.current) return
      const points = [
        { time: seg.from, value: seg.price },
        { time: seg.to, value: seg.price },
      ]
      let line = linesRef.current.get(id)
      if (!line) {
        line = chartRef.current.addLineSeries({
          color: opts?.color ?? '#9ca3af',
          lineWidth: (opts?.width ?? 2) as LineWidth,
          lineStyle: opts?.style ?? LineStyle.Dotted,
          priceScaleId: 'right',
        })
        linesRef.current.set(id, line)
      }
      line.applyOptions({
        color: opts?.color ?? '#9ca3af',
        lineWidth: (opts?.width ?? 2) as LineWidth,
        lineStyle: opts?.style ?? LineStyle.Dotted,
      })
      line.setData(points)
    },

    clearOverlay: (id) => {
      if (!chartRef.current) return
      if (id) {
        const s = linesRef.current.get(id)
        if (s) {
          chartRef.current.removeSeries(s)
          linesRef.current.delete(id)
        }
        return
      }
      // 清除全部折线覆盖层
      for (const s of linesRef.current.values()) {
        chartRef.current.removeSeries(s)
      }
      linesRef.current.clear()
      // 清标注
      candleRef.current?.setMarkers([])
    },
  }))

  return (
    <div
      ref={hostRef}
      style={{
        width: '100%',
        height,
        borderRadius: 12,
      }}
    />
  )
})

export default ChartCanvas
