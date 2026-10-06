# MCP 工具

工具名用 snake_case。描述写给模型：能做什么、不能做什么、返回什么。

## Phase 1（已注册）

### get_status

无参数。返回 mcpCut 版本、当前 phase、`MCPCUT_ROOT`、ffmpeg/ffprobe 是否找到。

### create_project

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `name` | 是 | 工程名 |
| `aspect` | 否 | 默认 `9:16` |

返回 `projectId` 与 spec。

### inspect_media

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `path` | 是 | 本地绝对或相对路径 |

调用 ffprobe。不导入工程。失败时说明缺二进制或文件不可读。

### import_clip

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `projectId` | 是 | |
| `path` | 是 | 本地文件，将复制进 `media/` |

内部会先 inspect。返回 `clipId` 与探针摘要。

### edit_timeline

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `projectId` | 是 | |
| `operations` | 是 | 按顺序应用 |

操作：

```json
{ "op": "add_video", "clipId": "clip_...", "in": 0, "out": 3.5, "layout": "pip", "start": 2 }
{ "op": "trim_video", "itemId": "v_...", "in": 1.2, "out": 4.0 }
{ "op": "remove_item", "itemId": "v_..." }
{ "op": "reorder_video", "itemIds": ["v_a", "v_b"] }
```

`add_video` 省略 `in`/`out` 时用整段素材时长。`layout=pip` 时用 `start` 作为画中画入点（秒）。`reorder_video` 的 `itemIds` 必须是当前视频轨的全排列。

返回新 revision 与 `describe` 摘要。

### preview_project

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `projectId` | 是 | |
| `maxFrames` | 否 | 默认 6，最大 12 |

为每个视频项抽 1 张中点帧（项多时截断到 maxFrames）。返回 JPEG 路径，并尽量附带 image content 给支持视觉的客户端。

空时间线应明确报错，而不是空成功。

### describe_project

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `projectId` | 是 | |

短文本：画幅、素材数、段数、每段 in/out/时长、总时长。附一份不含巨大字段的 JSON。

## Phase 2（已注册）

### render

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `projectId` | 是 | |
| `aspect` | 否 | `9:16` / `16:9` / `1:1`，覆盖工程画幅 |
| `fit` | 否 | `contain` 留边 / `cover` 裁满 |

立刻返回 `{ jobId, status }`。不改原片。空时间线报错。成片名可带 `16x9-cover` 等后缀。

### get_job

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `jobId` | 是 | |

`queued` / `running` / `done` / `error`。成功时 `outputPath` 为成片 mp4。

### restore_version

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `projectId` | 是 | |
| `revision` | 是 | 已有快照号，如 3 |

恢复后 revision +1，旧快照保留。

### add_overlay

一次加一条字幕（扁平参数，便于 Cursor 识别）。

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `projectId` | 是 | |
| `text` | 是 | 最多 200 字 |
| `start` / `end` | 是 | 时间线秒 |
| `style` | 否 | `title` \| `subtitle` \| `caption`，默认 caption |
| `position` | 否 | `top-right` 等，角标水印 |
| `removeItemId` | 否 | 传入则只删该 `t_*`，忽略 text |

### mix_audio

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `projectId` | 是 | |
| `clipId` | 是 | 先 `import_clip` |
| `volume` | 否 | 默认 0.25 |
| `fadeIn` / `fadeOut` / `start` | 否 | |

### transcribe

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `projectId` | 是 | |
| `language` | 否 | 如 `Chinese`；省略则自动检测 |

立刻返回 `{ jobId }`。`get_job` 成功时 `outputPath` 为 sidecar SRT。不改 `project.json`。需要 `python3 -m whisper`（或 `WHISPER_BIN`），默认模型 `small`（`WHISPER_MODEL`）。

## 以后才注册

| 工具 | 期 |
| --- | --- |
| 场景探测 | 以后 |

未实现的工具 **不注册**，避免模型调用到占位符。
