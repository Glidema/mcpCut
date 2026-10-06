import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ffmpegPath } from "../config.js";
import { buildTimelineAudioPlan } from "../engine/extract-audio.js";
import { buildRenderPlan, type RenderOptions } from "../engine/render.js";
import { runCommand } from "../engine/process.js";
import { formatSrt, parseWhisperJson, type CaptionCue } from "../engine/srt.js";
import { defaultWhisperHint, runWhisper, whisperAvailable } from "../engine/whisper.js";
import { loadProject, projectDir } from "../project/store.js";
import { createJob, loadJob, patchJob, type Job } from "./store.js";
import { formatError } from "../tools/respond.js";
import { ensureDir } from "../util/fs.js";

export async function submitRender(projectId: string, opts: RenderOptions = {}): Promise<Job> {
  const project = await loadProject(projectId);
  buildRenderPlan(project, opts);
  const job = await createJob(projectId, { kind: "render", render: opts });
  void runRender(job.id);
  return job;
}

export async function submitTranscribe(projectId: string, language?: string): Promise<Job> {
  const project = await loadProject(projectId);
  buildTimelineAudioPlan(project);
  if (!(await whisperAvailable())) {
    throw new Error(defaultWhisperHint());
  }
  const job = await createJob(projectId, { kind: "transcribe", language });
  void runTranscribe(job.id);
  return job;
}

async function runRender(jobId: string): Promise<void> {
  try {
    await patchJob(jobId, { status: "running" });
    const job = await loadJob(jobId);
    const project = await loadProject(job.projectId);
    const plan = buildRenderPlan(project, job.render ?? {});
    await runCommand(ffmpegPath(), plan.args, { timeoutMs: 600_000 });
    await patchJob(jobId, { status: "done", outputPath: plan.output });
  } catch (err) {
    await patchJob(jobId, { status: "error", error: formatError(err) });
  }
}

async function runTranscribe(jobId: string): Promise<void> {
  try {
    await patchJob(jobId, { status: "running" });
    const job = await loadJob(jobId);
    const project = await loadProject(job.projectId);
    const audio = buildTimelineAudioPlan(project);
    await ensureDir(path.dirname(audio.output));
    await runCommand(ffmpegPath(), audio.args, { timeoutMs: 120_000 });
    const jsonPath = await runWhisper(audio.output, path.dirname(audio.output), job.language);
    const cues = parseWhisperJson(await readFile(jsonPath, "utf8"));
    const rev = `rev-${String(project.revision).padStart(4, "0")}`;
    const srtPath = path.join(projectDir(project.id), "transcripts", `${rev}.srt`);
    await writeFile(srtPath, formatSrt(cues), "utf8");
    await patchJob(jobId, {
      status: "done",
      outputPath: srtPath,
      cues: cues.slice(0, 40),
      summary: captionSummary(cues)
    });
  } catch (err) {
    await patchJob(jobId, { status: "error", error: formatError(err) });
  }
}

function captionSummary(cues: CaptionCue[]): string {
  if (cues.length === 0) return "(no speech)";
  const text = cues.map((cue) => cue.text).join(" ");
  return text.length > 400 ? `${text.slice(0, 397)}...` : text;
}
