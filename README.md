# mcpCut

Agent 可调用的 MCP 视频剪辑工具。Agent 不写 FFmpeg 命令，只读写一份声明式时间线（`project.json`），再预览、导出。

当前实现：**Phase 3（可测）** — 剪辑、导出、烧录字幕、混合 BGM。  
尚未实现：画中画、水印、Whisper。见 [docs/PLAN.md](docs/PLAN.md)。

## 你在测什么

用 Cursor 连上这个 MCP 后，Agent 应能完成：

1. `get_status` 看环境（FFmpeg 是否就绪）
2. `inspect_media` 读一段本地视频
3. `create_project` + `import_clip`
4. `edit_timeline` 裁两刀、改顺序
5. `preview_project` 抽出关键帧
6. `describe_project` 用短摘要确认时间线
7. `render` + `get_job` 导出成片（原片不会被改）
8. 需要时 `restore_version`

## 依赖

- Node.js 20+
- FFmpeg / ffprobe：优先用系统安装；没有则自动用依赖里的 `ffmpeg-static` / `ffprobe-static`

## 安装与启动

```bash
npm install
npm test
npm run typecheck
npm run smoke:phase1 -- vivi/mcbb.MP4
npm run dev
```

`npm run dev` 走 stdio，给 MCP 客户端拉起，不要当普通 CLI 交互用。

## 接到 Cursor

项目里有示例 [`.cursor/mcp.json.example`](.cursor/mcp.json.example)。把命令改成你的绝对路径后，复制为 Cursor 的 MCP 配置，或在 Cursor Settings → MCP 里添加：

```json
{
  "mcpServers": {
    "mcpcut": {
      "command": "npx",
      "args": ["tsx", "/ABS/PATH/mcpCut/src/index.ts"],
      "env": {
        "MCPCUT_ROOT": "/ABS/PATH/mcpCut/.mcpcut"
      }
    }
  }
}
```

工作目录由 `MCPCUT_ROOT` 指定，默认是进程 cwd 下的 `.mcpcut/`。

## 文档

| 文档 | 内容 |
| --- | --- |
| [docs/PLAN.md](docs/PLAN.md) | 分期目标、完成定义、刻意不做的事 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 工程模型、目录、异步边界 |
| [docs/SCHEMA.md](docs/SCHEMA.md) | `project.json` 字段 |
| [docs/TOOLS.md](docs/TOOLS.md) | 已实现 / 规划中的 MCP 工具 |
| [docs/TESTING.md](docs/TESTING.md) | 一起手工测的清单 |

## 设计约束（不改方向）

- 时间线声明式，禁止把原始 FFmpeg 命令暴露给 Agent
- 编码与 MCP 调用解耦：Phase 2 起 `render` 只返回 job，不阻塞
- 给模型的是摘要和少量预览图，不是 FFmpeg 日志
- 路径收口在工程目录内；Phase 1 只接受本地文件
