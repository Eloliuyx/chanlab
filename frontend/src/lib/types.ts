export type Candle = {
    time: string; // YYYY-MM-DD
    open: number; high: number; low: number; close: number; volume?: number;
    }


    export type Fractal = { idx: number; kind: 'top'|'bottom'; high: number; low: number; confirmed_at: number };
    export type Bi = { start_idx: number; end_idx: number; direction: 'up'|'down'; high: number; low: number };
    export type ZhongShu = { start_bi: number; end_bi: number; zgg: number; zdd: number };
    export type ShiItem = { window: { start: number; end: number }, label: string, evidence: string[] };


    export type ChanlabJson = {
    symbol: string; cutoff: string; count_bars: number;
    fractals: Fractal[]; bis: Bi[]; zhongshus: ZhongShu[]; shi?: ShiItem[];
    }
