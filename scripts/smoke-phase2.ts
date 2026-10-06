import { submitRender } from "../src/jobs/runner.js";
import { loadJob } from "../src/jobs/store.js";

const projectId = process.argv[2];
if (!projectId) {
  console.error("usage: tsx scripts/smoke-phase2.ts <projectId>");
  process.exit(1);
}

async function wait(jobId: string): Promise<void> {
  for (let i = 0; i < 120; i++) {
    const job = await loadJob(jobId);
    console.log(`poll ${i} ${job.status}${job.outputPath ? " " + job.outputPath : ""}`);
    if (job.status === "done") {
      console.log("OK", job.outputPath);
      return;
    }
    if (job.status === "error") {
      throw new Error(job.error ?? "render failed");
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("render timed out");
}

const job = await submitRender(projectId);
console.log("submitted", job.id);
await wait(job.id);
