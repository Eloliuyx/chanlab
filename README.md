# chanlab — Minimal, deterministic Chan Theory (缠论) event engine (alpha)
> A small, hackable research scaffold to **detect fractals → build Bi → detect ZhongShu → emit basic buy/sell signals** with **no future-leak beyond confirmation rules**.
> Goal: be **auditable, reproducible, and extendable**.

Chanlab 是一个完全确定性的缠论结构识别系统，
可在任意时刻 **T** 对任意标的（股票、指数、期货等）的历史数据进行分析，
输出客观的结构识别（分型、笔、中枢）与当前“势”分类结果。

## Quickstart
```bash
pip install -r requirements.txt  # only needs pandas, numpy
python backtest.py  # runs on the provided sample data
```

## 核心逻辑

| 层级 | 英文名        | 作用               | Chanlab 实现               |
| -- | ---------- | ---------------- | ------------------------ |
| 分型 | Fractal    | 定位局部极高/极低        | 5-bar 模型，带 EPS 容忍        |
| 笔  | Bi         | 连接相邻异类分型形成“有效摆动” | 可设最小跨度/幅度阈值              |
| 中枢 | ZhongShu   | 三笔重叠的平衡区间        | 可延展中枢定义                  |
| 力度 | Power      | 描述一段笔的推进能量       | (价差 / 波动) + 时间权重         |
| 背驰 | Divergence | 同方向两段笔的力度衰减      | L₂ < 0.9×L₁ 判定为背驰        |
| 信号 | Signal     | 在结构上触发的客观事件      | e.g. 3_buy near ZhongShu |

## Rule Conventions / 判定口径
| 项目                 | 说明             | 默认值         |
| ------------------ | -------------- | ----------- |
| `EPS`              | 浮点比较容忍         | 1e-8        |
| `FRACTAL_WINDOW`   | 5 根分型窗口        | 2           |
| `ZS_EXTEND`        | 中枢可延展          | ✅           |
| `DIVERGENCE_RATIO` | 背驰阈值           | 0.9         |
| `TIME_WEIGHT`      | 力度时间项系数        | 0.1         |
| `NEAR_PCT`         | “靠近中枢”阈值（半宽比例） | 0.2         |
| `INCLUDE_RESOLVE`  | 包含关系策略         | 双向吸收 absorb |
