# 一起测试

每期只跑对应清单。当前样片：`vivi/mcbb.MP4`（已 gitignore，不入库）。

有两条测法：**脚本冒烟**（先确认引擎）和 **Cursor 里让 Agent 调 MCP**（真正目标）。

## 0. 环境

```bash
node -v          # >= 20
npm test
npm run typecheck
```

本机可以没有系统 FFmpeg：mcpCut 会用依赖里的 `ffmpeg-static` / `ffprobe-static`。

## 1. 先跑脚本冒烟（不经过 Cursor）

```bash
npm run smoke:phase1 -- vivi/mcbb.MP4
```

期望：打印 inspect 结果 → 建工程 → 两段 0–3s 与 5–8s → trim / reorder / 两张预览 JPEG → 删一段。结尾 `OK <projectId>`。

工程在 `.mcpcut/projects/`。

## 2. Cursor 里测 MCP（主路径）

1. 项目已写 `.cursor/mcp.json`。打开 Cursor Settings → MCP，确认 **mcpcut** 为已连接，工具列表有 7 个。
2. 若未出现：Reload Window，或把该 JSON 贴进用户级 MCP 配置。
3. **新开一个 Agent 对话**（不要用普通 Chat 除非已开 MCP），把下面整段发出去。

---

请只用 mcpcut 的 MCP 工具，不要自己跑 ffmpeg。素材路径：

`/Users/maxiaoge/Documents/github/software/mcpCut/vivi/mcbb.MP4`

1. `get_status`
2. `inspect_media` 看这段视频
3. `create_project` name=`mcbb-agent` aspect=`9:16`
4. `import_clip`
5. `edit_timeline` 加两段：0–3 秒、5–8 秒
6. `describe_project`（应约 6 秒、两段）
7. 把第一段 `trim_video` 成 0–1.5 秒
8. `reorder_video` 交换两段
9. `preview_project`（maxFrames=2），根据关键帧描述画面
10. `remove_item` 删掉当前第一段，再 `describe_project`

每一步把工具返回的摘要贴出来。失败也原样报错。

---

## 预期失败（也要测）

- 不存在的路径 inspect
- `out <= in` 的 trim
- 空工程 preview
- `reorder_video` 漏 id

## 反馈格式

```
步骤: 7 trim
期望: revision+1，时长变短
实际: ...
阻塞?: 是/否
```
