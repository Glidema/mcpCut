import type { Project, VideoItem } from "../types/project.js";
import { mediaAbsPath } from "../project/store.js";
import { findClip, isPip } from "../project/timeline.js";
import type { TimelineOp } from "../project/schema.js";
import { detectScenes, evenPick, segmentsFromCuts } from "./scenes.js";
import {
  capClipCount,
  detectSilence,
  invertToSpeech,
  mergeSpans,
  speechRatio,
  type Span
} from "./silence.js";

export type HighlightStrategy = "hybrid" | "speech" | "scenes";
export type HighlightScope = "clip" | "selection";

export interface HighlightOptions {
  strategy?: HighlightStrategy;
  scope?: HighlightScope;
  minSec?: number;
  maxClips?: number;
  padSec?: number;
  sceneThreshold?: number;
  speechRatioMin?: number;
}

export interface HighlightClip {
  clipId: string;
  in: number;
  out: number;
  reason: "speech" | "scene";
}

export function shouldUseSpeechIslands(
  ratio: number,
  islandCount: number,
  speechRatioMin = 0.12
): boolean {
  if (ratio < speechRatioMin) return false;
  // Continuous soundtrack has ~no silence, so invert-to-speech looks like one 99% island.
  if (islandCount <= 1) return false;
  if (ratio > 0.88) return false;
  return true;
}

export interface HighlightPlan {
  strategyUsed: "speech" | "scenes";
  speechRatio: number;
  windowSec: number;
  keepSec: number;
  note: string;
  clips: HighlightClip[];
}

export async function planHighlights(project: Project, opts: HighlightOptions = {}): Promise<HighlightPlan> {
  const strategy = opts.strategy ?? "hybrid";
  const scope = opts.scope ?? "clip";
  const minSec = opts.minSec ?? 1.2;
  const maxClips = opts.maxClips ?? 12;
  const padSec = opts.padSec ?? 0.12;
  const speechRatioMin = opts.speechRatioMin ?? 0.12;
  const mains = project.tracks.video.filter((item) => !isPip(item));
  if (mains.length === 0) {
    throw new Error("cut_highlights needs at least one full-frame clip on the timeline");
  }

  const windows = highlightWindows(project, mains, scope);
  const clips: HighlightClip[] = [];
  let speechDur = 0;
  let windowSec = 0;
  let used: "speech" | "scenes" = "scenes";

  for (const win of windows) {
    const clip = findClip(project, win.clipId);
    const file = mediaAbsPath(project, clip.relPath);
    const durationSec = clip.durationSec ?? win.end;
    windowSec += win.end - win.start;

    let silences: Awaited<ReturnType<typeof detectSilence>> = [];
    if (clip.hasAudio !== false) {
      silences = await detectSilence(file);
    }
    const rawSpeech = invertToSpeech(silences, durationSec, { start: win.start, end: win.end });
    const speech = mergeSpans(rawSpeech, { pad: padSec, minSec, maxGap: 0.45 });
    speechDur += speech.reduce((sum, span) => sum + (span.end - span.start), 0);
    const ratio = speechRatio(speech, win.end - win.start);

    let picked: Span[] = [];
    let reason: "speech" | "scene" = "scene";
    if (
      strategy === "speech" ||
      (strategy === "hybrid" && shouldUseSpeechIslands(ratio, speech.length, speechRatioMin))
    ) {
      picked = capClipCount(speech, maxClips);
      reason = "speech";
      used = "speech";
    } else {
      const scenes = await detectScenes(file, {
        threshold: opts.sceneThreshold,
        start: win.start,
        end: win.end,
        durationSec: win.end
      });
      const relative = scenes.cuts.map((t) => t - win.start);
      const segs = segmentsFromCuts(relative, win.end - win.start).map((span) => ({
        start: win.start + span.start,
        end: win.start + span.end
      }));
      // Drop flashes; do not merge them back into a full-length mosaic.
      picked = evenPick(
        segs.filter((span) => span.end - span.start >= minSec * 0.85),
        maxClips
      );
      reason = "scene";
    }
    for (const span of picked) {
      const inPoint = clamp(span.start, win.start, win.end);
      const outPoint = clamp(span.end, win.start, win.end);
      if (outPoint - inPoint >= minSec * 0.85) {
        clips.push({ clipId: win.clipId, in: inPoint, out: outPoint, reason });
      }
    }
  }

  const kept = capHighlightClips(clips, maxClips);
  const keepSec = kept.reduce((sum, item) => sum + (item.out - item.in), 0);
  if (
    strategy === "hybrid" &&
    used === "speech" &&
    (kept.length === 0 || (kept.length <= 1 && keepSec / Math.max(windowSec, 0.01) >= 0.7))
  ) {
    return planHighlights(project, { ...opts, strategy: "scenes" });
  }
  if (kept.length === 0) {
    throw new Error(
      "No highlight clips found. For talking-head try strategy=speech; for MV try scenes with a lower minSec."
    );
  }

  const note =
    used === "speech"
      ? `Talking-head style: kept speech islands (${(speechDur / Math.max(windowSec, 0.01) * 100).toFixed(0)}% of window).`
      : `Little speech (${(speechDur / Math.max(windowSec, 0.01) * 100).toFixed(0)}% of window); kept merged scene shots.`;

  return {
    strategyUsed: used,
    speechRatio: windowSec > 0 ? speechDur / windowSec : 0,
    windowSec,
    keepSec,
    note,
    clips: kept
  };
}

function capHighlightClips(clips: HighlightClip[], maxClips: number): HighlightClip[] {
  const next = clips.map((c) => ({ ...c }));
  while (next.length > maxClips) {
    let best = -1;
    let bestDur = Infinity;
    for (let i = 0; i < next.length - 1; i++) {
      if (next[i].clipId !== next[i + 1].clipId) continue;
      const combined = next[i + 1].out - next[i].in;
      if (combined < bestDur) {
        bestDur = combined;
        best = i;
      }
    }
    if (best < 0) {
      let shortest = 0;
      let dur = Infinity;
      next.forEach((clip, i) => {
        const d = clip.out - clip.in;
        if (d < dur) {
          dur = d;
          shortest = i;
        }
      });
      next.splice(shortest, 1);
    } else {
      next[best] = { ...next[best], out: next[best + 1].out };
      next.splice(best + 1, 1);
    }
  }
  return next;
}

/** Flatten a highlight plan into remove+add ops. PIP items are kept. */
export function highlightPlanToOps(project: Project, plan: HighlightPlan): TimelineOp[] {
  const mains = project.tracks.video.filter((item) => !isPip(item));
  const ops: TimelineOp[] = mains.map((item) => ({ op: "remove_item", itemId: item.id }));
  for (const clip of plan.clips) {
    ops.push({ op: "add_video", clipId: clip.clipId, in: clip.in, out: clip.out });
  }
  return ops;
}

function highlightWindows(
  project: Project,
  mains: VideoItem[],
  scope: HighlightScope
): Array<{ clipId: string; start: number; end: number }> {
  if (scope === "selection") {
    return mains.map((item) => ({ clipId: item.clipId, start: item.in, end: item.out }));
  }
  const seen = new Set<string>();
  const windows: Array<{ clipId: string; start: number; end: number }> = [];
  for (const item of mains) {
    if (seen.has(item.clipId)) continue;
    seen.add(item.clipId);
    const clip = findClip(project, item.clipId);
    const end = clip.durationSec;
    if (end == null) throw new Error(`Clip ${clip.id} has unknown duration`);
    windows.push({ clipId: item.clipId, start: 0, end });
  }
  return windows;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
