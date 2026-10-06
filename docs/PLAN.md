# 规划

本文是迭代合同。不要在本期塞下一期功能。

## 分期

| 期 | 状态 | 目标 | 完成定义 |
| --- | --- | --- | --- |
| **0–2** | 已联调 | 工程、剪辑、预览、异步出片 | Agent 可导出 mp4，原片不动 |
| **3 口播成片** | 字幕已联调；BGM 未测 | 字幕 + mix_audio | 烧录字幕后能导出 |
| **4 画面层** | 进行中 | 画中画、水印位置、cover 裁切、多比例导出 | 同一工程可出 16:9 cover 和带 PIP 的 9:16 |
| **5 可选智能** | 未开始 | Whisper / 场景 | 旁路 |

## Phase 4（当前）

不新增工具名，只扩展现有工具：

- `render`：可选 `aspect`（9:16 / 16:9 / 1:1）、`fit`（contain 留边 / cover 裁切）
- `edit_timeline` `add_video`：可选 `layout=pip` + `start`
- `add_overlay`：可选 `position=top-right` 做角标水印；`removeItemId` 删旧字幕

改完后 `get_status` 为 0.4.0 / phase 4，需 Reload **mcpcut3** 并新开对话一次。
