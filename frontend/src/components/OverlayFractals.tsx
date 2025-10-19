import { useEffect } from 'react'
import type { Fractal, Candle } from '../lib/types'
import { createChart } from 'lightweight-charts'


// This component assumes it is rendered AFTER ChartCanvas so the chart exists.
// Here, for simplicity, we expect chart and series refs to be passed in from parent if you later centralize them.
// For now we render fractals as precomputed lines in the sidebar list (kept simple).


export default function OverlayFractals({ fractals }: { fractals: Fractal[] }){
return (
<div>
<h3 style={{margin:'0 0 6px 0'}}>Fractals</h3>
<ul className="list">
{fractals?.slice(-12).map((f,i)=> (
<li key={i} className="small">#{f.idx} · {f.kind} · H:{f.high.toFixed(2)} · L:{f.low.toFixed(2)}</li>
))}
</ul>
</div>
)
}
