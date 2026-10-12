import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  _resetRecordingStateForTests,
  ackRecordingStarted,
  beginRecording,
  getLastRecording,
  listRecordings,
  requestStopRecording,
  saveRecordingUpload,
} from "../recording/store.js";

function run(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: "ignore" });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${bin} exit ${code}`))));
  });
}

async function main() {
  const dir = await mkdtemp(path.join(tmpdir(), "mcp-webcam-smoke-"));
  process.env.MCP_WEBCAM_RECORDINGS = dir;
  _resetRecordingStateForTests();

  try {
    let recordingId = "";
    const info = await beginRecording(
      "smoke",
      { maxSeconds: 30, withAudio: false },
      (payload) => {
        recordingId = String(payload.recordingId);
        queueMicrotask(() => ackRecordingStarted("smoke", recordingId));
        return true;
      }
    );
    console.log("started", info);

    const ffmpeg =
      process.env.FFMPEG_PATH ||
      path.resolve(process.cwd(), "../node_modules/ffmpeg-static/ffmpeg");
    const sample = path.join(dir, "sample.webm");
    try {
      await run(ffmpeg, [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=blue:s=320x240:d=1",
        "-c:v",
        "libvpx",
        "-t",
        "1",
        sample,
      ]);
    } catch {
      await writeFile(sample, Buffer.from("webm-smoke"));
    }
    const buffer = await readFile(sample);

    const result = await requestStopRecording("smoke", (payload) => {
      console.log("stop notify", payload.type);
      queueMicrotask(() => {
        void saveRecordingUpload("smoke", {
          recordingId,
          buffer,
          mimeType: "video/webm",
          durationSec: 1.0,
        }).then(
          (r) => console.log("saved", r.path),
          (e) => console.error("save failed", e)
        );
      });
      return true;
    });

    console.log("result", result);
    console.log("listed", await listRecordings(5));
    console.log("last", await getLastRecording("smoke"));
    if (!result.path) throw new Error("missing path");
    console.log("SMOKE_OK", result.path);
  } finally {
    _resetRecordingStateForTests();
    await rm(dir, { recursive: true, force: true });
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
