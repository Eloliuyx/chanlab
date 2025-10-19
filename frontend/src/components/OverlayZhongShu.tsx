import React, { useEffect } from 'react'
import type { ZhongShu, Bi } from '../lib/types'


type Props = {
zses: ZhongShu[];
bis: Bi[];
getX: (barIdx:number)=> number | null;
getY: (price:number)=> number | null;
layer: HTMLDivElement | null;
}


export default function OverlayZhongShu({ zses, bis, getX, getY, layer }: Props){
useEffect(()=>{
if(!layer){ return }
layer.innerHTML = ''
zses?.forEach((zs, i)=>{
const startBi = bis[zs.start_bi]; const endBi = bis[zs.end_bi]
if(!startBi || !endBi) return
const i0 = startBi.start_idx, i1 = endBi.end_idx
const x0 = getX(i0), x1 = getX(i1)
const yTop = getY(zs.zgg), yBot = getY(zs.zdd)
if([x0,x1,yTop,yBot].some(v=>v==null)) return
const left = Math.min(x0!, x1!), width = Math.max(1, Math.abs(x1!-x0!))
const top = Math.min(yTop!, yBot!), height = Math.max(1, Math.abs(yBot!-yTop!))
const box = document.createElement('div')
box.style.position='absolute'; box.style.left=left+'px'; box.style.top=top+'px';
box.style.width=width+'px'; box.style.height=height+'px';
box.style.background='rgba(99,102,241,0.10)'; box.style.border='1px dashed rgba(79,70,229,0.6)';
box.style.borderRadius='6px'; box.title = `ZS#${i} [${zs.zdd.toFixed(2)}, ${zs.zgg.toFixed(2)}]`
layer.appendChild(box)
})
}, [zses, bis, getX, getY, layer])


return null
}
