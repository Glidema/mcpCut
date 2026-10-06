import { ffmpegPath } from "../config.js";
import { CommandError, runCommand } from "./process.js";

export interface SceneReport {
  threshold: number;
  durationSec?: number;
  cuts: number[];
  segments: Array<{ start: number; end: number }>;
  truncated: boolean;
}

export function parseSceneCuts(log: string): number[] {
  const times: number[] = [];
  const re = /pts_time:\s*([0-9]+(?:\.[0-9]+)?)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(log))) {
    const t = Number(match[1]);
    if (Number.isFinite(t) && t >= 0) times.push(t);
  }
  return times;
}

export function mergeSceneCuts(
  times: number[],
  opts: { minGap?: number; start?: number; end?: number; maxCuts?: number } = {}
): { cuts: number[]; truncated: boolean } {
  const minGap = opts.minGap ?? 0.35;
  const start = opts.start ?? 0;
  const end = opts.end;
  const maxCuts = opts.maxCuts ?? 60;
  const sorted = [...new Set(times.map((t) => Math.round(t * 1000) / 1000))].sort((a, b) => a - b);
  const cuts: number[] = [];
  for (const t of sorted) {
    if (t < start + 0.08) continue;
    if (end != null && t > end - 0.08) continue;
    const prev = cuts.at(-1);
    if (prev != null && t - prev < minGap) continue;
    cuts.push(t);
  }
  if (cuts.length > maxCuts) {
    return { cuts: evenPick(cuts, maxCuts), truncated: true };
  }
  return { cuts, truncated: false };
}

export function segmentsFromCuts(cuts: number[], durationSec: number): Array<{ start: number; end: number }> {
  const dur = Math.max(0, durationSec);
  const bounds = [0, ...cuts.filter((t) => t > 0 && t < dur), dur];
  const unique = [...new Set(bounds.map((t) => Math.round(t * 1000) / 1000))].sort((a, b) => a - b);
  const segments: Array<{ start: number; end: number }> = [];
  for (let i = 0; i < unique.length - 1; i++) {
    if (unique[i + 1] - unique[i] < 0.05) continue;
    segments.push({ start: unique[i], end: unique[i + 1] });
  }
  return segments;
}

export function evenPick<T>(items: T[], n: number): T[] {
  if (n <= 0) return [];
  if (items.length <= n) return [...items];
  if (n === 1) return [items[0]];
  const out: T[] = [];
  for (let i = 0; i < n; i++) {
    out.push(items[Math.round((i * (items.length - 1)) / (n - 1))]);
  }
  return out;
}

export function formatSceneReport(report: SceneReport): string {
  if (report.cuts.length === 0) {
    return `scenes=0 (threshold=${report.threshold}; no hard cuts)`;
  }
  const shown = report.cuts.slice(0, 24).map((t) => t.toFixed(2)).join(", ");
  const extra = report.cuts.length > 24 ? ` … +${report.cuts.length - 24}` : "";
  const trunc = report.truncated ? " truncated" : "";
  return `scenes=${report.cuts.length}${trunc} @ ${shown}${extra}s`;
}

export async function detectScenes(
  filePath: string,
  opts: { threshold?: number; start?: number; end?: number; durationSec?: number } = {}
): Promise<SceneReport> {
  const threshold = Math.min(0.9, Math.max(0.1, opts.threshold ?? 0.3));
  const start = opts.start;
  const end = opts.end;
  const filterParts: string[] = [];
  if (start != null && end != null) {
    filterParts.push(`trim=start=${start}:end=${end}`, "setpts=PTS-STARTPTS");
  }
  filterParts.push(`scale=320:-2`);
  filterParts.push(`select='gt(scene,${threshold})'`);
  filterParts.push("showinfo");

  const args = [
    "-hide_banner",
    "-an",
    "-i",
    filePath,
    "-filter:v",
    filterParts.join(","),
    "-vsync",
    "vfr",
    "-f",
    "null",
    "-"
  ];

  let log = "";
  try {
    const result = await runCommand(ffmpegPath(), args, { timeoutMs: 180_000 });
    log = `${result.stderr}\n${result.stdout}`;
  } catch (err) {
    if (err instanceof CommandError && err.details && /pts_time:/.test(err.details)) {
      log = err.details;
    } else {
      throw err;
    }
  }

  const windowStart = start ?? 0;
  const windowEnd = end ?? opts.durationSec;
  const raw = parseSceneCuts(log).map((t) => (start != null ? start + t : t));
  const merged = mergeSceneCuts(raw, {
    start: windowStart,
    end: windowEnd
  });
  const durationSec = opts.durationSec ?? end ?? merged.cuts.at(-1);
  const span = durationSec ?? 0;
  return {
    threshold,
    durationSec,
    cuts: merged.cuts,
    segments: segmentsFromCuts(merged.cuts, span),
    truncated: merged.truncated
  };
}
