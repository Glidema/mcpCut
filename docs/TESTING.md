# 一起测试

服务名 **mcpcut3**。改代码后若 `get_status` 版本不对：Reload MCP + **新开 Agent 对话**。

## Phase 7 补测（0.7.1）

`get_status` 须为 **0.7.1 / phase 7**，`whisperModel` 在本机配置下应为 **medium**（代码默认仍是 small）。

工程现为 rev **17**（误把 MV 当口播切成 59s）。先回到 16 再切：

```
用 mcpcut3。工程 mcbb-agent-e109c692df40。不要改 vivi/mcbb.MP4。

1. get_status（0.7.1，whisperModel=medium）
2. restore_version revision=16
3. edit_timeline 只发一条：
   {"op":"cut_highlights","strategy":"hybrid","scope":"clip","minSec":1.2,"maxClips":8}
4. 必须 strategyUsed=scenes，主轨多于 1 段，keepSec 明显小于 60s
5. preview_project maxFrames=4（画面应有变化）
```

期望：不再整段 0.68–60s 一条；hybrid 把「几乎无静音的配乐」当场景切。

## 已通过 / 已知误判

- 0.7.0 `cut_highlights` 曾把 MV 判成 speech（99% 语音岛 → 一条 59.43s）。0.7.1 已修
- Phase 6：18 个硬切
- Phase 5–1：`rev-0016.mp4`、`rev-0015-16x9-cover.mp4`
