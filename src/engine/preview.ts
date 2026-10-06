import path from "node:path";
import { ffmpegPath } from "../config.js";
import type { Project } from "../types/project.js";
import { mediaAbsPath, projectDir } from "../project/store.js";
import { clipDuration } from "../project/timeline.js";
import { ensureDir } from "../util/fs.js";
import { runCommand } from "./process.js";

export interface PreviewFrame {
  itemId: string;
  clipId: string;
  atSourceSec: number;
  file: string;
}

export async function extractFrame(input: string, atSec: number, output: string): Promise<void> {
  const seek = Math.max(0, atSec);
  await runCommand(
    ffmpegPath(),
    [
      "-y",
      "-ss",
      seek.toFixed(3),
      "-i",
      input,
      "-frames:v",
      "1",
      "-q:v",
      "3",
      output
    ],
    { timeoutMs: 30_000 }
  );
}

export async function previewProject(
  project: Project,
  maxFrames = 6
): Promise<PreviewFrame[]> {
  if (project.tracks.video.length === 0) {
    throw new Error("Video track is empty; add clips before preview_project");
  }

  const cap = Math.min(12, Math.max(1, maxFrames));
  const items = project.tracks.video.slice(0, cap);
  const dir = path.join(projectDir(project.id), "previews", `rev-${String(project.revision).padStart(4, "0")}`);
  await ensureDir(dir);

  const frames: PreviewFrame[] = [];
  for (const [index, item] of items.entries()) {
    const clip = project.media.find((m) => m.id === item.clipId);
    if (!clip) throw new Error(`Missing clip ${item.clipId} for item ${item.id}`);
    const atSourceSec = item.in + clipDuration(item) / 2;
    const file = path.join(dir, `${String(index).padStart(2, "0")}_${item.id}.jpg`);
    await extractFrame(mediaAbsPath(project, clip.relPath), atSourceSec, file);
    frames.push({ itemId: item.id, clipId: item.clipId, atSourceSec, file });
  }
  return frames;
}
