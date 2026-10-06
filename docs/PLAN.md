# 规划

本文是迭代合同：每期有明确完成定义。实现时改代码，同时改本文件的「状态」列。不要在本期塞下一期功能。

## 产品定位

mcpCut 是 **素材剪辑 MCP**，不是 Premiere，也不是 Remotion 那种代码生成视频。

Agent 工作流固定为：

```
inspect → create/import → edit timeline → preview → (phase2) render
```

## 分期

| 期 | 状态 | 目标 | 完成定义 |
| --- | --- | --- | --- |
| **0 文档与骨架** | 已交付 | 仓库可安装、MCP 能拉起、schema 定稿 | `npm test` 过；`get_status` 可调用 |
| **1 看见并剪上** | 已交付并完成联调 | 单轨视频：探测、导入、trim、拼接、关键帧预览 | 用一段本地 mp4 走通 TESTING.md 的 Phase 1 清单 |
| **2 出片** | 进行中 | 异步 render + 版本回滚 | `render` 返回 jobId；`get_job` 可取产物；失败可 `restore_version` |
| **3 口播成片** | 未开始 | 字幕轨 + BGM/音量/淡入淡出 | 无烧录字幕与配乐也能预览/导出 |
| **4 画面层** | 未开始 | 画中画、水印、安全区裁切、多比例导出 | 同一工程可出 9:16 与 16:9 |
| **5 可选智能** | 未开始 | Whisper 出 SRT，场景探测 | 全部是旁路，不进核心时间线引擎 |

## Phase 1（已完成联调）

- 建工程、inspect、import、trim/拼接、preview、describe
- 不注册出片工具（当时）

## Phase 2 范围（当前）

做：

- `render`（异步，立刻返回 jobId）
- `get_job`
- `restore_version`（从 `versions/rev-NNNN.json` 恢复并写新 revision）
- 按时间线 trim/concat，缩放到 `spec`，导出 mp4 到 `renders/`

不做：字幕、BGM、多轨、转场、改用户原片。

## 测试与迭代方式

1. 合入一期，只测这一期的清单（[TESTING.md](TESTING.md)）。
2. 测出的问题记在 GitHub issue 或对话里，标「P1 阻塞 / P2 体验 / P3 下一期」。
3. 阻塞项修完再开下一期。
4. 变更 schema 必须改 [SCHEMA.md](SCHEMA.md) 并升 `project.schemaVersion`。

## 成功标准（整条产品）

Agent 无需人类手写 FFmpeg，能把 1–N 段本地视频剪成可预览时间线，再导出常见画幅成片。中途改错可以回滚版本。
