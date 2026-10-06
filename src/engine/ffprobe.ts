import { ffprobePath } from "../config.js";
import type { MediaKind } from "../types/project.js";
import { runCommand } from "./process.js";

export interface ProbeResult {
  kind: MediaKind;
  durationSec?: number;
  width?: number;
  height?: number;
  fps?: number;
  hasAudio: boolean;
  format?: string;
}

interface FfprobeJson {
  format?: { duration?: string; format_name?: string };
  streams?: Array<{
    codec_type?: string;
    width?: number;
    height?: number;
    avg_frame_rate?: string;
    r_frame_rate?: string;
    duration?: string;
  }>;
}

function parseFps(rate?: string): number | undefined {
  if (!rate || rate === "0/0") return undefined;
  const [n, d] = rate.split("/").map(Number);
  if (!d) return Number.isFinite(n) ? n : undefined;
  const fps = n / d;
  return Number.isFinite(fps) && fps > 0 ? fps : undefined;
}

export async function probeMedia(filePath: string): Promise<ProbeResult> {
  const { stdout } = await runCommand(
    ffprobePath(),
    [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      filePath
    ],
    { timeoutMs: 30_000 }
  );

  const data = JSON.parse(stdout) as FfprobeJson;
  const streams = data.streams ?? [];
  const video = streams.find((s) => s.codec_type === "video");
  const audio = streams.find((s) => s.codec_type === "audio");
  const durationRaw = data.format?.duration ?? video?.duration ?? audio?.duration;
  const durationSec = durationRaw != null ? Number(durationRaw) : undefined;

  let kind: MediaKind = "video";
  if (!video && audio) kind = "audio";
  else if (video && (durationSec == null || durationSec === 0) && !audio) {
    kind = "image";
  }

  return {
    kind,
    durationSec: durationSec != null && Number.isFinite(durationSec) ? durationSec : undefined,
    width: video?.width,
    height: video?.height,
    fps: parseFps(video?.avg_frame_rate) ?? parseFps(video?.r_frame_rate),
    hasAudio: Boolean(audio),
    format: data.format?.format_name
  };
}

export function formatProbe(path: string, probe: ProbeResult): string {
  const bits = [
    `path=${path}`,
    `kind=${probe.kind}`,
    probe.durationSec != null ? `duration=${probe.durationSec.toFixed(3)}s` : "duration=unknown",
    probe.width && probe.height ? `${probe.width}x${probe.height}` : null,
    probe.fps != null ? `fps=${probe.fps.toFixed(3)}` : null,
    `audio=${probe.hasAudio}`,
    probe.format ? `format=${probe.format}` : null
  ].filter(Boolean);
  return bits.join(" ");
}
