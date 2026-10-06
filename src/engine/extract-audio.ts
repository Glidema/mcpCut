import path from "node:path";
import type { Project } from "../types/project.js";
import { mediaAbsPath, projectDir } from "../project/store.js";
import { clipDuration, findClip, isPip } from "../project/timeline.js";

export interface AudioExtractPlan {
  inputs: string[];
  filter: string;
  output: string;
  args: string[];
}

export function buildTimelineAudioPlan(project: Project): AudioExtractPlan {
  const mains = project.tracks.video.filter((item) => !isPip(item));
  if (mains.length === 0) {
    throw new Error("Video track needs at least one full-frame clip before transcribe");
  }

  const inputs: string[] = [];
  const parts: string[] = [];

  mains.forEach((item, i) => {
    const clip = findClip(project, item.clipId);
    if (clip.hasAudio === false) {
      throw new Error(`Clip ${clip.id} has no audio to transcribe`);
    }
    inputs.push(mediaAbsPath(project, clip.relPath));
    parts.push(
      `[${i}:a]atrim=start=${item.in}:end=${item.out},asetpts=PTS-STARTPTS,` +
        `aformat=sample_fmts=s16:sample_rates=16000:channel_layouts=mono[a${i}]`
    );
  });

  const concatIn = mains.map((_, i) => `[a${i}]`).join("");
  parts.push(`${concatIn}concat=n=${mains.length}:v=0:a=1[aout]`);

  const output = path.join(projectDir(project.id), "transcripts", "timeline.wav");
  const args = ["-y"];
  for (const input of inputs) args.push("-i", input);
  args.push("-filter_complex", parts.join(";"), "-map", "[aout]", "-c:a", "pcm_s16le", output);

  return { inputs, filter: parts.join(";"), output, args };
}
