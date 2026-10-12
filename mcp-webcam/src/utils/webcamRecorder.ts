export function pickRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t));
}

export function buildRecordStream(
  videoEl: HTMLVideoElement | null | undefined,
  withAudio: boolean
): MediaStream {
  const src = videoEl?.srcObject;
  if (!(src instanceof MediaStream)) {
    throw new Error("摄像头画面未就绪，请稍候或刷新页面");
  }
  const tracks: MediaStreamTrack[] = [];
  const videoTracks = src.getVideoTracks();
  if (videoTracks.length === 0) {
    throw new Error("没有可用的视频轨道，请检查摄像头权限");
  }
  tracks.push(videoTracks[0]);
  if (withAudio) {
    const audioTracks = src.getAudioTracks();
    if (audioTracks.length > 0) {
      tracks.push(audioTracks[0]);
    }
  }
  return new MediaStream(tracks);
}

export interface ActiveRecorder {
  recorder: MediaRecorder;
  chunks: Blob[];
  startedAt: number;
  recordingId: string;
  mimeType: string;
}

export function startMediaRecorder(
  stream: MediaStream,
  recordingId: string
): ActiveRecorder {
  const mimeType = pickRecorderMimeType();
  const recorder = mimeType
    ? new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_500_000 })
    : new MediaRecorder(stream, { videoBitsPerSecond: 2_500_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) chunks.push(ev.data);
  };
  recorder.start(1000);
  return {
    recorder,
    chunks,
    startedAt: Date.now(),
    recordingId,
    mimeType: recorder.mimeType || mimeType || "video/webm",
  };
}

export function stopMediaRecorder(active: ActiveRecorder): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const { recorder, chunks } = active;
    if (recorder.state === "inactive") {
      resolve(new Blob(chunks, { type: active.mimeType }));
      return;
    }
    recorder.onerror = () => reject(new Error("MediaRecorder error"));
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: active.mimeType || "video/webm" }));
    };
    recorder.stop();
  });
}
