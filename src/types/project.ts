export type AspectPreset = "9:16" | "16:9" | "1:1" | "custom";

export interface ProjectSpec {
  width: number;
  height: number;
  fps: number;
  aspect: AspectPreset;
}

export type MediaKind = "video" | "audio" | "image";

export interface MediaAsset {
  id: string;
  kind: MediaKind;
  originalPath: string;
  relPath: string;
  durationSec?: number;
  width?: number;
  height?: number;
  fps?: number;
  hasAudio?: boolean;
  importedAt: string;
}

export interface VideoItem {
  id: string;
  clipId: string;
  in: number;
  out: number;
  start: number;
  layout?: "full" | "pip";
}

export interface AudioItem {
  id: string;
  clipId: string;
  in: number;
  out: number;
  start: number;
  volume: number;
  fadeIn?: number;
  fadeOut?: number;
}

export interface TextItem {
  id: string;
  start: number;
  end: number;
  text: string;
  style: "title" | "subtitle" | "caption";
  position?: "center" | "top" | "bottom" | "top-right";
}

export interface Project {
  schemaVersion: 1;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  spec: ProjectSpec;
  media: MediaAsset[];
  tracks: {
    video: VideoItem[];
    audio: AudioItem[];
    text: TextItem[];
  };
}

export const ASPECT_PRESETS: Record<Exclude<AspectPreset, "custom">, Omit<ProjectSpec, "aspect">> = {
  "9:16": { width: 1080, height: 1920, fps: 30 },
  "16:9": { width: 1920, height: 1080, fps: 30 },
  "1:1": { width: 1080, height: 1080, fps: 30 }
};
