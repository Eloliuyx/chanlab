# 🧩 Chanlab Changelog / 更新日志

All notable changes to this project will be documented in this file.
本文档用于记录 Chanlab 项目在各版本中的主要变更。

遵循语义化版本号（[Semantic Versioning](https://semver.org/)）格式：
> MAJOR.MINOR.PATCH
> e.g. 1.3.2 = 第一次大改 (1)，第3个功能迭代 (3)，第2个修复更新 (2)


---

## [v1.0.0] – 2025-10-18
### Added
- 初版结构识别引擎（分型、笔、中枢）
- 支持任意时间点 T 的“只看过去”裁剪分析
- 输出 JSON 文件结构定义：`<ticker>_last_<T>_events.json`
