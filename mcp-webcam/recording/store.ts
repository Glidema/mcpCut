import { spawn } from "node:child_process";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Logger } from "../utils/logger.js";

export type RecordingPhase = "idle" | "recording" | "saving";

export interface RecordingResult {
  path: string;
  durationSec: number;
  mimeType: string;
  recordingId: string;
  webmPath?: string;
}

export interface RecordingStatus {
  status: RecordingPhase;
  recordingId?: string;
  elapsedSec?: number;
  maxSeconds?: number;
  withAudio?: boolean;
  last?: RecordingResult;
}

interface UserRecordingState {
  phase: RecordingPhase;
  recordingId?: string;
  startedAt?: number;
  maxSeconds: number;
  withAudio: boolean;
  maxTimer?: ReturnType<typeof setTimeout>;
  /** Resolves when browser acks start, or start fails. */
  startWaiters: Array<(ok: true | { error: string }) => void>;
  /** Resolves when stop finishes saving, or fails. */
  stopWaiters: Array<(result: RecordingResult | { error: string }) => void>;
  last?: RecordingResult;
}

const states = new Map<string, UserRecordingState>();

export function recordingsRoot(): string {
  const fromEnv = process.env.MCP_WEBCAM_RECORDINGS?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  // Prefer cwd/recordings; fall back next to package when running from dist/
  return path.resolve(process.cwd(), "recordings");
}

function getState(user: string): UserRecordingState {
  let state = states.get(user);
  if (!state) {
    state = {
      phase: "idle",
      maxSeconds: 60,
      withAudio: true,
      startWaiters: [],
      stopWaiters: [],
    };
    states.set(user, state);
  }
  return state;
}

export function getRecordingStatus(user: string): RecordingStatus {
  const state = getState(user);
  const elapsedSec =
    state.phase === "recording" && state.startedAt
      ? (Date.now() - state.startedAt) / 1000
      : state.phase === "saving" && state.startedAt
        ? (Date.now() - state.startedAt) / 1000
        : undefined;
  return {
    status: state.phase,
    recordingId: state.recordingId,
    elapsedSec,
    maxSeconds: state.phase === "idle" ? undefined : state.maxSeconds,
    withAudio: state.phase === "idle" ? undefined : state.withAudio,
    last: state.last,
  };
}

function shortId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function clampMaxSeconds(value: number | undefined): number {
  const n = value == null || Number.isNaN(value) ? 60 : value;
  return Math.min(300, Math.max(1, Math.floor(n)));
}

type NotifyBrowser = (payload: Record<string, unknown>) => boolean;

/** Force idle. Use when UI/server get out of sync (stuck "Already recording"). */
export function resetRecording(user: string, reason = "Recording state reset"): void {
  const state = getState(user);
  if (state.maxTimer) {
    clearTimeout(state.maxTimer);
    state.maxTimer = undefined;
  }
  const startWaiters = state.startWaiters.splice(0);
  for (const w of startWaiters) w({ error: reason });
  settleStop(state, { error: reason });
  state.stopWaiters = [];
  state.phase = "idle";
  state.recordingId = undefined;
  state.startedAt = undefined;
  Logger.info(`Recording reset for user=${user}: ${reason}`);
}

function armRecordingState(
  user: string,
  opts: { maxSeconds?: number; withAudio?: boolean; force?: boolean }
): { state: UserRecordingState; recordingId: string; maxSeconds: number; withAudio: boolean } {
  const state = getState(user);
  // Default: clear stuck recording/saving so Start is never permanently blocked
  if (state.phase !== "idle") {
    if (opts.force === false) {
      throw new Error(
        `当前状态为「${state.phase === "recording" ? "录制中" : state.phase === "saving" ? "保存中" : state.phase}」，请先 stop_recording 或在页面点「重置」`
      );
    }
    resetRecording(user, `Superseded by new start (was ${state.phase})`);
  }

  const recordingId = `rec_${shortId()}`;
  const maxSeconds = clampMaxSeconds(opts.maxSeconds);
  const withAudio = opts.withAudio !== false;

  state.phase = "recording";
  state.recordingId = recordingId;
  state.startedAt = Date.now();
  state.maxSeconds = maxSeconds;
  state.withAudio = withAudio;
  state.startWaiters = [];
  state.stopWaiters = [];

  return { state, recordingId, maxSeconds, withAudio };
}

function armAutoStop(
  user: string,
  recordingId: string,
  maxSeconds: number,
  notify: NotifyBrowser
): void {
  const state = getState(user);
  if (state.maxTimer) clearTimeout(state.maxTimer);
  state.maxTimer = setTimeout(() => {
    Logger.info(`Auto-stopping recording ${recordingId} after ${maxSeconds}s`);
    void requestStopRecording(user, notify).catch((err) => {
      Logger.error("Auto-stop failed:", err);
    });
  }, maxSeconds * 1000);
}

