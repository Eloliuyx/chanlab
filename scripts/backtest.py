import pandas as pd
import numpy as np
from chanlab.structs import Bar
from chanlab.rules import resolve_inclusions, detect_fractals
from chanlab.engine import build_bi, build_zhongshu
from chanlab.signals import generate_signals

FEE = 0.0005   # commission+stamp duty approx (toy)
SLIP = 0.0005  # slippage (toy)

def load_csv(path: str):
    df = pd.read_csv(path)
    bars = [Bar(ts=int(i), open=r.Open, high=r.High, low=r.Low, close=r.Close, volume=r.get('Volume',0.0)) 
            for i, r in df.iterrows()]
    return bars, df

def run(path: str):
    bars, df = load_csv(path)
    bars_inc = resolve_inclusions(bars)
    frs = detect_fractals(bars_inc)
    bis = build_bi(frs)
    zses = build_zhongshu(bis, min_bi=3)
    sigs = generate_signals(bars_inc, bis, zses)
    # toy evaluation: buy on 3_buy next open, sell after 20 bars
    pnl = 0.0; trades = 0
    for s in sigs:
        if s.idx+21 >= len(bars_inc): break
        buy = bars_inc[s.idx].open*(1+SLIP); sell = bars_inc[s.idx+20].open*(1-SLIP)
        pnl += (sell-buy)/buy - FEE
        trades += 1
    print(f"Signals: {len(sigs)}, trades: {trades}, toy PnL: {pnl:.4f}")
    return sigs, pnl

if __name__ == "__main__":
    run("examples/sample.csv")
