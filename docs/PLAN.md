# 规划

本文是迭代合同：每期有明确完成定义。实现时改代码，同时改本文件的「状态」列。不要在本期塞下一期功能。

## 产品定位

mcpCut 是 **素材剪辑 MCP**，不是 Premiere，也不是 Remotion 那种代码生成视频。

Agent 工作流：

```
inspect → create/import → edit timeline → overlay/audio → preview → render
```

## 分期

| 期 | 状态 | 目标 | 完成定义 |
| --- | --- | --- | --- |
| **0 文档与骨架** | 已交付 | 仓库可安装、MCP 能拉起、schema 定稿 | `npm test` 过；`get_status` 可调用 |
| **1 看见并剪上** | 已交付并完成联调 | 单轨视频：探测、导入、trim、拼接、关键帧预览 | TESTING Phase 1 |
| **2 出片** | 已交付并完成联调 | 异步 render + 版本回滚 | Agent `render`→`get_job` done，原片未改 |
| **3 口播成片** | 进行中 | 字幕轨 + BGM/音量/淡入淡出 | 烧录字幕与配乐后仍能导出；没有字幕/BGM 时导出与 Phase 2 一样 |
| **4 画面层** | 未开始 | 画中画、水印、安全区裁切、多比例导出 | 同一工程可出 9:16 与 16:9 |
| **5 可选智能** | 未开始 | Whisper 出 SRT，场景探测 | 全部是旁路，不进核心时间线引擎 |

## Phase 3 范围（当前）

做：

- `add_overlay`：add_text / update_text / remove_overlay
- `mix_audio`：add_audio / set_volume / remove_audio
- `render` 烧录文字、把 BGM 与视频音轨 amix
- 无字幕、无 BGM 时行为与 Phase 2 相同

不做：贴纸、画中画、Whisper 自动字幕、多比例导出。
