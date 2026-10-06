# 一起测试

服务名 **mcpcut3**。改代码后若 `get_status` 版本不对：Reload MCP + **新开 Agent 对话**。

规划 0–7 期已在工程 `mcbb-agent-e109c692df40` 上联调。工作目录现为可见的 `mcpcut-data/`（gitignore，不进 GitHub）。改 `MCPCUT_ROOT` 后请 Reload，否则会去找旧的 `.mcpcut`。

## 已通过

- Phase 7：`cut_highlights` hybrid → scenes，rev 23，8 段主轨，**keepSec 47.22s / 60.12s**
- 0.7.1 曾 merge 铺满 60s；0.7.0 曾误判口播 59s
- Phase 6：18 个硬切
- Phase 5–1：`rev-0016.mp4`、`rev-0015-16x9-cover.mp4`
