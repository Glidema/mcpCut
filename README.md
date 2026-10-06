# mcpCut

给 **AI Agent** 用的本地视频剪辑器。你在 Cursor 里用自然语言说「把 20–26 秒和倒计时切在一起、加个水印、出一条 16:9」，Agent 调 MCP 工具完成；**你不会碰到时间线 UI，Agent 也不会手写 FFmpeg 命令**。

当前版本：**0.7.2（Phase 7）** — 剪辑、字幕、BGM、画中画、多比例、Whisper、场景切点、精彩段自动切割。原片只读复制，导出走后台任务。

---

## 这和过去的剪辑工具有什么不同

Premiere / 剪映 / CapCut 是给人点的。`ffmpeg` 封装、脚本、n8n 工作流是给程序员拼命令的。mcpCut 对准的是第三种用法：**模型要在一轮对话里「看见 → 决定 → 改时间线 → 验收 → 出片」**。

| | 传统 NLE | 裸 FFmpeg / 脚本 | mcpCut |
| --- | --- | --- | --- |
| 谁来操作 | 人拖轨道 | 人写滤镜图 | Agent 调少量动词 |
| 状态 | 专用工程文件，模型读不懂 | 无状态，改完难回滚 | 一份 JSON 时间线 + 每次编辑的 revision |
| 给模型看什么 | 屏幕截图、或什么都不给 | stderr 日志 | 短摘要 + 少量预览帧 |
| 出片 | 界面里点导出 | 同步跑到超时 | `render` 立刻返回 job，再 `get_job` |
| 原片 | 可能被时间线引用改坏 | 一条命令写错就覆盖 | 导入时复制进工程，源文件不动 |

特色可以收成四句：

1. **声明式时间线，不是命令管道。** Agent 只说 trim / 顺序 / 字幕 / 音量。FFmpeg 只活在引擎里。
2. **为模型的上下文窗口设计。** `describe_project` 是下一轮推理入口；预览最多 12 张 JPEG；禁止把整份滤镜日志塞给模型。
3. **慢的事情全部异步。** 编码、Whisper 都是 job。MCP 调用几秒内返回，轮询状态即可。
4. **智能功能是旁路。** 转写 SRT、场景切点写在 `transcripts/`、`scenes/`，不自动改时间线。Agent 看过再决定切哪一刀、要不要烧字幕——避免「模型还没确认就被自动剪坏」。

它**不是**调色台、不是特效图、也不是云协作。短视频口播、切片、加字幕/BGM、换比例、出片，这才是切口。

---

## 它现在能做什么

- 建工程、探测本地视频（时长、分辨率、有无音轨）
- 导入素材（复制进工程 `media/`）
- 裁切、拼接、调顺序；画中画；字幕/角标水印；BGM 与淡入淡出
- 关键帧预览；按**硬切点**抽帧（适合 MV、快切）
- 异步导出 9:16 / 16:9 / 1:1，contain 留边或 cover 裁满
- 版本回滚（`restore_version`）
- Whisper 旁路出 SRT（口播少会标明，避免把片头水印当成整段台词）
- **精彩段自动切割**：口播按说话段去掉长静音；对白太少则按场景镜头合并后切上时间线（`edit_timeline` → `cut_highlights`）

工具名刻意很少。Cursor 会缓存 MCP 目录，**能加参数就不要新工具**。完整参数见 [docs/TOOLS.md](docs/TOOLS.md)。

---

## 技术栈

| 层 | 用什么 | 为什么 |
| --- | --- | --- |
| 协议 | MCP TypeScript SDK（stdio） | Cursor / 其它 Agent 客户端直接调工具 |
| 语言 | Node.js 20+、TypeScript、Zod | 校验参数，避免模型乱填 |
| 时间线 | `project.json` + `versions/rev-NNNN.json` | 可回滚、可搬工程 |
| 媒体 | 本机 FFmpeg / ffprobe（可 `vendor/bin` 或 `ffmpeg-static`） | 探测、抽帧、拼接、烧字、混音、场景检测 |
| 语音 | 可选 `python3 -m whisper`（默认模型 `small`） | 旁路 SRT，不进渲染图 |
| 任务 | 本地 jobs 目录 | `queued → running → done / error` |

工作根目录是 `MCPCUT_ROOT`（默认仓库下可见的 `mcpcut-data/`）。该目录 **gitignore，不会进 GitHub**。用 Finder 打开仓库即可看到工程、成片、SRT。

---

## 小白上手（Cursor）

### 1. 环境

