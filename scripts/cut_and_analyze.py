# scripts/cut_and_analyze.py
# python -m scripts.cut_and_analyze data/600519_daily.csv 2025-09-30
import sys, json, hashlib, os
import pandas as pd
from datetime import datetime, date
from pathlib import Path
from chanlab.chanlab_core.structs import Bar
from chanlab.chanlab_core.rules import resolve_inclusions, detect_fractals
from chanlab.chanlab_core.engine import build_bi, build_zhongshu

# ---------- helpers ----------
CN2EN = {
    "日期": "Date",
    "开盘": "Open",
    "收盘": "Close",
    "最高": "High",
    "最低": "Low",
    "成交量": "Volume",
}

PREFERRED = ["Date","Open","High","Low","Close","Volume"]

def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    cols = {c: CN2EN.get(c, c) for c in df.columns}
    df = df.rename(columns=cols)
    # 只要 Date 存在就统一成 yyyy-mm-dd 字符串
    if "Date" in df.columns:
        df["Date"] = pd.to_datetime(df["Date"]).dt.strftime("%Y-%m-%d")
    return df

def parse_date(s: str) -> date:
    # 支持 YYYY-MM-DD 或 ISO；只取日期部分
    try:
        return datetime.fromisoformat(s).date()
    except Exception:
        return datetime.strptime(s, "%Y-%m-%d").date()

def cut_to_T_daily(df: pd.DataFrame, T_str: str) -> pd.DataFrame:
    if "Date" in df.columns:
        T = parse_date(T_str)
        df_le = df[df["Date"] <= T.strftime("%Y-%m-%d")]
        if df_le.empty:
            return df.iloc[0:0]
        last_day = df_le["Date"].iloc[-1]
        return df[df["Date"] <= last_day]
    else:
        # 没有日期列：无法按 T 精确裁，只能返回全量（仍符合“只看已有数据”）
        return df

def to_bars(df: pd.DataFrame):
    def pick(row, en, cn):
        return row.get(en) if en in row else row.get(cn, None)
    bars = []
    for i, r in df.iterrows():
        o = pick(r, "Open", "开盘")
        h = pick(r, "High", "最高")
        l = pick(r, "Low", "最低")
        c = pick(r, "Close", "收盘")
        v = pick(r, "Volume", "成交量") or 0
        bars.append(Bar(ts=int(i), open=float(o), high=float(h), low=float(l), close=float(c), volume=float(v)))
    return bars

def digest(obj) -> str:
    return hashlib.sha256(json.dumps(obj, ensure_ascii=False, sort_keys=True).encode()).hexdigest()

def ticker_from_path(path: str) -> str:
    """从文件名中提取 ticker；规则：取 basename 去扩展名后，按 '_' 切分取第一段"""
    stem = Path(path).stem           # e.g., '600519_daily'
    tick = stem.split("_")[0] or stem
    return tick

# ---------- main ----------
def run(path: str, T_str: str):
    df = pd.read_csv(path)
    df = normalize_columns(df)
    df_cut = cut_to_T_daily(df, T_str)

    bars = to_bars(df_cut)
    bars_inc = resolve_inclusions(bars)
    frs = detect_fractals(bars_inc)
    bis = build_bi(frs)
    zses = build_zhongshu(bis, min_bi=3)

    out = {
        "symbol": ticker_from_path(path),
        "cutoff": T_str,
        "count_bars": len(bars),
        "fractals": [{"idx": f.idx, "kind": f.kind, "high": f.high, "low": f.low, "confirmed_at": f.confirmed_at} for f in frs],
        "bis": [{"start_idx": b.start_idx, "end_idx": b.end_idx, "direction": b.direction, "high": b.high, "low": b.low} for b in bis],
        "zhongshus": [{"start_bi": z.start_bi, "end_bi": z.end_bi, "zgg": z.zgg, "zdd": z.zdd} for z in zses],
    }
    out["shi"] = classify_shi(bars, bis, zses)

    tick = out["symbol"]
    # 统一把 T 正常化成 YYYY-MM-DD（文件名友好）
    T_norm = parse_date(T_str).strftime("%Y-%m-%d")
    os.makedirs("outputs", exist_ok=True)
    out_dir = Path("outputs") / tick
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{tick}_last_{T_norm}_events.json"


    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print(f"digest: {digest(out)}")
    print(f"saved:  {out_path}")



