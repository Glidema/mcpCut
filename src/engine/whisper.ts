import { access } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { ensureFfmpegOnPath, pythonPath, whisperArgs, whisperModel } from "../config.js";
import { runCommand } from "./process.js";

let cachedAvailable: Promise<boolean> | undefined;

export function whisperAvailable(): Promise<boolean> {
  cachedAvailable ??= probeWhisper();
  return cachedAvailable;
}

async function probeWhisper(): Promise<boolean> {
  const { command, prefix } = whisperArgs();
  try {
    if (prefix[0] === "-m" && prefix[1] === "whisper") {
      await runCommand(pythonPath(), ["-c", "import whisper"], { timeoutMs: 20_000 });
      return true;
    }
    await runCommand(command, [...prefix, "--help"], { timeoutMs: 20_000 });
    return true;
  } catch {
    return false;
  }
}

export async function runWhisper(wavPath: string, outDir: string, language?: string): Promise<string> {
  const { command, prefix } = whisperArgs();
  const args = [
    ...prefix,
    wavPath,
    "--model",
    whisperModel(),
    "--output_dir",
    outDir,
    "--output_format",
    "json",
    "--verbose",
    "False",
    "--fp16",
    "False",
    "--device",
    "cpu"
  ];
  if (language) {
    args.push("--language", language);
  }
  const pathWithFfmpeg = ensureFfmpegOnPath();
  const { stderr } = await runCommand(command, args, {
    timeoutMs: 600_000,
    env: { ...process.env, PATH: pathWithFfmpeg }
  });
  const jsonPath = path.join(outDir, `${path.parse(wavPath).name}.json`);
  try {
    await access(jsonPath);
  } catch {
    throw new Error(
      `Whisper did not write ${jsonPath}. openai-whisper shells out to ffmpeg; it must be on PATH.\n${stderr.trim().slice(-1500)}`
    );
  }
  return jsonPath;
}

export function defaultWhisperHint(): string {
  const cache = path.join(homedir(), ".cache", "whisper");
  return (
    `Whisper not found. Install openai-whisper (python3 -m whisper) or set WHISPER_BIN. ` +
    `Default model is "${whisperModel()}" (cached under ${cache}).`
  );
}
