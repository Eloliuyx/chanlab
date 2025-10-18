from dataclasses import dataclass
from typing import Optional, List

@dataclass
class Bar: # K线
    ts: int
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0

@dataclass
class Fractal: # 分型
    idx: int
    kind: str              # 'top' or 'bottom'
    high: float
    low: float
    confirmed_at: int

@dataclass
class Bi: # 笔
    start_idx: int
    end_idx: int
    direction: str         # 'up' or 'down'
    high: float
    low: float

@dataclass
class Segment: # 更高层段 Segment
    start_bi: int
    end_bi: int
    direction: str
    start_price: float
    end_price: float
    bar_count: int
    vol_sum: float

@dataclass
class ZhongShu: # 中枢
    start_bi: int
    end_bi: int
    zgg: float
    zdd: float

@dataclass
class Signal: # 在既定结构与规则下、落地到具体索引（bar 序号）的客观信号。
    idx: int
    tag: str
    info: str = ""
