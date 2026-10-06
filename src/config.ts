import { accessSync, chmodSync, constants, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PHASE = 4;
export const PACKAGE_VERSION = "0.4.0";

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
