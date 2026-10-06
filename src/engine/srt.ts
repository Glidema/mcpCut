export interface CaptionCue {
  start: number;
  end: number;
  text: string;
}

export function formatSrt(cues: CaptionCue[]): string {
  return cues
    .map((cue, i) => `${i + 1}\n${formatSrtTime(cue.start)} --> ${formatSrtTime(cue.end)}\n${cue.text.trim()}`)
    .join("\n\n")
    .concat(cues.length ? "\n" : "");
}

export function parseSrt(raw: string): CaptionCue[] {
  const blocks = raw.replace(/^\uFEFF/, "").trim().split(/\n\s*\n/);
  const cues: CaptionCue[] = [];
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).filter((line) => line.length > 0);
    if (lines.length < 2) continue;
    const timeLine = lines[0].includes("-->") ? lines[0] : lines[1];
    const match = timeLine.match(
      /(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/
    );
    if (!match) continue;
    const text = (lines[0].includes("-->") ? lines.slice(1) : lines.slice(2)).join("\n").trim();
    if (!text) continue;
    cues.push({ start: parseSrtTime(match[1]), end: parseSrtTime(match[2]), text });
  }
  return cues;
}

export function parseWhisperJson(raw: string): CaptionCue[] {
  const data = JSON.parse(raw) as {
    segments?: Array<{ start?: number; end?: number; text?: string }>;
    transcription?: Array<{
      offsets?: { from?: number; to?: number };
      text?: string;
    }>;
  };
  if (Array.isArray(data.segments)) {
    return data.segments
      .map((seg) => ({
        start: Number(seg.start ?? 0),
        end: Number(seg.end ?? 0),
        text: String(seg.text ?? "").trim()
      }))
      .filter((cue) => cue.text && cue.end > cue.start);
  }
  if (Array.isArray(data.transcription)) {
    return data.transcription
      .map((seg) => ({
        start: (seg.offsets?.from ?? 0) / 1000,
        end: (seg.offsets?.to ?? 0) / 1000,
        text: String(seg.text ?? "").trim()
      }))
      .filter((cue) => cue.text && cue.end > cue.start);
  }
  throw new Error("Whisper JSON has no segments");
}

export function formatSrtTime(sec: number): string {
  const clamped = Math.max(0, sec);
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = Math.floor(clamped % 60);
  const millis = Math.round((clamped - Math.floor(clamped)) * 1000);
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)},${pad(millis, 3)}`;
}

function parseSrtTime(value: string): number {
  const [h, m, rest] = value.replace(".", ",").split(":");
  const [s, ms] = rest.split(",");
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000;
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}
