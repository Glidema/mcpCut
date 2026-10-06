import { copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveRoot } from "../config.js";
import type { AspectPreset, Project } from "../types/project.js";
import { ASPECT_PRESETS } from "../types/project.js";
import { projectSchema } from "./schema.js";
import { ensureDir, pathExists } from "../util/fs.js";
import { nowIso, shortId, slugify } from "../util/ids.js";

export function projectsRoot(): string {
  return path.join(resolveRoot(), "projects");
}

export function projectDir(projectId: string): string {
  return path.join(projectsRoot(), projectId);
}

export function projectFile(projectId: string): string {
  return path.join(projectDir(projectId), "project.json");
}

export async function createProject(name: string, aspect: AspectPreset = "9:16"): Promise<Project> {
  const preset = aspect === "custom" ? ASPECT_PRESETS["9:16"] : ASPECT_PRESETS[aspect];
  const spec = { ...preset, aspect };
  const createdAt = nowIso();
  const id = `${slugify(name)}-${shortId("p").slice(2)}`;
  const project: Project = {
    schemaVersion: 1,
    id,
    name,
    createdAt,
    updatedAt: createdAt,
    revision: 1,
    spec,
    media: [],
    tracks: { video: [], audio: [], text: [] }
  };

  await ensureDir(path.join(projectDir(id), "media"));
  await ensureDir(path.join(projectDir(id), "versions"));
  await ensureDir(path.join(projectDir(id), "previews"));
  await ensureDir(path.join(projectDir(id), "renders"));
  await ensureDir(path.join(projectDir(id), "transcripts"));
  await ensureDir(path.join(projectDir(id), "highlights"));
  await persist(project);
  return project;
}

export async function loadProject(projectId: string): Promise<Project> {
  const file = projectFile(projectId);
  if (!(await pathExists(file))) {
    throw new Error(`Unknown project: ${projectId}`);
  }
  const raw = JSON.parse(await readFile(file, "utf8"));
  return projectSchema.parse(raw);
}

export async function saveProject(project: Project): Promise<Project> {
  const next: Project = {
    ...project,
    revision: project.revision + 1,
    updatedAt: nowIso()
  };
  await persist(next);
  return next;
}

export async function restoreVersion(projectId: string, revision: number): Promise<Project> {
  const current = await loadProject(projectId);
  const snapFile = path.join(
    projectDir(projectId),
    "versions",
    `rev-${String(revision).padStart(4, "0")}.json`
  );
  if (!(await pathExists(snapFile))) {
    throw new Error(`No snapshot rev ${revision} for ${projectId}`);
  }
  const snap = projectSchema.parse(JSON.parse(await readFile(snapFile, "utf8")));
  const next: Project = {
    ...snap,
    id: current.id,
    revision: current.revision + 1,
    updatedAt: nowIso()
  };
  await persist(next);
  return next;
}

async function persist(project: Project): Promise<void> {
  const dir = projectDir(project.id);
  await ensureDir(dir);
  await ensureDir(path.join(dir, "versions"));
  const json = JSON.stringify(project, null, 2);
  await writeFile(projectFile(project.id), json, "utf8");
  const rev = String(project.revision).padStart(4, "0");
  await writeFile(path.join(dir, "versions", `rev-${rev}.json`), json, "utf8");
}

export async function copyIntoMedia(
  projectId: string,
  sourcePath: string,
  clipId: string
): Promise<string> {
  const ext = path.extname(sourcePath) || ".bin";
  const relPath = path.join("media", `${clipId}${ext}`);
  const dest = path.join(projectDir(projectId), relPath);
  await ensureDir(path.dirname(dest));
  await copyFile(sourcePath, dest);
  return relPath;
}

export function mediaAbsPath(project: Project, relPath: string): string {
  return path.join(projectDir(project.id), relPath);
}
