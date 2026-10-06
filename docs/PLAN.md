# 规划

本文是迭代合同：已完成的分期不回退；**以后**只是切口，不是当前必须做的范围。

## 已完成 / 当前

| 期 | 状态 | 目标 | 完成定义 |
| --- | --- | --- | --- |
| **0–6** | 已联调 | 工程、剪辑、出片、字幕、BGM、PIP、Whisper、场景 | 见 TESTING 历史 |
| **7 精彩段** | 可测 | 分析内容、识别说话/镜头段并切上时间线 | `cut_highlights` 改主轨；旁路 `highlights/rev-XXXX.json`；原片不动 |

## Phase 7（当前）

不新增工具名。`edit_timeline` 增加 `cut_highlights`（必须单独一条）：

- `hybrid`（默认）：至少 **2 段**说话岛且覆盖不是整段墙式配乐才按口播切；连续配乐（1 段、约 99%）改走场景镜头
- `speech` / `scenes` 可强制
- `scope=clip` 分析整段源；`selection` 只切当前 in/out
- 默认 `apply=true`；`apply=false` 只出计划
- `get_status` **0.7.2 / phase 7**。本机可用 `WHISPER_MODEL` 覆盖（默认仍为 `small`）

## 以后可以做的切口（未开工）

- 按切点拆段的「建议」与精彩段合并策略可视化
- 节拍切 MV、响度、倍速、封面帧、SRT 烧进字幕轨
- job 进度、工程列表
- 后置：云端素材、调色/跟踪、暴露 filter_complex
