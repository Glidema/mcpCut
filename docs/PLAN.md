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
| **1 看见并剪上** | 已交付代码，待联调 | 单轨视频：探测、导入、trim、拼接、关键帧预览 | 用一段本地 mp4 走通 TESTING.md 的 Phase 1 清单 |
| **2 出片** | 未开始 | 异步 render + 版本回滚 | `render` 返回 jobId；`get_job` 可取产物；失败可 `restore_version` |
| **3 口播成片** | 未开始 | 字幕轨 + BGM/音量/淡入淡出 | 无烧录字幕与配乐也能预览/导出 |
| **4 画面层** | 未开始 | 画中画、水印、安全区裁切、多比例导出 | 同一工程可出 9:16 与 16:9 |
| **5 可选智能** | 未开始 | Whisper 出 SRT，场景探测 | 全部是旁路，不进核心时间线引擎 |

## Phase 1 范围（当前）

做：

- `get_status`
- `create_project`
- `inspect_media`
- `import_clip`
- `edit_timeline`（add / trim / remove / reorder 视频项）
- `preview_project`（每段关键帧 JPEG，附带 image content）
- `describe_project`
- 每次编辑写 `versions/rev-NNNN.json`
- 无 FFmpeg 时返回可读错误，而不是崩掉进程

不做：

- `render` / `get_job`（工具先不注册，避免 Agent 乱调）
- 字幕、音频轨编辑
- 转场、调色、多视频轨
- URL / 远程下载素材
- HTTP MCP（先 stdio）

## 测试与迭代方式

1. 合入一期，只测这一期的清单（[TESTING.md](TESTING.md)）。
2. 测出的问题记在 GitHub issue 或对话里，标「P1 阻塞 / P2 体验 / P3 下一期」。
3. 阻塞项修完再开下一期。
4. 变更 schema 必须改 [SCHEMA.md](SCHEMA.md) 并升 `project.schemaVersion`。

## 成功标准（整条产品）

Agent 无需人类手写 FFmpeg，能把 1–N 段本地视频剪成可预览时间线，再导出常见画幅成片。中途改错可以回滚版本。
