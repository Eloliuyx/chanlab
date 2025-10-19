import { useEffect, useState } from 'react'
import type { ChanlabJson } from '../lib/types'


export function useChanlabJson(file: File | null){
const [data, setData] = useState<ChanlabJson | null>(null)
useEffect(()=>{
if(!file){ setData(null); return }
const reader = new FileReader()
reader.onload = () => {
try{ setData(JSON.parse(String(reader.result)) as ChanlabJson) } catch(e){ console.error('Invalid JSON', e) }
}
reader.readAsText(file, 'utf-8')
}, [file])
return data
}
