# project.json schema

`schemaVersion` 当前为 `1`。不兼容变更必须升版本，并在本文件记录。

## 顶层

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `schemaVersion` | `1` | 结构版本 |
| `id` | string | 工程 id（目录名） |
| `name` | string | 显示名 |
| `createdAt` / `updatedAt` | ISO-8601 | |
| `revision` | int | 每次成功编辑 +1，从 1 起 |
| `spec` | object | 目标成片规格 |
| `media` | array | 已导入素材 |
| `tracks.video` | array | 唯一视频轨 |
| `tracks.audio` | array | BGM 等额外音轨，可与视频重叠 |
| `tracks.text` | array | 烧录字幕/标题 |

## spec

| 字段 | 说明 |
| --- | --- |
| `width` / `height` | 像素 |
| `fps` | 目标帧率 |
| `aspect` | `9:16` \| `16:9` \| `1:1` \| `custom` |

预设：

- `9:16` → 1080×1920
- `16:9` → 1920×1080
- `1:1` → 1080×1080

Phase 1 只记录 spec，预览抽帧不强制缩放。

## media[]

| 字段 | 说明 |
| --- | --- |
| `id` | `clip_*` |
| `kind` | `video` \| `audio` \| `image` |
| `originalPath` | 导入前用户路径（仅审计） |
| `relPath` | 相对工程根，如 `media/clip_xxx.mp4` |
| `durationSec` | 可空 |
| `width` `height` `fps` `hasAudio` | 探针结果 |
| `importedAt` | ISO-8601 |

## tracks.video[]

| 字段 | 说明 |
| --- | --- |
| `id` | `v_*` 时间线项 id |
| `clipId` | 指向 media.id |
| `in` / `out` | 源入出点，秒，`out > in` |
| `start` | 时间线上的起点，由 pack 重算 |

轨时长 = 最后一项 `start + (out - in)`。不允许重叠或空隙（Phase 1）。

`edit_timeline` 的 `cut_highlights` 不写入 schema 新字段，只替换 `tracks.video` 主轨项。

## tracks.text[]

| 字段 | 说明 |
| --- | --- |
| `id` | `t_*` |
| `start` / `end` | 时间线秒 |
| `text` | 最多 200 字 |
| `style` | `title` \| `subtitle` \| `caption` |

## tracks.audio[]

| 字段 | 说明 |
| --- | --- |
| `id` | `a_*` |
| `clipId` | 已导入素材（audio 或带音轨的 video） |
| `in` / `out` | 源入出点 |
| `start` | 时间线上何时开始 |
| `volume` | 线性增益，BGM 默认 0.25 |
| `fadeIn` / `fadeOut` | 可选秒数 |

## 版本快照

每次写入 `project.json` 同时写 `versions/rev-XXXX.json`（XXXX = 4 位 revision）。Phase 2 的 `restore_version` 从这里恢复。
