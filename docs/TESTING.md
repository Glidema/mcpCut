# 一起测试

服务名 **mcpcut3**。改代码后若 `get_status` 版本不对：Reload MCP + **新开 Agent 对话**。

## Phase 7 补测（0.7.2）

`get_status` 须为 **0.7.2**。scenes 路径会丢掉 flash，再 evenPick，**不会**把空隙 merge 回整支片子。

工程若已是 rev 21，先 `restore_version` **16**：

```
用 mcpcut3。工程 mcbb-agent-e109c692df40。不要改 vivi/mcbb.MP4。

1. get_status（0.7.2）
2. restore_version revision=16
3. edit_timeline 只发：
   {"op":"cut_highlights","strategy":"hybrid","scope":"clip","minSec":1.2,"maxClips":8}
4. strategyUsed=scenes；主轨多于 1 段；**keepSec 必须明显小于 60s**
5. preview_project maxFrames=4
```

## 已通过 / 已知问题

- 0.7.1 scenes 曾 merge 成 8 块铺满 60.12s；0.7.2 改为丢 flash + evenPick 留空隙
- 0.7.0 hybrid 曾把 MV 判成 59s 口播
- Phase 6：18 个硬切
