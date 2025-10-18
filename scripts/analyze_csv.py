# scripts/analyze_csv.py
import pandas as pd, json, hashlib, sys
from chanlab.structs import Bar
from chanlab.rules import resolve_inclusions, detect_fractals
from chanlab.engine import build_bi, build_zhongshu

def load_csv(path):
    df = pd.read_csv(path)
    bars = [Bar(ts=int(i), open=r.Open, high=r.High, low=r.Low, close=r.Close, volume=float(r.get('Volume',0)))
            for i, r in df.iterrows()]
    return bars

def deterministic_digest(obj)->str:
    blob = json.dumps(obj, ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(blob.encode()).hexdigest()

def run(path):
    bars = load_csv(path)
    bars_inc = resolve_inclusions(bars)
    frs = detect_fractals(bars_inc)
    bis = build_bi(frs)
    zses = build_zhongshu(bis, min_bi=3)

    out = {
        "fractals":[{"idx":f.idx,"kind":f.kind,"high":f.high,"low":f.low,"confirmed_at":f.confirmed_at} for f in frs],
        "bis":[{"start_idx":b.start_idx,"end_idx":b.end_idx,"direction":b.direction,"high":b.high,"low":b.low} for b in bis],
        "zhongshus":[{"start_bi":z.start_bi,"end_bi":z.end_bi,"zgg":z.zgg,"zdd":z.zdd} for z in zses]
    }
    print("digest:", deterministic_digest(out))
    with open("outputs/last_events.json","w",encoding="utf-8") as f:
        json.dump(out,f,ensure_ascii=False,indent=2)

if __name__ == "__main__":
    import os; os.makedirs("outputs", exist_ok=True)
    run(sys.argv[1] if len(sys.argv)>1 else "data/sample.csv")
