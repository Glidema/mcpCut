import { ffmpegPath } from "../config.js";
import { CommandError, runCommand } from "./process.js";

export interface SilenceSpan {
  start: number;
  end: number;
}

export interface Span {
  start: number;
  end: number;
}

export function parseSilenceSpans(log: string): SilenceSpan[] {
  const starts: number[] = [];
  const ends: number[] = [];
  const startRe = /silence_start:\s*([0-9]+(?:\.[0-9]+)?)/g;
  const endRe = /silence_end:\s*([0-9]+(?:\.[0-9]+)?)/g;
  let match: RegExpExecArray | null;
  while ((match = startRe.exec(log))) starts.push(Number(match[1]));
  while ((match = endRe.exec(log))) ends.push(Number(match[1]));
  const n = Math.min(starts.length, ends.length);
  const spans: SilenceSpan[] = [];
  for (let i = 0; i < n; i++) {
    if (ends[i] > starts[i]) spans.push({ start: starts[i], end: ends[i] });
  }
  return spans;
}

export function invertToSpeech(
  silences: SilenceSpan[],
  durationSec: number,
  window: { start?: number; end?: number } = {}
): Span[] {
  const from = window.start ?? 0;
  const to = window.end ?? durationSec;
  const speech: Span[] = [];
  let cursor = from;
  for (const sil of silences) {
    const silStart = Math.max(from, sil.start);
    const silEnd = Math.min(to, sil.end);
    if (silEnd <= from || silStart >= to) continue;
    if (silStart > cursor + 0.05) speech.push({ start: cursor, end: silStart });
    cursor = Math.max(cursor, silEnd);
  }
  if (to > cursor + 0.05) speech.push({ start: cursor, end: to });
  return speech;
}

export function mergeSpans(spans: Span[], opts: { maxGap?: number; pad?: number; minSec?: number } = {}): Span[] {
  const maxGap = opts.maxGap ?? 0.45;
  const pad = opts.pad ?? 0.12;
  const minSec = opts.minSec ?? 1.2;
  if (spans.length === 0) return [];
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const merged: Span[] = [{ ...sorted[0] }];
  for (const span of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    if (span.start - last.end <= maxGap) {
      last.end = Math.max(last.end, span.end);
    } else {
      merged.push({ ...span });
    }
  }
  return merged
    .map((span) => ({
      start: Math.max(0, span.start - pad),
      end: span.end + pad
    }))
    .filter((span) => span.end - span.start >= minSec);
}

export function mergeShortSegments(spans: Span[], minSec: number): Span[] {
  if (spans.length === 0) return [];
  const out: Span[] = [{ ...spans[0] }];
  for (const span of spans.slice(1)) {
    const last = out[out.length - 1];
    const lastDur = last.end - last.start;
    const dur = span.end - span.start;
    if (lastDur < minSec || dur < minSec) {
      last.end = span.end;
    } else {
      out.push({ ...span });
    }
  }
  if (out.length >= 2) {
    const last = out[out.length - 1];
    if (last.end - last.start < minSec) {
      out[out.length - 2].end = last.end;
      out.pop();
    }
  }
  return out.filter((span) => span.end - span.start >= minSec * 0.85);
}

export function capClipCount(spans: Span[], maxClips: number): Span[] {
  if (spans.length <= maxClips) return spans;
  const next = spans.map((span) => ({ ...span }));
  while (next.length > maxClips) {
    let best = 0;
    let bestDur = Infinity;
    for (let i = 0; i < next.length - 1; i++) {
      const combined = next[i + 1].end - next[i].start;
      if (combined < bestDur) {
        bestDur = combined;
        best = i;
      }
    }
    next[best] = { start: next[best].start, end: next[best + 1].end };
    next.splice(best + 1, 1);
  }
  return next;
}

export function speechRatio(spans: Span[], durationSec: number): number {
  if (durationSec <= 0) return 0;
  const speech = spans.reduce((sum, span) => sum + Math.max(0, span.end - span.start), 0);
  return speech / durationSec;
}

export async function detectSilence(
  filePath: string,
  opts: { noiseDb?: number; minSilence?: number } = {}
): Promise<SilenceSpan[]> {
  const noiseDb = opts.noiseDb ?? -28;
  const minSilence = opts.minSilence ?? 0.35;
  const args = [
    "-hide_banner",
    "-vn",
    "-i",
    filePath,
    "-af",
    `silencedetect=noise=${noiseDb}dB:d=${minSilence}`,
    "-f",
    "null",
    "-"
  ];
  try {
    const result = await runCommand(ffmpegPath(), args, { timeoutMs: 180_000 });
    return parseSilenceSpans(`${result.stderr}\n${result.stdout}`);
  } catch (err) {
    if (err instanceof CommandError && err.details && /silence_start:/.test(err.details)) {
      return parseSilenceSpans(err.details);
    }
    throw err;
  }
}
