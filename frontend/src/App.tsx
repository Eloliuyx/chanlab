import React, { useEffect, useMemo, useRef, useState } from 'react'
import Papa, { ParseResult, ParseRemoteConfig } from 'papaparse'
import type { CandlestickData, UTCTimestamp } from 'lightweight-charts'
import { LineStyle } from 'lightweight-charts'
import ChartCanvas, { ChartCanvasHandle } from './components/ChartCanvas'

// 可通过 .env 注入默认数据源（开发期不硬编码）
// 例：VITE_DEFAULT_CSV_URL=/data/600519_daily.csv
const DEFAULT_CSV_URL = import.meta.env.VITE_DEFAULT_CSV_URL as string | undefined

// ====== 数据类型（与算法侧最终格式可对齐）======
type Fractal = { idx: number; type: 'top' | 'bottom' }
type Bi = { startIdx: number; endIdx: number; dir: 'up' | 'down' }
type Segment = { startIdx: number; endIdx: number }
type ZhongShu = { zdd: number; zgg: number; start_bi: number; end_bi: number }
type Meta = {
  symbol?: string
  cutoff?: string | number
  count_bars?: number
  fractals?: Fractal[]
  bis?: Bi[]
  segments?: Segment[]
  zhongshus?: ZhongShu[]
  shi?: Array<{ window: { start: number; end: number } }>
}

// ====== CSV 列名映射 ======
const CN2EN: Record<string, string> = {
  '日期': 'Date', '时间': 'Date',
  '开盘': 'Open', '最高': 'High', '最低': 'Low', '收盘': 'Close', '成交量': 'Volume',
}
const REQUIRED = ['Date', 'Open', 'High', 'Low', 'Close'] as const

