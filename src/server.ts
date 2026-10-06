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
import { copyIntoMedia, createProject, loadProject, saveProject } from "./project/store.js";
import { applyOperations } from "./project/timeline.js";
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
        "Report mcpCut phase, workspace root, and whether ffmpeg/ffprobe are available. Call this before inspect or preview.",
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
            "describe_project"
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
        "Copy a local media file into the project media/ folder, probe it, and return clipId. Does not place it on the timeline; follow with edit_timeline add_video.",
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

  return server;
}
