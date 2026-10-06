import { loadProject, saveProject } from "../src/project/store.js";
import { applyOverlayOps } from "../src/project/tracks.js";
import { submitRender } from "../src/jobs/runner.js";
import { loadJob } from "../src/jobs/store.js";

const projectId = process.argv[2];
if (!projectId) {
  console.error("usage: tsx scripts/smoke-phase3.ts <projectId>");
  process.exit(1);
}

const edited = applyOverlayOps(await loadProject(projectId), [
  { op: "add_text", text: "mcpCut 测试", start: 0, end: 2, style: "title" },
  { op: "add_text", text: "5-8s + open 1.5s", start: 2, end: 4.5, style: "caption" }
]);
const saved = await saveProject(edited);
console.log("rev", saved.revision, "text", saved.tracks.text.length);

const job = await submitRender(projectId);
for (let i = 0; i < 120; i++) {
  const status = await loadJob(job.id);
  if (status.status === "done") {
    console.log("OK", status.outputPath);
    process.exit(0);
  }
  if (status.status === "error") {
    console.error(status.error);
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 400));
}
throw new Error("timeout");