/**
 * Claim a recording slot for the browser UI (manual start).
 * Does NOT push SSE / wait for ack — the same tab starts MediaRecorder itself.
 */
export function claimRecording(
  user: string,
  opts: { maxSeconds?: number; withAudio?: boolean; force?: boolean },
  notify?: NotifyBrowser
): { recordingId: string; maxSeconds: number; withAudio: boolean } {
  const { recordingId, maxSeconds, withAudio } = armRecordingState(user, opts);
  if (notify) {
    armAutoStop(user, recordingId, maxSeconds, notify);
  }
  return { recordingId, maxSeconds, withAudio };
}

/** Agent / MCP path: notify browser via SSE and wait until MediaRecorder acks. */
export async function beginRecording(
  user: string,
  opts: { maxSeconds?: number; withAudio?: boolean; force?: boolean },
  notify: NotifyBrowser
): Promise<{ recordingId: string; maxSeconds: number; withAudio: boolean }> {
  const { state, recordingId, maxSeconds, withAudio } = armRecordingState(user, opts);

  const started = new Promise<true | { error: string }>((resolve) => {
    state.startWaiters.push(resolve);
  });

  const ok = notify({
    type: "start_recording",
    recordingId,
    maxSeconds,
    withAudio,
  });
  if (!ok) {
    resetToIdle(state);
    throw new Error("没有浏览器摄像头页连接，无法开始录制。请先打开 http://localhost:3333");
  }

  // Browser must ack within 15s
  const ack = await Promise.race([
    started,
    new Promise<true | { error: string }>((resolve) =>
      setTimeout(
        () => resolve({ error: "等待浏览器开始录制超时（15 秒）。请确认摄像头页已打开且允许权限。" }),
        15_000
      )
    ),
  ]);

  // Drop any late waiters
  state.startWaiters = [];

  if (ack !== true) {
    resetToIdle(state);
    throw new Error(ack.error);
  }

  // Ignore late acks for a superseded id
  if (state.recordingId !== recordingId || state.phase !== "recording") {
    throw new Error("录制在启动完成前被取消，请重试");
  }

  armAutoStop(user, recordingId, maxSeconds, notify);

  return { recordingId, maxSeconds, withAudio };
}

export function ackRecordingStarted(user: string, recordingId: string): void {
  const state = getState(user);
  if (state.recordingId !== recordingId || state.phase !== "recording") return;
  const waiters = state.startWaiters.splice(0);
  for (const w of waiters) w(true);
}

export function failRecordingStart(user: string, recordingId: string, error: string): void {
  const state = getState(user);
  if (state.recordingId !== recordingId) return;
  const waiters = state.startWaiters.splice(0);
  for (const w of waiters) w({ error });
  // If nobody is waiting (race), still clear stuck phase
  if (state.phase === "recording" && state.recordingId === recordingId && waiters.length === 0) {
    resetToIdle(state);
  }
}

export async function requestStopRecording(
  user: string,
  notify: NotifyBrowser
): Promise<RecordingResult> {
  const state = getState(user);
  if (state.phase === "idle") {
    if (state.last) return state.last;
    throw new Error("Not recording");
  }
  if (state.phase === "saving") {
    return waitForStop(state);
  }

  const recordingId = state.recordingId!;
  if (state.maxTimer) {
    clearTimeout(state.maxTimer);
    state.maxTimer = undefined;
  }
  state.phase = "saving";

  const finished = waitForStop(state);

  const ok = notify({ type: "stop_recording", recordingId });
  if (!ok) {
    const err = "没有浏览器摄像头页连接，无法停止录制。请先打开摄像头页面";
    settleStop(state, { error: err });
    resetToIdle(state);
    throw new Error(err);
  }

  const result = await Promise.race([
    finished,
    new Promise<RecordingResult | { error: string }>((resolve) =>
      setTimeout(
        () => resolve({ error: "Timed out waiting for browser to upload recording" }),
        120_000
      )
    ),
  ]);

  if ("error" in result) {
    resetToIdle(state);
    throw new Error(result.error);
  }
  return result;
}

function waitForStop(state: UserRecordingState): Promise<RecordingResult> {
  return new Promise((resolve, reject) => {
    state.stopWaiters.push((result) => {
      if ("error" in result) reject(new Error(result.error));
      else resolve(result);
    });
  });
}

function settleStop(state: UserRecordingState, result: RecordingResult | { error: string }): void {
  const waiters = state.stopWaiters.splice(0);
  for (const w of waiters) w(result);
}

function resetToIdle(state: UserRecordingState): void {
  if (state.maxTimer) {
    clearTimeout(state.maxTimer);
    state.maxTimer = undefined;
  }
  state.phase = "idle";
  state.recordingId = undefined;
  state.startedAt = undefined;
  state.startWaiters = [];
}

