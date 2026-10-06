import { readFile } from "node:fs/promises";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { PACKAGE_VERSION, PHASE, resolveRoot } from "./config.js";
import { previewProject as extractPreview } from "./engine/preview.js";
import { formatProbe, probeMedia } from "./engine/ffprobe.js";
import { engineStatus } from "./engine/status.js";
import { describeProject } from "./project/describe.js";
import { timelineOpSchema } from "./project/schema.js";
import { copyIntoMedia, createProject, loadProject, restoreVersion, saveProject } from "./project/store.js";
import { applyOperations } from "./project/timeline.js";
import { applyAudioOps, applyOverlayOps } from "./project/tracks.js";
import { submitRender } from "./jobs/runner.js";
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
        "Report mcpCut version and the tools this process actually registered. If version is not 0.3.1, reload Cursor MCP. New tool names need a new Agent chat after reload.",
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
            "mix_audio"
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
        "Apply ordered video-track operations: add_video, trim_video, remove_item, reorder_video. Clips are packed end-to-end with no gaps. Does not render. in/out are source seconds.",
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
        "Start an async FFmpeg export of the current video track to MP4 (scaled/padded to project spec). Returns jobId immediately. Poll get_job until status is done or error. Does not modify the source file. Empty timeline is an error.",
      inputSchema: z.object({
        projectId: z.string().min(1)
      })
    },
    async ({ projectId }) => {
      try {
        const job = await submitRender(projectId);
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
        "Poll a render job. status is queued, running, done, or error. When done, outputPath is the exported MP4.",
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
        "Burn a text overlay onto the timeline (title, subtitle, or caption). Times are timeline seconds. One overlay per call. Does not render; call render afterwards.",
      inputSchema: z.object({
        projectId: z.string().min(1),
        text: z.string().min(1).max(200).describe("Overlay copy"),
        start: z.number().nonnegative().describe("Timeline start seconds"),
        end: z.number().positive().describe("Timeline end seconds"),
        style: z.enum(["title", "subtitle", "caption"]).optional()
      })
    },
    async ({ projectId, text, start, end, style }) => {
      try {
        const project = await loadProject(projectId);
        const saved = await saveProject(
          applyOverlayOps(project, [{ op: "add_text", text, start, end, style }])
        );
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

  return server;
}
