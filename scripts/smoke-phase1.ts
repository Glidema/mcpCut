import path from "node:path";
import { createProject, loadProject, saveProject, copyIntoMedia } from "../src/project/store.js";
import { applyOperations } from "../src/project/timeline.js";
import { describeProject } from "../src/project/describe.js";
import { probeMedia, formatProbe } from "../src/engine/ffprobe.js";
import { previewProject } from "../src/engine/preview.js";
import { engineStatus } from "../src/engine/status.js";
import { ffmpegPath, ffprobePath, resolveRoot } from "../src/config.js";
import { nowIso, shortId } from "../src/util/ids.js";
import { pathExists } from "../src/util/fs.js";

const mediaPath = path.resolve(process.argv[2] ?? "vivi/mcbb.MP4");

async function main(): Promise<void> {
  console.log("root", resolveRoot());
  console.log("ffmpeg", ffmpegPath());
  console.log("ffprobe", ffprobePath());
  console.log("engine", await engineStatus());

  if (!(await pathExists(mediaPath))) {
    throw new Error(`Test video not found: ${mediaPath}`);
  }

  const probe = await probeMedia(mediaPath);
  console.log("\n[inspect]\n" + formatProbe(mediaPath, probe));

  const project = await createProject("mcbb-phase1", "9:16");
  console.log("\n[create]", project.id, "rev", project.revision);

  const clipId = shortId("clip");
  const relPath = await copyIntoMedia(project.id, mediaPath, clipId);
  project.media.push({
    id: clipId,
    kind: probe.kind,
    originalPath: mediaPath,
    relPath,
    durationSec: probe.durationSec,
    width: probe.width,
    height: probe.height,
    fps: probe.fps,
    hasAudio: probe.hasAudio,
    importedAt: nowIso()
  });
  let saved = await saveProject(project);
  console.log("[import]", clipId, "rev", saved.revision);

  saved = await saveProject(
    applyOperations(saved, [
      { op: "add_video", clipId, in: 0, out: 3 },
      { op: "add_video", clipId, in: 5, out: 8 }
    ])
  );
  console.log("\n[add two clips]\n" + describeProject(saved));

  const first = saved.tracks.video[0].id;
  const second = saved.tracks.video[1].id;
  saved = await saveProject(
    applyOperations(saved, [{ op: "trim_video", itemId: first, in: 0, out: 1.5 }])
  );
  console.log("\n[trim first]\n" + describeProject(saved));

  saved = await saveProject(
    applyOperations(saved, [{ op: "reorder_video", itemIds: [second, first] }])
  );
  console.log("\n[reorder]\n" + describeProject(saved));

  const frames = await previewProject(saved, 2);
  console.log("\n[preview]");
  for (const f of frames) console.log(f.file);

  saved = await saveProject(applyOperations(saved, [{ op: "remove_item", itemId: second }]));
  console.log("\n[remove]\n" + describeProject(saved));
  console.log("\nOK", saved.id);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
