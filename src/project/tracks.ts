import { existsSync } from "node:fs";
import type { AudioItem, Project, TextItem } from "../types/project.js";
import type { AudioOp, OverlayOp } from "./schema.js";
import { clipDuration, findClip, timelineDuration, validateRange } from "./timeline.js";
import { shortId } from "../util/ids.js";

export function applyOverlayOps(project: Project, operations: OverlayOp[]): Project {
  let text = [...project.tracks.text];

  for (const op of operations) {
    if (op.op === "add_text") {
      if (!(op.end > op.start)) throw new Error("text end must be greater than start");
      text.push({
        id: shortId("t"),
        start: op.start,
        end: op.end,
        text: op.text,
        style: op.style ?? "caption",
        position: op.position
      });
    } else if (op.op === "update_text") {
      const idx = text.findIndex((item) => item.id === op.itemId);
      if (idx < 0) throw new Error(`Unknown text item: ${op.itemId}`);
      const next: TextItem = { ...text[idx] };
      if (op.text != null) next.text = op.text;
      if (op.start != null) next.start = op.start;
      if (op.end != null) next.end = op.end;
      if (op.style != null) next.style = op.style;
      if (!(next.end > next.start)) throw new Error("text end must be greater than start");
      text[idx] = next;
    } else if (op.op === "remove_overlay") {
      const next = text.filter((item) => item.id !== op.itemId);
      if (next.length === text.length) throw new Error(`Unknown text item: ${op.itemId}`);
      text = next;
    }
  }

  return { ...project, tracks: { ...project.tracks, text } };
}

export function applyAudioOps(project: Project, operations: AudioOp[]): Project {
  let audio = [...project.tracks.audio];
  const videoDur = timelineDuration(project);

  for (const op of operations) {
    if (op.op === "add_audio") {
      const clip = findClip(project, op.clipId);
      if (clip.hasAudio === false) {
        throw new Error(`Clip ${clip.id} has no audio`);
      }
      const inPoint = op.in ?? 0;
      const outPoint = op.out ?? clip.durationSec;
      if (outPoint == null) {
        throw new Error(`Clip ${clip.id} has unknown duration; pass explicit in/out`);
      }
      validateRange(clip, inPoint, outPoint);
      const start = op.start ?? 0;
      if (start < 0) throw new Error("audio start must be >= 0");
      audio.push({
        id: shortId("a"),
        clipId: clip.id,
        in: inPoint,
        out: outPoint,
        start,
        volume: op.volume ?? 0.25,
        fadeIn: op.fadeIn,
        fadeOut: op.fadeOut
      });
    } else if (op.op === "set_volume") {
      const idx = audio.findIndex((item) => item.id === op.itemId);
      if (idx < 0) throw new Error(`Unknown audio item: ${op.itemId}`);
      audio[idx] = {
        ...audio[idx],
        volume: op.volume,
        fadeIn: op.fadeIn ?? audio[idx].fadeIn,
        fadeOut: op.fadeOut ?? audio[idx].fadeOut
      };
    } else if (op.op === "remove_audio") {
      const next = audio.filter((item) => item.id !== op.itemId);
      if (next.length === audio.length) throw new Error(`Unknown audio item: ${op.itemId}`);
      audio = next;
    }
  }

  if (videoDur <= 0 && audio.length > 0) {
    throw new Error("Add video clips before mix_audio");
  }

  return { ...project, tracks: { ...project.tracks, audio } };
}

export function audioDuration(item: Pick<AudioItem, "in" | "out">): number {
  return clipDuration(item);
}
