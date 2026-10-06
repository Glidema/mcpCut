import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveRoot } from "../config.js";
import { ensureDir, pathExists } from "../util/fs.js";
import { nowIso, shortId } from "../util/ids.js";
import type { RenderOptions } from "../engine/render.js";
import type { CaptionCue } from "../engine/srt.js";

export type JobStatus = "queued" | "running" | "done" | "error";
export type JobKind = "render" | "transcribe";

export interface Job {
  id: string;
  kind: JobKind;
  projectId: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  outputPath?: string;
  error?: string;
  render?: RenderOptions;
  language?: string;
  summary?: string;
  cues?: CaptionCue[];
}

function jobsDir(): string {
  return path.join(resolveRoot(), "jobs");
}

export function jobFile(jobId: string): string {
  return path.join(jobsDir(), `${jobId}.json`);
}

export async function createJob(
  projectId: string,
  init: { kind?: JobKind; render?: RenderOptions; language?: string } = {}
): Promise<Job> {
  const job: Job = {
    id: shortId("job"),
    kind: init.kind ?? "render",
    projectId,
    status: "queued",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    render: init.render,
    language: init.language
  };
  await writeJob(job);
  return job;
}

export async function loadJob(jobId: string): Promise<Job> {
  const file = jobFile(jobId);
  if (!(await pathExists(file))) {
    throw new Error(`Unknown job: ${jobId}`);
  }
  return JSON.parse(await readFile(file, "utf8")) as Job;
}

export async function writeJob(job: Job): Promise<void> {
  await ensureDir(jobsDir());
  await writeFile(jobFile(job.id), JSON.stringify(job, null, 2), "utf8");
}

export async function patchJob(jobId: string, patch: Partial<Job>): Promise<Job> {
  const job = await loadJob(jobId);
  const next: Job = { ...job, ...patch, id: job.id, updatedAt: nowIso() };
  await writeJob(next);
  return next;
}