// ====== 工具函数 ======
function toUtcSec(input: string | number): UTCTimestamp {
  if (typeof input === 'number') return (input > 1e12 ? Math.floor(input / 1000) : input) as UTCTimestamp
  const d = new Date(String(input).replace(/\//g, '-'))
  return Math.floor(d.getTime() / 1000) as UTCTimestamp
}
function buildDemoCandles(n = 160): CandlestickData[] {
  const start = Math.floor(Date.now() / 1000) - 86400 * n
  return Array.from({ length: n }, (_, i) => {
    const base = 100 + Math.sin(i / 10) * 6 + Math.sin(i / 33) * 10 + i * 0.12
    const o = base + (Math.random() - 0.5) * 1.2
    const c = base + (Math.random() - 0.5) * 1.2
    const h = Math.max(o, c) + Math.random() * 1.8
    const l = Math.min(o, c) - Math.random() * 1.8
    return { time: (start + i * 86400) as UTCTimestamp, open: o, high: h, low: l, close: c }
  })
}

// ====== 从 CSV 派生：分形 / 笔 / 线段 / 中枢（演示用算法）======
function detectFractals(c: CandlestickData[]): Fractal[] {
  const res: Fractal[] = []
  const H = (i: number) => (c[i] as any).high as number
  const L = (i: number) => (c[i] as any).low as number
  for (let i = 2; i < c.length - 2; i++) {
    if (H(i) > H(i - 1) && H(i) > H(i - 2) && H(i) > H(i + 1) && H(i) > H(i + 2)) res.push({ idx: i, type: 'top' })
    else if (L(i) < L(i - 1) && L(i) < L(i - 2) && L(i) < L(i + 1) && L(i) < L(i + 2)) res.push({ idx: i, type: 'bottom' })
  }
  return res
}
function buildBis(fr: Fractal[], minGap = 3): Bi[] {
  const out: Bi[] = []
  if (fr.length < 2) return out
  let prev = fr[0]
  for (let j = 1; j < fr.length; j++) {
    const cur = fr[j]
    if (cur.type === prev.type) { prev = cur; continue }
    if (cur.idx - prev.idx >= minGap) {
      const dir: 'up' | 'down' = cur.type === 'top' ? 'up' : 'down'
      out.push({ startIdx: prev.idx, endIdx: cur.idx, dir })
      prev = cur
    }
  }
  return out
}
function buildSegments(bis: Bi[]): Segment[] {
  // 简化：两笔合并成一段（连成更长的走势线）
  const out: Segment[] = []
  for (let i = 0; i + 1 < bis.length; i += 2) {
    out.push({ startIdx: bis[i].startIdx, endIdx: bis[i + 1].endIdx })
  }
  return out
}
function buildZhongShus(c: CandlestickData[], bis: Bi[]): ZhongShu[] {
  // 简化：滑动窗口取 3 条“笔”，若其价格区间有重叠则判为一个中枢
  const out: ZhongShu[] = []
  const rng = (b: Bi) => {
    const a = c[b.startIdx] as any, d = c[b.endIdx] as any
    const hi = Math.max(a.high, d.high), lo = Math.min(a.low, d.low)
    return { hi, lo }
  }
  for (let i = 0; i + 2 < bis.length; i++) {
    const r1 = rng(bis[i]), r2 = rng(bis[i + 1]), r3 = rng(bis[i + 2])
    const zgg = Math.min(r1.hi, r2.hi, r3.hi) // 上沿取最小高点
    const zdd = Math.max(r1.lo, r2.lo, r3.lo) // 下沿取最大低点
    if (zgg > zdd) {
      out.push({ zdd, zgg, start_bi: i, end_bi: i + 2 })
    }
  }
  return out
}

// ====== 组件 ======
export default function App() {
  const [candles, setCandles] = useState<CandlestickData[]>([])
  const [meta, setMeta] = useState<Meta | null>(null)                 // 如上传 JSON 则优先用它
  const [derived, setDerived] = useState<{ fractals: Fractal[]; bis: Bi[]; segments: Segment[]; zhongshus: ZhongShu[] } | null>(null)

  const [csvName, setCsvName] = useState<string | null>(null)
  const [jsonName, setJsonName] = useState<string | null>(null)
  const [activeShi, setActiveShi] = useState<number | null>(null)

  const chartRef = useRef<ChartCanvasHandle | null>(null)

  // 索引 → 时间
  const idxToTime = useMemo(() => {
    const m = new Map<number, UTCTimestamp>()
    candles.forEach((c, i) => m.set(i, (c.time as number) as UTCTimestamp))
    return m
  }, [candles])

  // 自动加载：若配置了默认 CSV
  useEffect(() => {
    if (!DEFAULT_CSV_URL) return
    const cfg: ParseRemoteConfig<any> = {
      download: true, header: true, skipEmptyLines: true, dynamicTyping: true,
      complete: (res: ParseResult<any>) => {
        const rows = (res.data as any[]).map((r) => { const o: any = {}; for (const k in r) o[CN2EN[k] ?? k] = r[k]; return o })
        const good = rows.filter((r) => REQUIRED.every((k) => r[k] != null && r[k] !== ''))
        const ds: CandlestickData[] = good.map((r) => ({ time: toUtcSec(r.Date), open: +r.Open, high: +r.High, low: +r.Low, close: +r.Close }))
        setCandles(ds); setCsvName(DEFAULT_CSV_URL); setActiveShi(null)
      },
      error: (err) => console.error('CSV 加载失败：', err),
    }
    Papa.parse(DEFAULT_CSV_URL, cfg)
  }, [])

  // 上传 CSV（File 重载）
  function handleCsv(file: File) {
    setCsvName(file.name)
    Papa.parse(file as any, {
      header: true, skipEmptyLines: true, dynamicTyping: true,
      complete: (res: ParseResult<any>) => {
        const rows = (res.data as any[]).map((r) => { const o: any = {}; for (const k in r) o[CN2EN[k] ?? k] = r[k]; return o })
        const good = rows.filter((r) => REQUIRED.every((k) => r[k] != null && r[k] !== ''))
        const ds: CandlestickData[] = good.map((r) => ({ time: toUtcSec(r.Date), open: +r.Open, high: +r.High, low: +r.Low, close: +r.Close }))
        setCandles(ds); setActiveShi(null)
      },
    })
  }

  // 上传 meta JSON
  function handleJson(file: File) {
    setJsonName(file.name)
    const fr = new FileReader()
    fr.onload = () => {
      try { setMeta(JSON.parse(String(fr.result))) }
      catch (e: any) { alert('JSON 解析失败：' + e.message) }
    }
    fr.readAsText(file)
  }

  // 当没有 meta.json 时，自动从 CSV 派生可视化所需结构
  useEffect(() => {
    if (!candles.length) { setDerived(null); return }
    if (meta) return // 有 meta 就不派生
    const fractals = detectFractals(candles)
    const bis = buildBis(fractals)
    const segments = buildSegments(bis)
    const zhongshus = buildZhongShus(candles, bis)
    setDerived({ fractals, bis, segments, zhongshus })
  }, [candles, meta])

  // 点击“势” → 联动
  function focusShi(i: number | null) {
    setActiveShi(i)
    if (i == null || !meta?.shi?.[i]) return
    const it = meta.shi[i]
    const t0 = idxToTime.get(it.window.start)
    const t1 = idxToTime.get(it.window.end)
    if (t0 && t1) chartRef.current?.setVisibleRange(t0, t1)
  }

  // —— 绘制 Overlay：优先用 meta，否则用 derived —— //
  useEffect(() => {
    const m = (meta ?? derived) as Partial<Meta> | null
    if (!candles.length || !chartRef.current) { chartRef.current?.clearOverlay?.(); chartRef.current?.setMarkers?.([]); return }

    // 清线但保留 markers；我们先清，再按顺序重画
    chartRef.current.clearOverlay()

    // 1) 分形（上下箭头）
    if (m?.fractals?.length) {
      const markers = m.fractals.map((f) => {
        const idx = f.idx
        if (idx == null || idx < 0 || idx >= candles.length) return null
        const k = candles[idx] as any
        const above = f.type === 'top'
        return {
          time: k.time as UTCTimestamp,
          position: above ? 'aboveBar' : 'belowBar',
          color: above ? '#ef4444' : '#10b981',
          shape: above ? 'arrowDown' : 'arrowUp',
          text: above ? '顶分形' : '底分形',
          size: 1,
        } as const
      }).filter(Boolean) as any[]
      chartRef.current.setMarkers(markers)
    } else {
      chartRef.current.setMarkers([])
    }

    // 2) 笔（蓝/红线）
    if (m?.bis?.length) {
      m.bis.forEach((bi, i) => {
        const s = candles[bi.startIdx] as any, e = candles[bi.endIdx] as any
        if (!s || !e) return
        const color = bi.dir === 'down' ? '#ef4444' : '#0ea5e9'
        chartRef.current!.drawLine(
          `bi-${i}`,
          [
            { time: s.time as UTCTimestamp, value: s.close },
            { time: e.time as UTCTimestamp, value: e.close },
          ],
          { color, width: 2, style: LineStyle.Solid }
        )
      })
    }

    // 3) 线段（更粗的黑线）
    if ((m as any)?.segments?.length) {
      ;(m as any).segments.forEach((seg: Segment, i: number) => {
        const s = candles[seg.startIdx] as any, e = candles[seg.endIdx] as any
        if (!s || !e) return
        chartRef.current!.drawLine(
          `seg-${i}`,
          [
            { time: s.time as UTCTimestamp, value: s.close },
            { time: e.time as UTCTimestamp, value: e.close },
          ],
          { color: '#111827', width: 3, style: LineStyle.Solid }
        )
      })
    }

    // 4) 中枢（上下沿虚线）
    if (m?.zhongshus?.length) {
      m.zhongshus.forEach((z, i) => {
        // 时间范围：优先按 start_bi / end_bi 所覆盖的笔
        let tFrom = candles[0].time as UTCTimestamp
        let tTo = candles[candles.length - 1].time as UTCTimestamp
        if (m.bis && z.start_bi != null && z.end_bi != null) {
          const sb = m.bis[z.start_bi], eb = m.bis[z.end_bi]
          const s = candles[sb.startIdx] as any, e = candles[eb.endIdx] as any
          if (s && e) { tFrom = s.time as UTCTimestamp; tTo = e.time as UTCTimestamp }
        }
        chartRef.current!.drawHSegment(`zs-${i}-low`,  { from: tFrom, to: tTo, price: z.zdd }, { color: '#f59e0b', width: 2, style: LineStyle.Dotted })
        chartRef.current!.drawHSegment(`zs-${i}-high`, { from: tFrom, to: tTo, price: z.zgg }, { color: '#f59e0b', width: 2, style: LineStyle.Dotted })
      })
    }
  }, [candles, meta, derived])

  // —— 工具栏动作 —— //
  function loadDemo() {
    const ds = buildDemoCandles(180)
    const fr = detectFractals(ds)
    const bis = buildBis(fr)
    const segments = buildSegments(bis)
    const zhongshus = buildZhongShus(ds, bis)

    setCandles(ds)
    setMeta(null) // 用派生的
    setDerived({ fractals: fr, bis, segments, zhongshus })
    setCsvName('示例数据（本地生成）')
    setJsonName(null)
    setActiveShi(null)
  }
  function clearAll() { setCandles([]); setMeta(null); setDerived(null); setCsvName(null); setJsonName(null); setActiveShi(null) }
  function fitAll() {
    if (!candles.length) return
    chartRef.current?.setVisibleRange(candles[0].time as UTCTimestamp, candles[candles.length - 1].time as UTCTimestamp)
  }

  // —— UI —— //
  return (
    <div style={{ maxWidth: 1160, margin: '24px auto', padding: '0 12px', fontFamily: 'system-ui,-apple-system,Segoe UI,Roboto' }}>
      {/* 页眉 + 工具栏 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28 }}>缠论分析日K图</h1>
          <div style={{ color: '#6b7280', fontSize: 14 }}>分形 · 笔 · 中枢 · 势</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <label style={{ fontSize: 12, color: '#6b7280' }}>
            CSV 数据：
            <input type="file" accept=".csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCsv(f) }} />
          </label>
          <label style={{ fontSize: 12, color: '#6b7280' }}>
            元数据（JSON）：
            <input type="file" accept=".json" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleJson(f) }} />
          </label>
          <button onClick={loadDemo} style={btnStyle}>载入示例</button>
          <button onClick={fitAll} style={btnStyle}>自适应</button>
          <button onClick={clearAll} style={{ ...btnStyle, color: '#b91c1c', borderColor: '#fee2e2', background: '#fff7f7' }}>清空</button>
        </div>
      </div>

      {/* 状态条 */}
      <div style={{ marginTop: 6, color: '#6b7280', fontSize: 12 }}>
        {csvName ? <>CSV：<code>{csvName}</code>&nbsp;&nbsp;</> : 'CSV：— '}
        {jsonName ? <>· JSON：<code>{jsonName}</code></> : '· JSON：—'}
      </div>

      {/* 图表 */}
      <div style={{ marginTop: 12, border: '1px solid #eee', borderRadius: 12, padding: 6 }}>
        <ChartCanvas ref={chartRef} data={candles} height={440} />
      </div>

      {/* 中枢 / 势 面板（势仍然取决于 meta.json） */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
        <div style={cardStyle}>
          <h2 style={h2Style}>中枢</h2>
          {!((meta ?? derived)?.zhongshus?.length) && <div style={muted}>暂无检测到中枢</div>}
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
            {(meta ?? derived)?.zhongshus?.map((z, i) => (
              <li key={i} style={{ fontSize: 13 }}>
                <span style={badge}>ZS#{i}</span> 区间 [{z.zdd.toFixed(2)}, {z.zgg.toFixed(2)}] · 笔 {z.start_bi}→{z.end_bi}
              </li>
            ))}
          </ul>
        </div>
        <div style={cardStyle}>
          <h2 style={h2Style}>势</h2>
          {meta?.shi?.length ? (
            <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
              {meta.shi.map((s, i) => (
                <li key={i} style={{ listStyle: 'none' }}>
                  <button onClick={() => focusShi(i)}
                    style={{
                      ...chipStyle,
                      background: activeShi === i ? '#f3f4f6' : '#fff',
                      borderColor: activeShi === i ? '#e5e7eb' : '#eee',
                    }}>
                    势 #{i}：{s.window.start} → {s.window.end}
                  </button>
                </li>
              ))}
            </ul>
          ) : <div style={muted}>暂无“势”数据（需上传 JSON）</div>}
        </div>
      </div>

      {/* 底部统计 */}
      {candles.length > 0 && (
        <div style={{ marginTop: 10, color: '#6b7280', fontSize: 12 }}>
          CSV 条数：{candles.length}
          {' '}· 最新 OHLC：
          <code>
            {candles[candles.length - 1].open.toFixed(2)}/
            {candles[candles.length - 1].high.toFixed(2)}/
            {candles[candles.length - 1].low.toFixed(2)}/
            {candles[candles.length - 1].close.toFixed(2)}
          </code>
        </div>
      )}
    </div>
  )
}

// —— 样式碎片 —— //
const btnStyle: React.CSSProperties = { fontSize: 12, padding: '6px 10px', borderRadius: 10, border: '1px solid #eee', background: '#fff', cursor: 'pointer' }
const cardStyle: React.CSSProperties = { border: '1px solid #eee', borderRadius: 12, padding: 12 }
const h2Style: React.CSSProperties = { margin: '0 0 8px 0', fontSize: 18 }
const muted: React.CSSProperties = { color: '#6b7280', fontSize: 13 }
const badge: React.CSSProperties = { display: 'inline-block', fontSize: 11, padding: '2px 6px', borderRadius: 8, background: '#f3f4f6', marginRight: 6 }
const chipStyle: React.CSSProperties = { fontSize: 12, padding: '4px 10px', borderRadius: 10, border: '1px solid #eee', background: '#fff', cursor: 'pointer' }
