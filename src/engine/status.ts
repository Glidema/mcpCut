import { ffmpegPath, ffprobePath } from "../config.js";
import { binaryAvailable } from "./process.js";

export async function engineStatus(): Promise<{ ffmpeg: boolean; ffprobe: boolean }> {
  const [ffmpeg, ffprobe] = await Promise.all([
    binaryAvailable(ffmpegPath()),
    binaryAvailable(ffprobePath())
  ]);
  return { ffmpeg, ffprobe };
}
