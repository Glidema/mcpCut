import { ffmpegPath, ffprobePath } from "../config.js";
import { binaryAvailable } from "./process.js";
import { whisperAvailable } from "./whisper.js";

export async function engineStatus(): Promise<{
  ffmpeg: boolean;
  ffprobe: boolean;
  whisper: boolean;
}> {
  const [ffmpeg, ffprobe, whisper] = await Promise.all([
    binaryAvailable(ffmpegPath()),
    binaryAvailable(ffprobePath()),
    whisperAvailable()
  ]);
  return { ffmpeg, ffprobe, whisper };
}
