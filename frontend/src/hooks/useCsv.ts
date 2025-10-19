import Papa from 'papaparse'
import { useEffect, useState } from 'react'
import type { Candle } from '../lib/types'


export function useCsv(file: File | null){
const [candles, setCandles] = useState<Candle[]>([])
useEffect(()=>{
if(!file){ setCandles([]); return }
Papa.parse(file, {
header:true, skipEmptyLines:true,
complete: (res:any)=>{
const CN2EN: Record<string,string> = { '日期':'Date','开盘':'Open','收盘':'Close','最高':'High','最低':'Low','成交量':'Volume' }
const rows = res.data as any[]
const out: Candle[] = []
for(const r of rows){
const rr:any = { ...r }
for(const k of Object.keys(rr)){ if(CN2EN[k]) rr[CN2EN[k]] = rr[k] }
const date = new Date(rr['Date']||rr['date']||rr['Timestamp']);
if(!isFinite(date.getTime())) continue
const toNum=(v:any)=> (v==null||v==='')?NaN:Number(v)
const o=toNum(rr['Open']), h=toNum(rr['High']), l=toNum(rr['Low']), c=toNum(rr['Close'])
if([o,h,l,c].some(x=>!isFinite(x))) continue
const v=toNum(rr['Volume'])
out.push({ time: date.toISOString().slice(0,10), open:o, high:h, low:l, close:c, volume: isFinite(v)?v:undefined })
}
setCandles(out)
}
})
}, [file])
return candles
}
