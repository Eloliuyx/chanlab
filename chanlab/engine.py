from typing import List
import numpy as np
from .structs import Bar, Fractal, Bi, Segment, ZhongShu
from .rules import Rules, _gt, _lt, _ge, _le

# -------- BI: 相邻异类分型成笔，支持最小跨度/最小幅度阈值（默认0即关闭） --------
# 笔（Bi）是连接一个底分型到其后的顶分型（向上笔），或者一个顶分型到其后的底分型（向下笔）的直线摆动。
def build_bi(fractals: List[Fractal]) -> List[Bi]:
    frs = sorted(fractals, key=lambda x: x.idx)
    bis: List[Bi] = []
    if len(frs) < 2:
        return bis

    # 跳过一开始同类分型，直到出现异类序列
    j = 0
    while j + 1 < len(frs) and frs[j].kind == frs[j+1].kind:
        j += 1

    for k in range(j, len(frs) - 1):
        a, b = frs[k], frs[k+1]
        if a.kind == b.kind:
            continue
        direction = "up" if a.kind == "bottom" else "down"
        start_idx, end_idx = a.idx, b.idx
        high = max(a.high, b.high)
        low  = min(a.low,  b.low)

        # 最小bar数阈值
        if Rules.MIN_BI_BARS > 0:
            if (end_idx - start_idx + 1) < Rules.MIN_BI_BARS:
                continue

        # 最小价差百分比阈值（相对起点极值）
        if Rules.MIN_BI_PCT > 0.0:
            base = a.low if direction == "up" else a.high
            move = abs(b.high - a.low) if direction == "up" else abs(a.high - b.low)
            if base != 0:
                if (move / abs(base)) < Rules.MIN_BI_PCT - Rules.EPS:
                    continue

        bis.append(Bi(start_idx=start_idx, end_idx=end_idx,
                      direction=direction, high=high, low=low))
    return bis

# -------- ZhongShu: 采用“可延展中枢”（推荐） --------
# 中枢（ZhongShu）是缠论的“平衡锚点”。
def build_zhongshu(bis: List[Bi], min_bi: int = Rules.MIN_BI_FOR_ZS) -> List[ZhongShu]:
    if not bis or len(bis) < min_bi:
        return []

    zs_list: List[ZhongShu] = []
    n = len(bis)
    i = 0

    while i + min_bi <= n:
        highs = [b.high for b in bis[i:i+min_bi]]
        lows  = [b.low  for b in bis[i:i+min_bi]]
        zgg = min(highs)
        zdd = max(lows)
        if _gt(zgg, zdd):
            start = i
            end   = i + min_bi - 1
            cur_zgg, cur_zdd = zgg, zdd

            if Rules.ZS_EXTEND:
                j = end + 1
                while j < n:
                    nh = bis[j].high
                    nl = bis[j].low
                    # 与现中枢重叠则延展，并收紧区间
                    nzgg = min(cur_zgg, nh)
                    nzdd = max(cur_zdd, nl)
                    if _gt(nzgg, nzdd):
                        cur_zgg, cur_zdd = nzgg, nzdd
                        end = j
                        j += 1
                    else:
                        break

            zs_list.append(ZhongShu(start_bi=start, end_bi=end, zgg=cur_zgg, zdd=cur_zdd))
            # 从当前中枢尾部继续扫描，避免生成大量重叠小中枢
            i = end
        else:
            i += 1
    return zs_list

# -------- 力度：|Δclose| / mean(TR) + TIME_WEIGHT * 持续时间 --------
def segment_power(bars: List[Bar], start: int, end: int) -> float:
    closes = np.array([b.close for b in bars])
    highs  = np.array([b.high  for b in bars])
    lows   = np.array([b.low   for b in bars])
    rng = abs(closes[end] - closes[start])
    tr = np.mean(highs[start:end+1] - lows[start:end+1] + Rules.EPS)
    time_amp = (end - start + 1)
    return (rng / (tr + Rules.EPS)) + Rules.TIME_WEIGHT * time_amp

# -------- 背驰：同向两段笔，后段力度 < 0.9 * 前段力度（阈值可配） --------
def detect_divergence(bars: List[Bar], a: Bi, b: Bi) -> bool:
    if a.direction != b.direction:
        return False
    pa = segment_power(bars, a.start_idx, a.end_idx)
    pb = segment_power(bars, b.start_idx, b.end_idx)
    return pb < pa * Rules.DIVERGENCE_RATIO - Rules.EPS
