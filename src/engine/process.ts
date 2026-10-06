import { spawn } from "node:child_process";

export class CommandError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly details?: string
  ) {
    super(message);
    this.name = "CommandError";
  }
}

export async function runCommand(
  command: string,
  args: string[],
  opts: { timeoutMs?: number; env?: NodeJS.ProcessEnv } = {}
): Promise<{ stdout: string; stderr: string }> {
  const timeoutMs = opts.timeoutMs ?? 60_000;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], env: opts.env });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new CommandError(`${command} timed out after ${timeoutMs}ms`, "TIMEOUT", stderr));
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(
          new CommandError(
            `Binary not found: ${command}. Install FFmpeg or set FFMPEG_PATH / FFPROBE_PATH.`,
            "ENOENT"
          )
        );
        return;
      }
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(
        new CommandError(
          `${command} exited ${code}`,
          "EXIT",
          stderr.trim().slice(-2000) || stdout.trim().slice(-2000)
        )
      );
    });
  });
}

export async function binaryAvailable(command: string): Promise<boolean> {
  try {
    await runCommand(command, ["-version"], { timeoutMs: 5000 });
    return true;
  } catch {
    return false;
  }
}
