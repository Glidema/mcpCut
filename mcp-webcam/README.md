# mcp-webcam（摄像头录制 MCP）

仓库：[Glidema/mcpCut](https://github.com/Glidema/mcpCut) 下的 [`mcp-webcam`](https://github.com/Glidema/mcpCut/tree/main/mcp-webcam) 目录。

给 **AI Agent** 和 **你自己** 用的本地摄像头录制工具。打开摄像头页面、允许权限后：

- **手动**：在页面上点「开始录制 / 停止录制」
- **Agent**：在 Cursor 里用自然语言说「录一段」「停」「拿去剪辑」

录制文件落到本机文件夹，可再交给同仓库的剪辑 MCP（[mcpCut](https://github.com/Glidema/mcpCut)）。

```
开摄像头页 → 手动录制 或 指挥 Agent → 录制落盘 → mcpcut 导入并剪辑出片
```

例如：*「帮我录下今天猫咪捣蛋的画面，剪一个搞笑短视频。」*

本说明面向最终用户。

---

## 它能做什么

| 能力 | 说明 |
| --- | --- |
| 摄像头预览 | 浏览器页实时预览，可选设备（含免驱 USB 摄像头） |
| 手动录视频 | 页面按钮开始 / 停止 / 重置 |
| Agent 录视频 | `start_recording` / `stop_recording` |
| 存本地 | 文件写到 `recordings/`（可配置路径） |
| 拍静帧 | `capture`：从摄像头取一张图 |
| 截屏 | `screenshot`：截当前屏幕/窗口（系统会弹权限） |
| 查状态 / 列表 | `recording_status`、`list_recordings`、`get_last_recording` |

录制时默认带麦克风。浏览器通常先出 **webm**；若本机有 `ffmpeg`（或配置了 `FFMPEG_PATH`），服务端会尽量转成 **mp4** 再返回路径。

---

## 两种用法（都支持）

### A. 手动录制

1. 确认 Cursor 里 **mcp-webcam** 为绿色（由 Cursor 拉起服务，占用 `http://localhost:3333`）
2. 浏览器打开 [http://localhost:3333](http://localhost:3333)，选好摄像头并允许权限
3. 点 **开始录制** → 录完点 **停止录制**
4. 页面会显示「最近文件」路径；也可用 Agent 的 `get_last_recording` / `list_recordings` 查看
5. 若状态卡住，点 **重置**

### B. Agent 录制 → 再剪辑

1. 同样先打开摄像头页并允许权限（「MCP 会话」应显示类似 `cursor-vscode`）
2. 在 Cursor Agent 里说：开始录 / 停 / 拿去剪辑
3. Agent 依次调用：
   - `mcp-webcam` → `start_recording` → `stop_recording`
   - `mcpcut` → `import_clip` → 剪辑 → `render`

成片一般在 `mcpcut-data/projects/<工程 id>/renders/`；原始录像在 `mcp-webcam/recordings/`。

---

## 小白上手（Cursor）

### 1. 环境

- [Node.js 20+](https://nodejs.org/)
- 摄像头（笔记本内置或免驱 USB 均可）
- 可选：本机 `ffmpeg`（有则更易得到 mp4）

```bash
git clone https://github.com/Glidema/mcpCut.git
cd mcpCut/mcp-webcam
npm install
npm run build
```

**不要**再单独开一个 `npm run start:streaming` 占着 3333——Cursor 拉起 MCP 时会自己起服务。端口被占时，MCP 会显示 Error。

### 2. 接到 Cursor

路径改成你的绝对路径（也可参考仓库根目录 [`.cursor/mcp.json.example`](https://github.com/Glidema/mcpCut/blob/main/.cursor/mcp.json.example)）：

```json
{
  "mcpServers": {
    "mcp-webcam": {
      "command": "node",
      "args": ["/你的路径/mcpCut/mcp-webcam/dist/server.js"],
      "cwd": "/你的路径/mcpCut/mcp-webcam",
      "env": {
        "PORT": "3333",
        "MCP_WEBCAM_RECORDINGS": "/你的路径/mcpCut/mcp-webcam/recordings"
      }
    }
  }
}
```

若同时用剪辑，再配上 mcpCut（联调名常为 `mcpcut3`）。**不要**再启用其它也占 3333 的 webcam MCP。

Settings → MCP 确认 **mcp-webcam 为绿色** → 需要时 Reload → **新开一个 Agent 对话**。

### 3. 打开摄像头页

```
http://localhost:3333
```

### 4. 对 Agent 可以这样说

```
用 mcp-webcam。我已经打开了 http://localhost:3333 并允许了摄像头。

1. start_recording，大约录 20 秒
2. 停下来后 stop_recording，告诉我文件路径
3. 用 mcpcut3 import_clip 导入这段，竖屏剪一版并 render
```

也可以更短：*「录一下，停了拿去剪成竖屏短视频。」*  
或你自己在页面上录完后说：*「把最近一次录像导入 mcpcut 剪一下。」*

---

## Agent 可用工具

| 工具 | 作用 |
| --- | --- |
| `start_recording` | 开始录制（默认最长约 60 秒，可带麦） |
| `stop_recording` | 停止并保存，返回本地 `path` |
| `recording_status` | 当前是空闲 / 录制中 / 保存中 |
| `list_recordings` | 最近保存的录像列表 |
| `get_last_recording` | 最近一条的路径 |
| `capture` | 拍一张摄像头静帧 |
| `screenshot` | 截屏 / 窗口 |

---

## 页面说明

| 区域 | 含义 |
| --- | --- |
| 摄像头 | 选择设备；免驱摄像头插上后刷新页面即可出现 |
| MCP 会话 | Agent 是否连上；正常时应看到 Cursor 客户端 |
| 开始录制 / 停止录制 | **手动录制**（与 Agent 共用同一套落盘逻辑） |
| 重置 | 状态卡住时清状态 |
| 冻结 | 定格当前画面 |
| 采样 | 向支持 sampling 的客户端提问画面（可选） |

---

## 使用技巧

- **手动和 Agent 二选一即可，也可混用**（例如你手动录，再让 Agent 去剪）。
- **先开页再录。** 没开浏览器或没授权时，录制会失败。
- **只保留一份 webcam MCP。** 多份抢 3333 会 Error。
- **录完再剪。** 用页面上的路径，或 `get_last_recording` / `stop_recording` 返回的绝对路径做 `import_clip`。
- **页签保持打开。** 录制过程中不要关掉摄像头页。
- **卡住就「重置」。**
- **文件目录。** 默认 `mcp-webcam/recordings/`，可用 `MCP_WEBCAM_RECORDINGS` 修改。

---

## 常见问题

**Q：MCP 显示 Error？**  
A：3333 被占用。关掉手动起的服务和其它 webcam MCP，再 Reload。

**Q：以前点按钮没反应？**  
A：旧版手动开始会「自己等自己的 SSE」而卡住。当前版本改为本页直接起停 MediaRecorder，手动应可正常使用；请 Reload MCP 并硬刷新页面。

**Q：Agent 说没有浏览器？**  
A：打开 `http://localhost:3333`，允许摄像头后再试。

**Q：没有声音？**  
A：浏览器是否允许麦克风。

**Q：和 mcpCut 的关系？**  
A：两个独立 MCP，同属 [Glidema/mcpCut](https://github.com/Glidema/mcpCut) 仓库：一个录、一个剪。

---

## 环境变量（可选）

| 变量 | 含义 | 默认 |
| --- | --- | --- |
| `PORT` | 网页端口 | `3333` |
| `BIND_HOST` | 监听地址 | `localhost` |
| `MCP_WEBCAM_RECORDINGS` | 录像保存目录 | `./recordings` |
| `FFMPEG_PATH` | ffmpeg 路径 | 系统 PATH |

---

## 许可

MIT。问题反馈：[Glidema/mcpCut Issues](https://github.com/Glidema/mcpCut/issues)。
