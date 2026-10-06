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
{ "op": "add_video", "clipId": "clip_...", "in": 0, "out": 3.5 }
{ "op": "trim_video", "itemId": "v_...", "in": 1.2, "out": 4.0 }
{ "op": "remove_item", "itemId": "v_..." }
{ "op": "reorder_video", "itemIds": ["v_a", "v_b"] }
```

`add_video` 省略 `in`/`out` 时用整段素材时长。`reorder_video` 的 `itemIds` 必须是当前视频轨的全排列。

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

## 以后才注册

| 工具 | 期 |
| --- | --- |
| `restore_version` | 2 |
| `render` | 2 |
| `get_job` | 2 |
| `add_overlay` / 字幕 | 3 |
| `mix_audio` | 3 |

未实现的工具 **不注册**，避免模型调用到占位符。
