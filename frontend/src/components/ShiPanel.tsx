import React from 'react'
import type { ShiItem } from '../lib/types'


export default function ShiPanel({ shi, onFocus, active }: { shi: ShiItem[]|undefined, onFocus:(i:number)=>void, active:number|null }){
if(!shi?.length) return <div className="small">No Shi entries.</div>
return (
<ul className="list">
{shi.map((s,i)=> (
<li key={i} className="card" style={{borderColor: active===i? '#3b82f6':'#e5e7eb', background: active===i? '#eff6ff':'#fff'}}>
<div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
<div style={{fontSize:14, fontWeight:600}}>{s.label}</div>
<button className="button" onClick={()=>onFocus(i)}>Focus</button>
</div>
<div className="small">bars {s.window.start} → {s.window.end}</div>
<ul className="list" style={{marginTop:6}}>
{s.evidence?.map((e,j)=> <li key={j} className="small">• {e}</li>)}
</ul>
</li>
))}
</ul>
)
}
