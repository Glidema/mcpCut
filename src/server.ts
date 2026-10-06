import { readFile } from "node:fs/promises";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { PACKAGE_VERSION, PHASE, resolveRoot, whisperModel } from "./config.js";
import { previewProject as extractPreview } from "./engine/preview.js";
import { formatProbe, probeMedia } from "./engine/ffprobe.js";
import { engineStatus } from "./engine/status.js";
import { describeProject } from "./project/describe.js";
import { timelineOpSchema } from "./project/schema.js";
import { copyIntoMedia, createProject, loadProject, restoreVersion, saveProject } from "./project/store.js";
import { applyOperations } from "./project/timeline.js";
import { applyAudioOps, applyOverlayOps } from "./project/tracks.js";
import { submitRender, submitTranscribe } from "./jobs/runner.js";
import { loadJob } from "./jobs/store.js";
import { nowIso, shortId } from "./util/ids.js";
import { fail, ok } from "./tools/respond.js";
import { pathExists } from "./util/fs.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "mcpcut",
    version: PACKAGE_VERSION
  });

  server.registerTool(
    "get_status",
    {
      description:
        "Report mcpCut version and registered tools. If version is not 0.5.0 / phase 5, reload MCP (mcpcut3) and start a new Agent chat.",
      inputSchema: z.object({})
    },
    async () => {
      try {
        const bins = await engineStatus();
        return ok("mcpCut status", {
          version: PACKAGE_VERSION,
          phase: PHASE,
          root: resolveRoot(),
          ffmpeg: bins.ffmpeg,
          ffprobe: bins.ffprobe,
          whisper: bins.whisper,
          whisperModel: whisperModel(),
          implementedTools: [
            "get_status",
            "create_project",
            "inspect_media",
            "import_clip",
            "edit_timeline",
            "preview_project",
            "describe_project",
            "render",
            "get_job",
            "restore_version",
            "add_overlay",
            "mix_audio",
            "transcribe"
          ]
        });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "create_project",
    {
      description:
        "Create a new edit project with a target aspect ratio. Does not import media. Default aspect is 9:16 (1080x1920).",
      inputSchema: z.object({
        name: z.string().min(1).describe("Human-readable project name"),
        aspect: z
          .enum(["9:16", "16:9", "1:1"])
          .optional()
          .describe("Output aspect preset; default 9:16")
      })
    },
    async ({ name, aspect }) => {
      try {
        const project = await createProject(name, aspect ?? "9:16");
        return ok(`Created project ${project.id}`, {
          projectId: project.id,
          name: project.name,
          spec: project.spec,
          revision: project.revision
        });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "inspect_media",
    {
      description:
        "Probe a local media file with ffprobe (duration, size, fps, audio). Does not add it to a project. Path must be a local file; URLs are not supported.",
      inputSchema: z.object({
        path: z.string().min(1).describe("Absolute or cwd-relative path to a local media file")
      })
    },
    async ({ path: mediaPath }) => {
      try {
        const resolved = path.resolve(mediaPath);
        if (!(await pathExists(resolved))) {
          return fail(new Error(`File not found: ${resolved}`));
        }
        const probe = await probeMedia(resolved);
        return ok(formatProbe(resolved, probe), { path: resolved, ...probe });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "import_clip",
    {
      description:
        "Copy a local media file into the project media/ folder, probe it, and return clipId. Video, audio, and image files are accepted. Audio clips are for mix_audio BGM. Does not place the clip on the timeline.",
      inputSchema: z.object({
        projectId: z.string().min(1),
        path: z.string().min(1).describe("Local file to copy into the project")
      })
    },
    async ({ projectId, path: mediaPath }) => {
      try {
        const resolved = path.resolve(mediaPath);
        if (!(await pathExists(resolved))) {
          return fail(new Error(`File not found: ${resolved}`));
        }
        const probe = await probeMedia(resolved);
        const project = await loadProject(projectId);
        const clipId = shortId("clip");
        const relPath = await copyIntoMedia(projectId, resolved, clipId);
        project.media.push({
          id: clipId,
          kind: probe.kind,
          originalPath: resolved,
          relPath,
          durationSec: probe.durationSec,
          width: probe.width,
          height: probe.height,
          fps: probe.fps,
          hasAudio: probe.hasAudio,
          importedAt: nowIso()
        });
        const saved = await saveProject(project);
        return ok(`Imported ${clipId}`, {
          projectId: saved.id,
          revision: saved.revision,
          clipId,
          relPath,
          probe
        });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "edit_timeline",
    {
      description:
        "Apply video-track operations: add_video, trim_video, remove_item, reorder_video. Full clips pack end-to-end. add_video with layout=pip overlays a picture-in-picture (needs start on the timeline). in/out are source seconds. Does not render.",
      inputSchema: z.object({
        projectId: z.string().min(1),
        operations: z.array(timelineOpSchema).min(1)
      })
    },
    async ({ projectId, operations }) => {
      try {
        const project = await loadProject(projectId);
        const edited = applyOperations(project, operations);
        const saved = await saveProject(edited);
        const summary = describeProject(saved);
        return ok(summary, {
          projectId: saved.id,
          revision: saved.revision,
          video: saved.tracks.video
        });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "describe_project",
    {
      description:
        "Return a short text summary of the project timeline for the next reasoning step. Prefer this over guessing file contents.",
      inputSchema: z.object({
        projectId: z.string().min(1)
      })
    },
    async ({ projectId }) => {
      try {
        const project = await loadProject(projectId);
        return ok(describeProject(project), {
          projectId: project.id,
          revision: project.revision,
          spec: project.spec,
          media: project.media,
          tracks: project.tracks
        });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "preview_project",
    {
      description:
        "Extract midpoint JPEG frames for video-track items (max 12). Requires ffmpeg. Empty timeline is an error. Does not export a finished video.",
      inputSchema: z.object({
        projectId: z.string().min(1),
        maxFrames: z.number().int().min(1).max(12).optional()
      })
    },
    async ({ projectId, maxFrames }) => {
      try {
        const project = await loadProject(projectId);
        const frames = await extractPreview(project, maxFrames ?? 6);
        const content: Array<
          | { type: "text"; text: string }
          | { type: "image"; data: string; mimeType: string }
        > = [
          {
            type: "text",
            text: `Preview ${frames.length} frame(s) for ${project.id} rev ${project.revision}\n${frames
              .map(
                (f) =>
                  `${f.itemId} @ source ${f.atSourceSec.toFixed(2)}s → ${f.file}`
              )
              .join("\n")}`
          }
        ];
        for (const frame of frames) {
          const buf = await readFile(frame.file);
          content.push({
            type: "image",
            data: buf.toString("base64"),
            mimeType: "image/jpeg"
          });
        }
        return { content };
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "render",
    {
      description:
        "Start an async MP4 export. Optional aspect (9:16/16:9/1:1) exports another frame size without changing the project. Optional fit=cover center-crops; contain letterboxes. Returns jobId. Poll get_job. Does not modify the source file.",
      inputSchema: z.object({
        projectId: z.string().min(1),
        aspect: z.enum(["9:16", "16:9", "1:1"]).optional(),
        fit: z.enum(["contain", "cover"]).optional()
      })
    },
    async ({ projectId, aspect, fit }) => {
      try {
        const job = await submitRender(projectId, { aspect, fit });
        return ok(`Render job ${job.id} ${job.status}`, {
          jobId: job.id,
          status: job.status,
          projectId: job.projectId
        });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "get_job",
    {
      description:
        "Poll a render or transcribe job. status is queued, running, done, or error. Render done: outputPath is mp4. Transcribe done: outputPath is sidecar SRT (does not change the timeline).",
      inputSchema: z.object({
        jobId: z.string().min(1)
      })
    },
    async ({ jobId }) => {
      try {
        const job = await loadJob(jobId);
        return ok(`Job ${job.id} ${job.status}`, { ...job });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "restore_version",
    {
      description:
        "Restore project.json from versions/rev-NNNN.json. Writes a new revision so history is kept. Use describe_project revision numbers.",
      inputSchema: z.object({
        projectId: z.string().min(1),
        revision: z.number().int().positive()
      })
    },
    async ({ projectId, revision }) => {
      try {
        const project = await restoreVersion(projectId, revision);
        return ok(describeProject(project), {
          projectId: project.id,
          revision: project.revision,
          restoredFrom: revision,
          video: project.tracks.video
        });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "add_overlay",
    {
      description:
        "Burn text onto the timeline. Times are timeline seconds. position=top-right is a corner watermark. Pass removeItemId to delete an overlay instead. Does not render.",
      inputSchema: z.object({
        projectId: z.string().min(1),
        text: z.string().min(1).max(200).optional(),
        start: z.number().nonnegative().optional(),
        end: z.number().positive().optional(),
        style: z.enum(["title", "subtitle", "caption"]).optional(),
        position: z.enum(["center", "top", "bottom", "top-right"]).optional(),
        removeItemId: z.string().optional()
      })
    },
    async ({ projectId, text, start, end, style, position, removeItemId }) => {
      try {
        const project = await loadProject(projectId);
        if (!removeItemId && (text == null || start == null || end == null)) {
          throw new Error("text, start, and end are required unless removeItemId is set");
        }
        const ops = removeItemId
          ? [{ op: "remove_overlay" as const, itemId: removeItemId }]
          : [
              {
                op: "add_text" as const,
                text: text ?? "",
                start: start ?? 0,
                end: end ?? 0,
                style,
                position
              }
            ];
        const saved = await saveProject(applyOverlayOps(project, ops));
        return ok(describeProject(saved), {
          projectId: saved.id,
          revision: saved.revision,
          text: saved.tracks.text
        });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "mix_audio",
    {
      description:
        "Mix a BGM clip under the video. import_clip the audio file first, then pass its clipId. volume default 0.25. Does not render; call render afterwards.",
      inputSchema: z.object({
        projectId: z.string().min(1),
        clipId: z.string().min(1),
        volume: z.number().min(0).max(4).optional(),
        fadeIn: z.number().nonnegative().optional(),
        fadeOut: z.number().nonnegative().optional(),
        start: z.number().nonnegative().optional()
      })
    },
    async ({ projectId, clipId, volume, fadeIn, fadeOut, start }) => {
      try {
        const project = await loadProject(projectId);
        const saved = await saveProject(
          applyAudioOps(project, [{ op: "add_audio", clipId, volume, fadeIn, fadeOut, start }])
        );
        return ok(describeProject(saved), {
          projectId: saved.id,
          revision: saved.revision,
          audio: saved.tracks.audio
        });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.registerTool(
    "transcribe",
    {
      description:
        "Async speech-to-text of the current video track (not PIP). Writes a sidecar SRT under transcripts/; does not add overlays or change project.json. Poll get_job. Whisper must be available (python3 -m whisper).",
      inputSchema: z.object({
        projectId: z.string().min(1),
        language: z
          .string()
          .min(2)
          .max(32)
          .optional()
          .describe("Whisper language, e.g. Chinese or zh. Omit to auto-detect.")
      })
    },
    async ({ projectId, language }) => {
      try {
        const job = await submitTranscribe(projectId, language);
        return ok(`Transcribe job ${job.id} ${job.status}`, {
          jobId: job.id,
          status: job.status,
          projectId: job.projectId,
          kind: job.kind
        });
      } catch (err) {
        return fail(err);
      }
    }
  );

  return server;
}