# ---------- power & divergence ----------
def _atr_proxy(bars, i, j):
    # 平均真实波幅的简化版：平均(high-low)
    if j < i: return 1e-9
    span = bars[i:j+1]
    return max(sum((b.high - b.low) for b in span) / max(1, len(span)), 1e-9)

def _segment_power(bars, bi):
    # 价幅 / ATR + 时间权重（轻量口径；量能权重先留空位）
    p0, p1 = bars[bi.start_idx].close, bars[bi.end_idx].close
    rng = abs(p1 - p0)
    atr = _atr_proxy(bars, bi.start_idx, bi.end_idx)
    time_amp = (bi.end_idx - bi.start_idx + 1)
    return (rng / atr) + 0.1 * time_amp

def _last_two_same_dir_bi(bis, direction):
    same = [b for b in bis if b.direction == direction]
    return same[-2:] if len(same) >= 2 else []

def _is_divergent(bars, bi1, bi2, decay=0.9):
    # 同向两段：后段力度明显小于前段（且价格未创更极端）
    p1 = _segment_power(bars, bi1)
    p2 = _segment_power(bars, bi2)
    weaker = p2 < p1 * decay

    made_new_extreme = False
    if bi1.direction == "up":
        # 若后段没有突破前段高点，则更可信
        made_new_extreme = bars[bi2.end_idx].high > bars[bi1.end_idx].high
    else:
        made_new_extreme = bars[bi2.end_idx].low < bars[bi1.end_idx].low

    return (weaker and not made_new_extreme), p1, p2

# ---------- classify Shi (势) ----------
def classify_shi(bars, bis, zses):
    if not bis:
        return []

    last_bar = bars[-1]
    direction = bis[-1].direction
    zs = zses[-1] if zses else None

    def _window_from_recent(n=5):
        s = max(0, len(bars) - n)
        return {"start": bars[s].ts, "end": bars[-1].ts}

    notes = []
    label = "未判定"

    # 1) 背驰检测（优先给出“势尽待变”）
    # 上升势里看两段上笔；下降势里看两段下笔
    up2 = _last_two_same_dir_bi(bis, "up")
    dn2 = _last_two_same_dir_bi(bis, "down")
    divergence_hit = False
    if len(up2) == 2:
        dv, p1, p2 = _is_divergent(bars, up2[0], up2[1], decay=0.9)
        if dv:
            divergence_hit = True
            label = "上升势·势尽待变（同级别背驰）"
            notes.append(f"最近两段上笔力度衰减：L2={p2:.2f} < 0.9×L1={p1:.2f}，且未创更高点")
    if not divergence_hit and len(dn2) == 2:
        dv, p1, p2 = _is_divergent(bars, dn2[0], dn2[1], decay=0.9)
        if dv:
            divergence_hit = True
            label = "下降势·势尽待变（同级别背驰）"
            notes.append(f"最近两段下笔力度衰减：L2={p2:.2f} < 0.9×L1={p1:.2f}，且未创更低点")

    # 2) 若未触发背驰，再按“中枢位置+方向”判势
    if not divergence_hit:
        if zs:
            zgg, zdd = zs.zgg, zs.zdd
            price = last_bar.close
            if price > zgg and direction == "up":
                label = "上破中枢·推进势"
                notes.append(f"收盘 {price:.2f} > ZGG({zgg:.2f})，方向上升，趋势延续")
            elif price < zdd and direction == "down":
                label = "下破中枢·推进势"
                notes.append(f"收盘 {price:.2f} < ZDD({zdd:.2f})，方向下降，趋势延续")
            elif zdd <= price <= zgg:
                label = "中枢内·平衡势"
                notes.append(f"收盘 {price:.2f} 位于中枢区间 [{zdd:.2f}, {zgg:.2f}]，平衡未破")
            else:
                label = "中枢附近·待突破"
                notes.append(f"收盘 {price:.2f} 接近中枢边界，方向 {direction}")
        else:
            label = "无中枢·趋势延续"
            notes.append(f"尚未形成中枢，最近一笔方向：{direction}，收盘 {last_bar.close:.2f}")

    # 3) 输出势时段（v1：用最近 N 根bar 代替；后续可换成“离开/进入中枢”的精确锚点）
    out = {
        "window": _window_from_recent(5),
        "label": label,
        "evidence": notes
    }
    return [out]


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "data/600519_daily.csv"
    T = sys.argv[2] if len(sys.argv) > 2 else "2025-09-30"
    run(path, T)
