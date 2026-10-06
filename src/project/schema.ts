import * as z from "zod/v4";

export const aspectSchema = z.enum(["9:16", "16:9", "1:1", "custom"]);

export const specSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().positive(),
  aspect: aspectSchema
});

export const mediaAssetSchema = z.object({
  id: z.string(),
  kind: z.enum(["video", "audio", "image"]),
  originalPath: z.string(),
  relPath: z.string(),
  durationSec: z.number().nonnegative().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  fps: z.number().positive().optional(),
  hasAudio: z.boolean().optional(),
  importedAt: z.string()
});

export const videoItemSchema = z.object({
  id: z.string(),
  clipId: z.string(),
  in: z.number().nonnegative(),
  out: z.number().positive(),
  start: z.number().nonnegative(),
  layout: z.enum(["full", "pip"]).optional()
});

export const audioItemSchema = z.object({
  id: z.string(),
  clipId: z.string(),
  in: z.number().nonnegative(),
  out: z.number().positive(),
  start: z.number().nonnegative(),
  volume: z.number().nonnegative(),
  fadeIn: z.number().nonnegative().optional(),
  fadeOut: z.number().nonnegative().optional()
});

export const textItemSchema = z.object({
  id: z.string(),
  start: z.number().nonnegative(),
  end: z.number().positive(),
  text: z.string(),
  style: z.enum(["title", "subtitle", "caption"]),
  position: z.enum(["center", "top", "bottom", "top-right"]).optional()
});

export const projectSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  revision: z.number().int().positive(),
  spec: specSchema,
  media: z.array(mediaAssetSchema),
  tracks: z.object({
    video: z.array(videoItemSchema),
    audio: z.array(audioItemSchema),
    text: z.array(textItemSchema)
  })
});

export const addVideoOpSchema = z.object({
  op: z.literal("add_video"),
  clipId: z.string(),
  in: z.number().nonnegative().optional(),
  out: z.number().positive().optional(),
  layout: z.enum(["full", "pip"]).optional(),
  start: z.number().nonnegative().optional()
});

export const trimVideoOpSchema = z.object({
  op: z.literal("trim_video"),
  itemId: z.string(),
  in: z.number().nonnegative(),
  out: z.number().positive()
});

export const removeItemOpSchema = z.object({
  op: z.literal("remove_item"),
  itemId: z.string()
});

export const reorderVideoOpSchema = z.object({
  op: z.literal("reorder_video"),
  itemIds: z.array(z.string()).min(1)
});

export const cutHighlightsOpSchema = z.object({
  op: z.literal("cut_highlights"),
  strategy: z.enum(["hybrid", "speech", "scenes"]).optional(),
  scope: z.enum(["clip", "selection"]).optional(),
  minSec: z.number().positive().optional(),
  maxClips: z.number().int().min(1).max(24).optional(),
  apply: z.boolean().optional()
});

export const timelineOpSchema = z.discriminatedUnion("op", [
  addVideoOpSchema,
  trimVideoOpSchema,
  removeItemOpSchema,
  reorderVideoOpSchema,
  cutHighlightsOpSchema
]);

export type TimelineOp = z.infer<typeof timelineOpSchema>;

export const addTextOpSchema = z.object({
  op: z.literal("add_text"),
  text: z.string().min(1).max(200),
  start: z.number().nonnegative(),
  end: z.number().positive(),
  style: z.enum(["title", "subtitle", "caption"]).optional(),
  position: z.enum(["center", "top", "bottom", "top-right"]).optional()
});

export const updateTextOpSchema = z.object({
  op: z.literal("update_text"),
  itemId: z.string(),
  text: z.string().min(1).max(200).optional(),
  start: z.number().nonnegative().optional(),
  end: z.number().positive().optional(),
  style: z.enum(["title", "subtitle", "caption"]).optional()
});

export const removeOverlayOpSchema = z.object({
  op: z.literal("remove_overlay"),
  itemId: z.string()
});

export const overlayOpSchema = z.discriminatedUnion("op", [
  addTextOpSchema,
  updateTextOpSchema,
  removeOverlayOpSchema
]);

export type OverlayOp = z.infer<typeof overlayOpSchema>;

export const addAudioOpSchema = z.object({
  op: z.literal("add_audio"),
  clipId: z.string(),
  in: z.number().nonnegative().optional(),
  out: z.number().positive().optional(),
  start: z.number().nonnegative().optional(),
  volume: z.number().min(0).max(4).optional(),
  fadeIn: z.number().nonnegative().optional(),
  fadeOut: z.number().nonnegative().optional()
});

export const setVolumeOpSchema = z.object({
  op: z.literal("set_volume"),
  itemId: z.string(),
  volume: z.number().min(0).max(4),
  fadeIn: z.number().nonnegative().optional(),
  fadeOut: z.number().nonnegative().optional()
});

export const removeAudioOpSchema = z.object({
  op: z.literal("remove_audio"),
  itemId: z.string()
});

export const audioOpSchema = z.discriminatedUnion("op", [
  addAudioOpSchema,
  setVolumeOpSchema,
  removeAudioOpSchema
]);

export type AudioOp = z.infer<typeof audioOpSchema>;
