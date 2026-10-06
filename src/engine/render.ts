import path from "node:path";
import type { Project } from "../types/project.js";
import { mediaAbsPath, projectDir } from "../project/store.js";
import { clipDuration, findClip } from "../project/timeline.js";
import { audioDuration } from "../project/tracks.js";
import { drawtextFilter, resolveFontFile } from "./text.js";

export interface RenderPlan {
  inputs: string[];
  filter: string;
  output: string;
  args: string[];
}

export function buildRenderPlan(project: Project): RenderPlan {
  if (project.tracks.video.length === 0) {
    throw new Error("Video track is empty; add clips before render");
  }

  const { width, height, fps } = project.spec;
  const inputs: string[] = [];
  const parts: string[] = [];

  project.tracks.video.forEach((item, i) => {
    const clip = findClip(project, item.clipId);
    inputs.push(mediaAbsPath(project, clip.relPath));
    const dur = clipDuration(item);
    parts.push(
      `[${i}:v]trim=start=${item.in}:end=${item.out},setpts=PTS-STARTPTS,` +
        `scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
        `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,fps=${fps},format=yuv420p[v${i}]`
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

  const concatIn = project.tracks.video.map((_, i) => `[v${i}][a${i}]`).join("");
  parts.push(`${concatIn}concat=n=${project.tracks.video.length}:v=1:a=1[outv][outa]`);

  let videoLabel = "outv";
  if (project.tracks.text.length > 0) {
    const font = resolveFontFile();
    project.tracks.text.forEach((item, i) => {
      const src = i === 0 ? "outv" : `tx${i - 1}`;
      const dest = i === project.tracks.text.length - 1 ? "vout" : `tx${i}`;
      parts.push(`[${src}]${drawtextFilter(item, font)}[${dest}]`);
    });
    videoLabel = "vout";
  }

  const videoInputCount = project.tracks.video.length;
  project.tracks.audio.forEach((item) => {
    const clip = findClip(project, item.clipId);
    inputs.push(mediaAbsPath(project, clip.relPath));
  });

  let audioLabel = "outa";
  if (project.tracks.audio.length > 0) {
    const mixParts = ["[outa]"];
    project.tracks.audio.forEach((item, i) => {
      const inputIndex = videoInputCount + i;
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

  const filter = parts.join(";");
  const output = path.join(
    projectDir(project.id),
    "renders",
    `rev-${String(project.revision).padStart(4, "0")}.mp4`
  );

  const args = ["-y"];
  for (const input of inputs) args.push("-i", input);
  args.push(
    "-filter_complex",
    filter,
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

  return { inputs, filter, output, args };
}
