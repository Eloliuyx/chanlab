import { createChart } from 'lightweight-charts'
import React, { useEffect } from 'react'
import type { Bi, Candle } from '../lib/types'


// In this modular version we only list Bi meta on the side to keep code compact.
// You can wire drawing lines by passing chart references down if needed.


export default function OverlayBi({ bis }: { bis: Bi[] }){
return (
<div>
<h3 style={{margin:'0 0 6px 0'}}>Bi (笔)</h3>
<ul className="list">
{bis?.slice(-12).map((b,i)=> (
<li key={i} className="small">{b.direction} · {b.start_idx}→{b.end_idx} · [{b.low.toFixed(2)}, {b.high.toFixed(2)}]</li>
))}
</ul>
</div>
)
}
