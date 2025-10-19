from typing import List
from .structs import Bar, Bi, ZhongShu, Signal
from .rules import Rules, _ge, _le

# 判定“靠近中枢”：以中枢半宽的 NEAR_PCT 作为容忍；允许“贴近/触及/轻微假破后回收”
def _near_zs(bi: Bi, zs: ZhongShu) -> bool:
    half = 0.5 * (zs.zgg - zs.zdd)
    tol = Rules.NEAR_PCT * max(half, 1e-6)  # 防止极窄中枢除零
    # 三种情形视为 near：
    # 1) 整条在内
    inside = _ge(bi.low, zs.zdd) and _le(bi.high, zs.zgg)
    # 2) 贴近/触及下沿（low 距 zdd 在 tol 内）
    touch_lower = abs(bi.low - zs.zdd) <= tol
    # 3) 轻微假破（low < zdd - tol）但笔内有回收（high >= zdd - 微容忍）
    fake_break_recover = (bi.low < zs.zdd - tol) and _ge(bi.high, zs.zdd)

    return inside or touch_lower or fake_break_recover

def generate_signals(bars: List[Bar], bis: List[Bi], zses: List[ZhongShu]) -> List[Signal]:
    sigs: List[Signal] = []
    if not zses or len(bis) < 2:
        return sigs

    zs = zses[-1]

    # 模式：连续两段向下的笔，第二段在/近中枢下沿 → 提示 3_buy 候选
    for i in range(2, len(bis)):
        b1, b2 = bis[i-2], bis[i-1]
        if not (b1.direction == "down" and b2.direction == "down"):
            continue

        if _near_zs(b2, zs):
            # 触发点：放在该笔完成后的下一根K线（与原实现一致）
            info = (f"two-down near ZS | bi2.low={b2.low:.6f}, "
                    f"ZS[zdd={zs.zdd:.6f}, zgg={zs.zgg:.6f}]")
            sigs.append(Signal(idx=b2.end_idx + 1, tag="3_buy", info=info))

    return sigs
