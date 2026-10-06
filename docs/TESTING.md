# 一起测试

服务名 **mcpcut3**。改代码后若 `get_status` 版本不对：Reload MCP + **新开 Agent 对话**。

## Phase 4（当前）

`get_status` 须为 **0.4.0 / phase 4**。工程 `mcbb-agent-e109c692df40`（现为 12s：20–26s + 45–51s）。

```
用 mcpcut3。工程 mcbb-agent-e109c692df40。不要改 vivi/mcbb.MP4。

1. get_status（0.4.0 / phase 4）
2. describe_project
3. add_overlay removeItemId 把 3 条旧字幕都删掉（describe 里的 t_*）
4. add_overlay 文案「ABAB」style=caption position=top-right start=0 end=12
5. edit_timeline add_video：同一 clip，in=0 out=3，layout=pip，start=2
6. render aspect=16:9 fit=cover
7. 轮询 get_job，给出成片路径（文件名应带 16x9-cover）
```

期望：横版 16:9、画面被裁切填满、右上角水印、约 2s 起右下角有开场画中画。和 `rev-0010.mp4` 竖屏 12s 会明显不同。
