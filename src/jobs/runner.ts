import { ffmpegPath } from "../config.js";
import { buildRenderPlan, type RenderOptions } from "../engine/render.js";
import { runCommand } from "../engine/process.js";
import { loadProject } from "../project/store.js";
import { createJob, loadJob, patchJob, type Job } from "./store.js";
import { formatError } from "../tools/respond.js";

export async function submitRender(projectId: string, opts: RenderOptions = {}): Promise<Job> {
  const project = await loadProject(projectId);
  buildRenderPlan(project, opts);
  const job = await createJob(projectId, opts);
  void runRender(job.id);
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
