# 一起测试

每期只跑对应清单。样片：`vivi/mcbb.MP4`（不入库）。

## 环境

```bash
npm test
npm run typecheck
npm run smoke:phase1 -- vivi/mcbb.MP4
```

工程目录：`.mcpcut/projects/`。原片 `vivi/mcbb.MP4` 不会被改写。

## Phase 1（已通过）

Agent 调 MCP：inspect → create → import → 两段 0–3s / 5–8s → trim → reorder → preview → remove。产物是 `project.json`、`media/` 副本、`previews/*.jpg`。

## Phase 2（当前）

脚本：

```bash
npm run smoke:phase2 -- mcbb-agent-e109c692df40
```

Cursor：Reload MCP 后新开对话：

```
请只用 mcpcut MCP。工程 mcbb-agent-e109c692df40：
1. describe_project
2. 若只剩 1.5s 一段，restore_version 回到两段版（rev 5）
3. render
4. 轮询 get_job 直到 done
5. 给出成片路径；不要改 vivi/mcbb.MP4
```

期望：`renders/rev-XXXX.mp4` 可播放，时长约 4.5s（恢复到两段后）或 1.5s（不恢复）。`vivi/mcbb.MP4` 仍是约 60s。

## 反馈格式

```
步骤: render
期望: get_job done，renders 下有 mp4
实际: ...
阻塞?: 是/否
```
