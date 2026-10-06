import type { MediaAsset, Project, VideoItem } from "../types/project.js";
import type { TimelineOp } from "./schema.js";
import { shortId } from "../util/ids.js";

export function clipDuration(item: Pick<VideoItem, "in" | "out">): number {
  return Math.max(0, item.out - item.in);
}

export function isPip(item: Pick<VideoItem, "layout">): boolean {
  return item.layout === "pip";
}

export function packVideo(items: VideoItem[]): VideoItem[] {
  let t = 0;
  return items.map((item) => {
    if (isPip(item)) return item;
    const next = { ...item, start: t };
    t += clipDuration(item);
    return next;
  });
}

export function timelineDuration(project: Project): number {
  const main = project.tracks.video.filter((item) => !isPip(item));
  const last = main.at(-1);
  if (!last) return 0;
  return last.start + clipDuration(last);
}

export function findClip(project: Project, clipId: string): MediaAsset {
  const clip = project.media.find((m) => m.id === clipId);
  if (!clip) throw new Error(`Unknown clipId: ${clipId}`);
  return clip;
}

export function validateRange(clip: MediaAsset, inPoint: number, outPoint: number): void {
  if (!(outPoint > inPoint)) {
    throw new Error(`out must be greater than in (in=${inPoint}, out=${outPoint})`);
  }
  if (inPoint < 0) {
    throw new Error(`in must be >= 0 (in=${inPoint})`);
  }
  if (clip.durationSec != null && outPoint > clip.durationSec + 0.05) {
    throw new Error(
      `out ${outPoint}s exceeds clip duration ${clip.durationSec}s (${clip.id})`
    );
  }
}

export function applyOperations(project: Project, operations: TimelineOp[]): Project {
  let video = [...project.tracks.video];

  for (const op of operations) {
    if (op.op === "add_video") {
      const clip = findClip(project, op.clipId);
      if (clip.kind !== "video") {
        throw new Error(`add_video requires a video clip, got ${clip.kind}`);
      }
      const inPoint = op.in ?? 0;
      const outPoint = op.out ?? clip.durationSec;
      if (outPoint == null) {
        throw new Error(`Clip ${clip.id} has unknown duration; pass explicit in/out`);
      }
      validateRange(clip, inPoint, outPoint);
      video.push({
        id: shortId("v"),
        clipId: clip.id,
        in: inPoint,
        out: outPoint,
        start: op.layout === "pip" ? (op.start ?? 0) : 0,
        layout: op.layout ?? "full"
      });
    } else if (op.op === "trim_video") {
      const idx = video.findIndex((item) => item.id === op.itemId);
      if (idx < 0) throw new Error(`Unknown video item: ${op.itemId}`);
      const clip = findClip(project, video[idx].clipId);
      validateRange(clip, op.in, op.out);
      video[idx] = { ...video[idx], in: op.in, out: op.out };
    } else if (op.op === "remove_item") {
      const next = video.filter((item) => item.id !== op.itemId);
      if (next.length === video.length) {
        throw new Error(`Unknown item: ${op.itemId}`);
      }
      video = next;
    } else if (op.op === "reorder_video") {
      if (op.itemIds.length !== video.length) {
        throw new Error(
          `reorder_video must list every item (got ${op.itemIds.length}, have ${video.length})`
        );
      }
      const map = new Map(video.map((item) => [item.id, item]));
      const seen = new Set<string>();
      const next: VideoItem[] = [];
      for (const id of op.itemIds) {
        if (seen.has(id)) throw new Error(`Duplicate item id in reorder: ${id}`);
        const item = map.get(id);
        if (!item) throw new Error(`reorder_video unknown id: ${id}`);
        seen.add(id);
        next.push(item);
      }
      video = next;
    } else if (op.op === "cut_highlights") {
      throw new Error("cut_highlights must be expanded before applyOperations");
    }
  }

  return {
    ...project,
    tracks: { ...project.tracks, video: packVideo(video) }
  };
}