export async function saveRecordingUpload(
  user: string,
  opts: {
    recordingId: string;
    buffer: Buffer;
    mimeType?: string;
    durationSec?: number;
  }
): Promise<RecordingResult> {
  const state = getState(user);
  if (state.recordingId !== opts.recordingId) {
    throw new Error(`Unexpected recordingId ${opts.recordingId}`);
  }

  const root = recordingsRoot();
  await mkdir(root, { recursive: true });

  const webmPath = path.join(root, `${opts.recordingId}.webm`);
  await writeFile(webmPath, opts.buffer);

  const durationSec =
    opts.durationSec ??
    (state.startedAt ? (Date.now() - state.startedAt) / 1000 : 0);

  let finalPath = webmPath;
  let mimeType = opts.mimeType || "video/webm";
  const mp4Path = path.join(root, `${opts.recordingId}.mp4`);
  let remuxed = false;
  try {
    remuxed = await tryRemuxToMp4(webmPath, mp4Path);
  } catch (err) {
    Logger.debug(`remux skipped: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (remuxed) {
    finalPath = mp4Path;
    mimeType = "video/mp4";
  }

  const result: RecordingResult = {
    path: finalPath,
    durationSec: Math.round(durationSec * 1000) / 1000,
    mimeType,
    recordingId: opts.recordingId,
    webmPath: remuxed ? webmPath : undefined,
  };

  state.last = result;
  settleStop(state, result);
  resetToIdle(state);
  return result;
}

export function failRecordingUpload(user: string, recordingId: string, error: string): void {
  const state = getState(user);
  if (state.recordingId !== recordingId && state.phase !== "saving") return;
  settleStop(state, { error });
  resetToIdle(state);
}

async function tryRemuxToMp4(webmPath: string, mp4Path: string): Promise<boolean> {
  const ffmpeg = process.env.FFMPEG_PATH?.trim() || "ffmpeg";
  // Prefer stream copy; fall back to re-encode
  const copyOk = await runFfmpeg(ffmpeg, [
    "-y",
    "-i",
    webmPath,
    "-c",
    "copy",
    mp4Path,
  ]);
  if (copyOk) return true;
  const encodeOk = await runFfmpeg(ffmpeg, [
    "-y",
    "-i",
    webmPath,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    mp4Path,
  ]);
  return encodeOk;
}

function runFfmpeg(bin: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    try {
      const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
      let stderr = "";
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on("error", () => done(false));
      child.on("close", (code) => {
        if (code === 0) done(true);
        else {
          Logger.debug(`ffmpeg exit ${code}: ${stderr.slice(-400)}`);
          done(false);
        }
      });
    } catch {
      done(false);
    }
  });
}

export interface ListedRecording {
  recordingId: string;
  path: string;
  mimeType: string;
  sizeBytes: number;
  mtimeMs: number;
}

export async function listRecordings(limit = 20): Promise<ListedRecording[]> {
  const root = recordingsRoot();
  try {
    await mkdir(root, { recursive: true });
    const names = await readdir(root);
    const preferred = new Map<string, ListedRecording>();

    for (const name of names) {
      if (!/^rec_[a-z0-9]+\.(webm|mp4)$/i.test(name)) continue;
      const full = path.join(root, name);
      const st = await stat(full);
      if (!st.isFile()) continue;
      const recordingId = name.replace(/\.(webm|mp4)$/i, "");
      const mimeType = name.toLowerCase().endsWith(".mp4") ? "video/mp4" : "video/webm";
      const entry: ListedRecording = {
        recordingId,
        path: full,
        mimeType,
        sizeBytes: st.size,
        mtimeMs: st.mtimeMs,
      };
      const prev = preferred.get(recordingId);
      // Prefer mp4 over webm for the same id
      if (!prev || (mimeType === "video/mp4" && prev.mimeType !== "video/mp4")) {
        preferred.set(recordingId, entry);
      } else if (prev && mimeType === prev.mimeType && st.mtimeMs > prev.mtimeMs) {
        preferred.set(recordingId, entry);
      }
    }

    return [...preferred.values()]
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(0, Math.max(1, Math.min(100, limit)));
  } catch (err) {
    Logger.error("listRecordings failed:", err);
    return [];
  }
}

export async function getLastRecording(user: string): Promise<RecordingResult | ListedRecording | null> {
  const state = getState(user);
  if (state.last) return state.last;
  const listed = await listRecordings(1);
  return listed[0] ?? null;
}

/** Exposed for tests / diagnostics */
export function _resetRecordingStateForTests(): void {
  for (const state of states.values()) {
    if (state.maxTimer) clearTimeout(state.maxTimer);
  }
  states.clear();
}
