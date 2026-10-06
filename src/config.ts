import { accessSync, chmodSync, constants, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PHASE = 6;
export const PACKAGE_VERSION = "0.6.0";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

export function resolveRoot(): string {
  const fromEnv = process.env.MCPCUT_ROOT?.trim();
  if (fromEnv) return fromEnv;
  return `${process.cwd()}/.mcpcut`;
}

function bundled(pathOrNull: string | null | undefined): string | undefined {
  if (pathOrNull && existsSync(pathOrNull)) return ensureExecutable(pathOrNull);
  return undefined;
}

function ensureExecutable(bin: string): string {
  try {
    accessSync(bin, constants.X_OK);
  } catch {
    chmodSync(bin, 0o755);
  }
  return bin;
}

function bundledFfmpeg(): string | undefined {
  try {
    return bundled(require("ffmpeg-static") as string | null);
  } catch {
    return undefined;
  }
}

function bundledFfprobe(): string | undefined {
  try {
    const mod = require("ffprobe-static") as { path?: string };
    return bundled(mod.path);
  } catch {
    return undefined;
  }
}

export function ffmpegPath(): string {
  return (
    process.env.FFMPEG_PATH?.trim() ||
    bundled(path.join(repoRoot, "vendor/bin/ffmpeg")) ||
    bundledFfmpeg() ||
    "ffmpeg"
  );
}

export function ffprobePath(): string {
  return (
    process.env.FFPROBE_PATH?.trim() ||
    bundled(path.join(repoRoot, "vendor/bin/ffprobe")) ||
    bundledFfprobe() ||
    "ffprobe"
  );
}

export function pythonPath(): string {
  return process.env.PYTHON_PATH?.trim() || process.env.PYTHON?.trim() || "python3";
}

/** openai-whisper CLI, or `python3 -m whisper` when unset. */
export function whisperArgs(): { command: string; prefix: string[] } {
  const bin = process.env.WHISPER_BIN?.trim();
  if (bin) return { command: bin, prefix: [] };
  return { command: pythonPath(), prefix: ["-m", "whisper"] };
}

export function whisperModel(): string {
  return process.env.WHISPER_MODEL?.trim() || "small";
}

/** openai-whisper shells out to `ffmpeg` by name; Cursor MCP PATH often has none. */
export function pathWithFfmpegDir(ffmpegBin: string, pathEnv: string): string {
  if (!path.isAbsolute(ffmpegBin)) return pathEnv;
  const dir = path.dirname(ffmpegBin);
  const parts = pathEnv.split(path.delimiter).filter(Boolean);
  if (parts.includes(dir)) return parts.join(path.delimiter);
  return [dir, ...parts].join(path.delimiter);
}

export function ensureFfmpegOnPath(): string {
  const next = pathWithFfmpegDir(ffmpegPath(), process.env.PATH ?? "");
  process.env.PATH = next;
  return next;
}
