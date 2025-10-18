from typing import List
from .structs import Bar, Fractal

class Rules:
    # ----- numerical stability -----
    EPS: float = 1e-8

    # ----- inclusion resolve strategy -----
    # "absorb": 双向吸收为“盒子”（外包线）；"keep": 保持原样
    INCLUDE_RESOLVE: str = "absorb"

    # ----- fractal (5-bar model) -----
    FRACTAL_WINDOW: int = 2  # confirm with i±2
    # 当出现等高/等低时，允许轻微容忍，避免抖动
    FRACTAL_REQUIRE_STRICT_PEAK: bool = False  # 若 True 则必须严格大/小于

    # ----- BI minimal thresholds (默认关闭=0) -----
    MIN_BI_BARS: int = 0          # 笔的最小bar数
    MIN_BI_PCT: float = 0.0       # 笔的最小价差百分比（相对起点价的百分比）

    # ----- ZhongShu -----
    MIN_BI_FOR_ZS: int = 3        # 经典3笔形成中枢
    # 是否采用“可延展中枢”（推荐）：后续笔与中枢区间重叠则延展并收紧区间
    ZS_EXTEND: bool = True

    # ----- divergence / power -----
    DIVERGENCE_RATIO: float = 0.9
    TIME_WEIGHT: float = 0.1      # segment_power 时间项系数

    # ----- near-ZS signal -----
    # 以“中枢半宽”的百分比定义“near”容忍（如0.2表示20%半宽）
    NEAR_PCT: float = 0.2

# -------- helpers for stable comparisons --------
def _gt(a: float, b: float, eps: float = Rules.EPS) -> bool: return a >  b + eps
def _lt(a: float, b: float, eps: float = Rules.EPS) -> bool: return a <  b - eps
def _ge(a: float, b: float, eps: float = Rules.EPS) -> bool: return a >= b - eps
def _le(a: float, b: float, eps: float = Rules.EPS) -> bool: return a <= b + eps

# -------- inclusion resolving (双向吸收) --------
#若 A 完全包含 B 或 B 完全包含 A，则把两根合并成一个“盒子”：
# high = max(high_A, high_B)，low = min(low_A, low_B)
# open 取较早者的开盘（盒子起点），close 取较晚者的收盘（盒子收尾）
#volume 相加

def resolve_inclusions(bars: List[Bar]) -> List[Bar]:
    out: List[Bar] = []
    for b in bars:
        if not out:
            out.append(b)
            continue
        p = out[-1]
        # 任意方向的“包含”都吸收为外包线
        if ((b.high <= p.high and b.low >= p.low) or
            (p.high <= b.high and p.low >= b.low)):
            if Rules.INCLUDE_RESOLVE == "absorb":
                high = max(p.high, b.high)
                low  = min(p.low,  b.low)
                out[-1] = Bar(
                    ts=b.ts,                    # 时间前移到最新bar
                    open=p.open,                # 保留盒子的起始开盘价
                    high=high, low=low,
                    close=b.close,              # 用最新收盘收尾
                    volume=p.volume + b.volume
                )
            else:
                out.append(b)
        else:
            out.append(b)
    return out

# -------- fractals (5-bar model, 容忍等高/等低) --------
# 我们用最常见的 5 根分型（i±2）：

# 顶分型：第 i 根高点 ≥ 左右两侧各两根的高点（允许“等高一点点”，用 EPS 容忍）。

# 底分型：第 i 根低点 ≤ 左右两侧各两根的低点（同理）。

def detect_fractals(bars: List[Bar]) -> List[Fractal]:
    frs: List[Fractal] = []
    n = len(bars)
    w = Rules.FRACTAL_WINDOW
    if n < 2*w + 1:
        return frs

    for i in range(w, n - w):
        H = bars[i].high; L = bars[i].low
        left_highs  = [bars[i-k].high for k in range(1, w+1)]
        right_highs = [bars[i+k].high for k in range(1, w+1)]
        left_lows   = [bars[i-k].low  for k in range(1, w+1)]
        right_lows  = [bars[i+k].low  for k in range(1, w+1)]

        is_top = _ge(H, max(left_highs + right_highs))
        is_bot = _le(L, min(left_lows  + right_lows))

        if Rules.FRACTAL_REQUIRE_STRICT_PEAK:
            is_top = all(_gt(H, x) for x in left_highs + right_highs)
            is_bot = all(_lt(L, x) for x in left_lows  + right_lows)

        if is_top:
            frs.append(Fractal(idx=i, kind="top",    high=H, low=L, confirmed_at=i+w))
        if is_bot:
            frs.append(Fractal(idx=i, kind="bottom", high=H, low=L, confirmed_at=i+w))
    return frs
