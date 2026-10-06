import path from "node:path";
import type { AspectPreset, Project, ProjectSpec } from "../types/project.js";
import { ASPECT_PRESETS } from "../types/project.js";
import { mediaAbsPath, projectDir } from "../project/store.js";
import { clipDuration, findClip, isPip } from "../project/timeline.js";
import { audioDuration } from "../project/tracks.js";
import { drawtextFilter, resolveFontFile } from "./text.js";

export type RenderFit = "contain" | "cover";

export interface RenderOptions {
  aspect?: Exclude<AspectPreset, "custom">;
  fit?: RenderFit;
}

export interface RenderPlan {
  inputs: string[];
  filter: string;
  output: string;
  args: string[];
}

function specFor(project: Project, opts: RenderOptions): ProjectSpec {
  if (opts.aspect) {
    const preset = ASPECT_PRESETS[opts.aspect];
    return { ...preset, aspect: opts.aspect };
  }
  return project.spec;
}

function scaleChain(width: number, height: number, fps: number, fit: RenderFit): string {
  if (fit === "cover") {
    return `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=${fps},format=yuv420p`;
  }
  return (
    `scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,fps=${fps},format=yuv420p`
  );
}

function outputName(project: Project, opts: RenderOptions): string {
  const bits = [`rev-${String(project.revision).padStart(4, "0")}`];
  if (opts.aspect) bits.push(opts.aspect.replace(":", "x"));
  if (opts.fit && opts.fit !== "contain") bits.push(opts.fit);
  return `${bits.join("-")}.mp4`;
}

export function buildRenderPlan(project: Project, opts: RenderOptions = {}): RenderPlan {
  const mains = project.tracks.video.filter((item) => !isPip(item));
  const pips = project.tracks.video.filter(isPip);
  if (mains.length === 0) {
    throw new Error("Video track needs at least one full-frame clip before render");
  }

  const spec = specFor(project, opts);
  const { width, height, fps } = spec;
  const fit = opts.fit ?? "contain";
  const inputs: string[] = [];
  const parts: string[] = [];

  mains.forEach((item, i) => {
    const clip = findClip(project, item.clipId);
    inputs.push(mediaAbsPath(project, clip.relPath));
    const dur = clipDuration(item);
    parts.push(
      `[${i}:v]trim=start=${item.in}:end=${item.out},setpts=PTS-STARTPTS,${scaleChain(width, height, fps, fit)}[v${i}]`
    );
    if (clip.hasAudio === false) {
      parts.push(
        `anullsrc=channel_layout=stereo:sample_rate=48000,atrim=0:${dur.toFixed(3)},` +
          `asetpts=PTS-STARTPTS,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[a${i}]`
      );
    } else {
      parts.push(
        `[${i}:a]atrim=start=${item.in}:end=${item.out},asetpts=PTS-STARTPTS,` +
          `aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[a${i}]`
      );
    }
  });

  const concatIn = mains.map((_, i) => `[v${i}][a${i}]`).join("");
  parts.push(`${concatIn}concat=n=${mains.length}:v=1:a=1[outv][outa]`);

  let videoLabel = "outv";
  const pipStartIndex = mains.length;
  pips.forEach((item, i) => {
    const clip = findClip(project, item.clipId);
    inputs.push(mediaAbsPath(project, clip.relPath));
    const inputIndex = pipStartIndex + i;
    const dur = clipDuration(item);
    const pipW = Math.round(width * 0.32);
    parts.push(
      `[${inputIndex}:v]trim=start=${item.in}:end=${item.out},setpts=PTS-STARTPTS,` +
        `scale=${pipW}:-2[p${i}]`
    );
    const dest = `ov${i}`;
    parts.push(
      `[${videoLabel}][p${i}]overlay=W-w-48:H-h-48:enable='between(t,${item.start},${item.start + dur})'[${dest}]`
    );
    videoLabel = dest;
  });

  if (project.tracks.text.length > 0) {
    const font = resolveFontFile();
    project.tracks.text.forEach((item, i) => {
      const src = i === 0 ? videoLabel : `tx${i - 1}`;
      const dest = i === project.tracks.text.length - 1 ? "vout" : `tx${i}`;
      parts.push(`[${src}]${drawtextFilter(item, font)}[${dest}]`);
    });
    videoLabel = "vout";
  }

  const audioStartIndex = mains.length + pips.length;
  project.tracks.audio.forEach((item) => {
    inputs.push(mediaAbsPath(project, findClip(project, item.clipId).relPath));
  });

  let audioLabel = "outa";
  if (project.tracks.audio.length > 0) {
    const mixParts = ["[outa]"];
    project.tracks.audio.forEach((item, i) => {
      const inputIndex = audioStartIndex + i;
      const dur = audioDuration(item);
      const fadeIn = item.fadeIn ?? 0;
      const fadeOut = item.fadeOut ?? 0;
      const delayMs = Math.round(item.start * 1000);
      let chain =
        `[${inputIndex}:a]atrim=start=${item.in}:end=${item.out},asetpts=PTS-STARTPTS,` +
        `volume=${item.volume}`;
      if (fadeIn > 0) chain += `,afade=t=in:st=0:d=${fadeIn}`;
      if (fadeOut > 0) {
        const fadeAt = Math.max(0, dur - fadeOut);
        chain += `,afade=t=out:st=${fadeAt}:d=${fadeOut}`;
      }
      if (delayMs > 0) chain += `,adelay=${delayMs}|${delayMs}`;
      chain += `,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[bgm${i}]`;
      parts.push(chain);
      mixParts.push(`[bgm${i}]`);
    });
    parts.push(
      `${mixParts.join("")}amix=inputs=${mixParts.length}:duration=first:dropout_transition=0:normalize=0[aout]`
    );
    audioLabel = "aout";
  }

  const output = path.join(projectDir(project.id), "renders", outputName(project, opts));
  const args = ["-y"];
  for (const input of inputs) args.push("-i", input);
  args.push(
    "-filter_complex",
    parts.join(";"),
    "-map",
    `[${videoLabel}]`,
    "-map",
    `[${audioLabel}]`,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    output
  );

  return { inputs, filter: parts.join(";"), output, args };
}
