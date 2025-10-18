# chanlab — Minimal, deterministic Chan Theory (缠论) event engine (alpha)
> A small, hackable research scaffold to **detect fractals → build Bi → detect ZhongShu → emit basic buy/sell signals** with **no future-leak beyond confirmation rules**.
> Goal: be **auditable, reproducible, and extendable**.
## Modules
- `chanlab/structs.py` — typed dataclasses for OHLC/Fractal/Bi/Segment/ZhongShu/Signal.
- `chanlab/rules.py` — deterministic rule set (window sizes, inclusion resolution, confirmation delays).
- `chanlab/engine.py` — pipeline: ohlc → fractals → bi → segments → zhongshu → signals.
- `chanlab/signals.py` — simple 3-buy / 3-sell candidate logic with divergence check.
- `backtest.py` — toy walk-forward backtest with T+1, fees, slippage.
- `examples/` — sample CSV + quickstart notebook stub (coming soon).
## Philosophy
1) **Deterministic**: same data ⇒ same marks.  
2) **Explicit delays**: we wait for confirmation (e.g., fractal confirmed at *i* only after bar *i+2* closes).  
3) **Composable**: swap rules without touching the engine.
## Quickstart
```bash
pip install -r requirements.txt  # only needs pandas, numpy
python backtest.py  # runs on the provided sample data
```
# chanlab
