import { writeFile } from "node:fs/promises";
import path from "node:path";
import { ffmpegPath } from "../config.js";
import type { Project } from "../types/project.js";
import { mediaAbsPath, projectDir } from "../project/store.js";
import { clipDuration, isPip } from "../project/timeline.js";
import { ensureDir } from "../util/fs.js";
import { runCommand } from "./process.js";
import { detectScenes, evenPick } from "./scenes.js";

export interface PreviewFrame {
  itemId: string;
  clipId: string;
  atSourceSec: number;
  timelineSec?: number;
  file: string;
}

export interface PreviewOptions {
  maxFrames?: number;
  at?: "mid" | "scenes";
  sceneThreshold?: number;
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
  opts: PreviewOptions | number = {}
): Promise<PreviewFrame[]> {
  const options: PreviewOptions = typeof opts === "number" ? { maxFrames: opts } : opts;
  if (project.tracks.video.length === 0) {
    throw new Error("Video track is empty; add clips before preview_project");
  }

  const cap = Math.min(12, Math.max(1, options.maxFrames ?? 6));
  const dir = path.join(projectDir(project.id), "previews", `rev-${String(project.revision).padStart(4, "0")}`);
  await ensureDir(dir);

  const picks =
    options.at === "scenes"
      ? await scenePicks(project, cap, options.sceneThreshold ?? 0.3)
      : midpointPicks(project, cap);

  const frames: PreviewFrame[] = [];
  for (const [index, pick] of picks.entries()) {
    const clip = project.media.find((m) => m.id === pick.clipId);
    if (!clip) throw new Error(`Missing clip ${pick.clipId} for item ${pick.itemId}`);
    const file = path.join(dir, `${String(index).padStart(2, "0")}_${pick.itemId}.jpg`);
    await extractFrame(mediaAbsPath(project, clip.relPath), pick.atSourceSec, file);
    frames.push({ ...pick, file });
  }

  if (options.at === "scenes") {
    const sidecarDir = path.join(projectDir(project.id), "scenes");
    await ensureDir(sidecarDir);
    const sidecar = path.join(sidecarDir, `rev-${String(project.revision).padStart(4, "0")}.json`);
    await writeFile(
      sidecar,
      JSON.stringify(
        {
          threshold: options.sceneThreshold ?? 0.3,
          frames: frames.map((frame) => ({
            itemId: frame.itemId,
            clipId: frame.clipId,
            atSourceSec: frame.atSourceSec,
            timelineSec: frame.timelineSec
          }))
        },
        null,
        2
      ),
      "utf8"
    );
  }

  return frames;
}

function midpointPicks(project: Project, cap: number): PreviewFrame[] {
  return project.tracks.video.slice(0, cap).map((item) => ({
    itemId: item.id,
    clipId: item.clipId,
    atSourceSec: item.in + clipDuration(item) / 2,
    timelineSec: item.start + clipDuration(item) / 2,
    file: ""
  }));
}

async function scenePicks(project: Project, cap: number, threshold: number): Promise<PreviewFrame[]> {
  const mains = project.tracks.video.filter((item) => !isPip(item));
  const candidates: PreviewFrame[] = [];
  for (const item of mains) {
    const clip = project.media.find((m) => m.id === item.clipId);
    if (!clip) throw new Error(`Missing clip ${item.clipId} for item ${item.id}`);
    const report = await detectScenes(mediaAbsPath(project, clip.relPath), {
      threshold,
      start: item.in,
      end: item.out,
      durationSec: item.out
    });
    const times = report.cuts.length > 0 ? report.cuts : [item.in + clipDuration(item) / 2];
    for (const t of times) {
      candidates.push({
        itemId: item.id,
        clipId: item.clipId,
        atSourceSec: t,
        timelineSec: item.start + (t - item.in),
        file: ""
      });
    }
  }
  return evenPick(candidates, cap);
}
