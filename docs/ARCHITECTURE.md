# 架构

## 分层

```
MCP tools  →  project store (JSON + versions)  →  timeline math
                                              →  ffmpeg/ffprobe engine
                                              →  (phase2) job runner
```

工具层只做：校验参数、读写工程、返回给 Agent 的短文本/少量图片。  
时间线计算不调用 FFmpeg。FFmpeg 只出现在 inspect / preview / 以后的 render。

## 工程目录

`MCPCUT_ROOT`（默认 `./.mcpcut`）：

```
.mcpcut/
  projects/
    <projectId>/
      project.json
      versions/
        rev-0001.json
      media/          # 导入后的副本
      previews/
      renders/        # phase 2
      transcripts/    # phase 5 sidecar SRT
```

素材导入时 **复制** 进 `media/`，时间线只引用工程内相对路径。这样工程可搬、Agent 也不会死盯用户桌面的原路径。

## 时间线

Phase 1 只有一条视频轨，片段按数组顺序 **无缝拼接**。每项：

- `clipId` 指向 `media[]`
- `in` / `out` 是源素材秒数
- `start` 由引擎重算，Agent 不必手填（传入会被忽略并重排）

`edit_timeline` 接收操作数组，在一份草稿上顺序应用，通过校验后原子写盘，并打一份 revision 快照。

## 给 Agent 的数据

| 该给 | 不该给 |
| --- | --- |
| 工程摘要、素材探针、预览图、明确错误 | 完整 FFmpeg stderr、整份巨大 JSON（除非 describe 不够） |
| 稳定 id（clip / item / project） | 易变的绝对路径作为主键 |

`describe_project` 是下一轮推理的默认入口；需要细节时再读 `project.json` 字段（工具返回里带精简 JSON）。

## 异步边界（Phase 2 才启用）

- 任何可能超过数秒的编码：**render / transcribe** → `{ jobId }` → `get_job`
- Whisper 只写 `transcripts/*.srt`，不进时间线引擎
- Phase 1 的 `preview_project` 抽帧通常很快，保持同步；单次最多抽 12 张，超时要失败而不是挂死

## 二进制

启动时解析 `FFMPEG_PATH` / `FFPROBE_PATH`，否则 `PATH` 里找 `ffmpeg` / `ffprobe`。`get_status` 报告是否可用。缺二进制时 inspect/preview 返回 `isError`，服务器仍可响应其它工具。