- 安装 [Node.js 20+](https://nodejs.org/)
- 本仓库已尽量自带 FFmpeg；没有系统 `ffmpeg` 也能剪。Whisper 要本机有 `python3 -m whisper`（没有也能剪，只是不能转写）

```bash
cd mcpCut
npm install
npm test
npm run typecheck
```

### 2. 接到 Cursor

把 [`.cursor/mcp.json.example`](.cursor/mcp.json.example) 里的路径改成你的绝对路径，放到 Cursor 的 MCP 配置里。本仓库联调时服务名是 **mcpcut3**（改过工具后若目录不更新，换个名字可避开缓存）。

```json
{
  "mcpServers": {
    "mcpcut3": {
      "command": "node",
      "args": [
        "/ABS/PATH/mcpCut/node_modules/tsx/dist/cli.mjs",
        "/ABS/PATH/mcpCut/src/index.ts"
      ],
      "cwd": "/ABS/PATH/mcpCut",
      "env": {
        "MCPCUT_ROOT": "/ABS/PATH/mcpCut/mcpcut-data"
      }
    }
  }
}
```

Whisper 默认模型是 `small`。若要换本机用的型号，在 `env` 里加 `"WHISPER_MODEL": "medium"`（代码默认不变）。

Settings → MCP 里点 **Reload**。新开一个 Agent 对话（Cursor 有时按对话缓存工具列表）。

让 Agent 先调用 `get_status`。应看到版本 **0.7.2**、phase **7**、`ffmpeg: true`。`whisperModel` 应是你配置的值。对不上就 Reload + 新对话。

### 3. 准备一条本地视频

只要本机文件，不要 URL。例如 `vivi/mcbb.MP4`。Agent **不得改原片**；导入后用的是工程里的副本。

### 4. 对 Agent 可以这样说

把路径换成你的文件：

```
用 mcpcut3。不要修改原视频文件。

1. get_status
2. inspect_media 看这条视频，scenes=true
3. create_project，竖屏
4. import_clip
5. 按切点或口播，edit_timeline 裁两段拼上
6. preview_project（或 at=scenes）给我看画面
7. 需要的话 add_overlay / mix_audio
8. render，轮询 get_job，告诉我成片路径
```

成片在：

`mcpcut-data/projects/<projectId>/renders/`

中间版本在 `versions/`，预览图在 `previews/`，转写在 `transcripts/`，切点在 `scenes/`。

`npm run dev` 是给 MCP 客户端拉起的 stdio 服务，不要当普通命令行交互用。

---

## 使用技巧

- **先 `describe_project`，再改。** 摘要里有 `clipId`、`v_*`、`t_*`、总时长。不要猜 id。
- **先 preview 再 render。** 编码慢；两张切点帧往往比空转一次出片更能发现「剪错段了」。
- **原片只读。** 所有破坏性操作都发生在 `mcpcut-data/projects/...`。源 MP4 应始终不变。
- **智能结果要人（或 Agent）确认。** 场景切点在 MV 上会很碎（0.3 阈值下几十刀都正常）；Whisper 在纯配乐上可能只听出片头「字幕by某某」。用切点当建议，再用 `edit_timeline` 下手。
- **口播先 cut_highlights，再 preview。** `strategy=hybrid`：说话够多就切气口；MV/B-roll 会退回场景镜头。想先看刀再下手：`apply=false`。切错了 `restore_version`。
- **改了 MCP 工具或参数就要 Reload。** 只剪同一工程、不升级服务时，不必反复重启。
- **画幅用 `render` 的 `aspect` / `fit`，不必改建工程。** 同一时间线可出竖屏 contain 和横屏 cover。
- **字幕叠了就删。** `add_overlay` 传 `removeItemId`，不要再叠一条。
- **BGM 不要整段 60 秒源。** 现在省略 in/out 会按时间线长度铺；仍建议看 `describe` 里的 `a_*`。
- **回滚用 revision 号，** 不是改磁盘上的 mp4。`restore_version` 会再写一个新 revision，历史还在。

常用工具顺序：

```
get_status → inspect_media → create_project → import_clip
    → edit_timeline → describe_project → preview_project
    → add_overlay / mix_audio
    → render → get_job
```

---

## 刻意不做

- 不把 FFmpeg 滤镜字符串暴露给 Agent
- 不把云端素材 URL 当输入（当前只接受本地文件）
- 不做 Premiere 级调色、关键帧曲线、多机位
- Whisper / 场景检测不自动改时间线

---

## 文档

| 文档 | 内容 |
| --- | --- |
| [docs/PLAN.md](docs/PLAN.md) | 已完成分期、以后可以做的切口 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 工程目录、异步边界 |
| [docs/SCHEMA.md](docs/SCHEMA.md) | `project.json` 字段 |
| [docs/TOOLS.md](docs/TOOLS.md) | 每个 MCP 工具的参数 |
| [docs/TESTING.md](docs/TESTING.md) | 联调记录 |

开发自测：`npm test`、`npm run typecheck`。
