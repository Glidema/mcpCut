# 一起测试

样片：`vivi/mcbb.MP4`。工程：`mcbb-agent-e109c692df40`。

原片不会被改写。改代码后必须 **Reload MCP**；`get_status` 的 version / phase 对不上就还是旧进程。

## Phase 1–2（已通过）

剪辑时间线并 `render` → `get_job` done。成片示例：`renders/rev-0007.mp4`。

## Phase 3（当前）

先 Reload MCP。配置里的服务名是 **mcpcut3**（为打破 Cursor 工具目录缓存）。`get_status` 应为 **version 0.3.1、phase 3**，工具列表须能直接看到 `add_overlay`。旧对话请丢掉，**新开 Agent 对话**：

新开对话：

```
请只用 mcpcut MCP。工程 mcbb-agent-e109c692df40：
1. get_status（确认 version 0.3.0 / phase 3）
2. describe_project
3. add_overlay 加一条 title：0–2s，文案「mcpCut 测试」
4. 再加一条 caption：2–4.5s，文案「5–8秒 + 开场1.5秒」
5. describe_project
6. render → 轮询 get_job
7. 给出成片路径；不要改 vivi/mcbb.MP4
```

有配乐文件时再测：`import_clip` mp3 → `mix_audio` add_audio volume=0.2 fadeIn=0.3 → render。

期望：成片能看见标题和底部说明；无 BGM 时原视频音轨仍在。
