import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Project } from "../types/project.js";
import { applyAudioOps, applyOverlayOps } from "./tracks.js";

function sample(): Project {
  return {
    schemaVersion: 1,
    id: "demo",
    name: "demo",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    revision: 1,
    spec: { width: 1080, height: 1920, fps: 30, aspect: "9:16" },
    media: [
      {
        id: "clip_a",
        kind: "video",
        originalPath: "/tmp/a.mp4",
        relPath: "media/a.mp4",
        durationSec: 10,
        hasAudio: true,
        importedAt: "2026-01-01T00:00:00.000Z"
      },
      {
        id: "clip_bgm",
        kind: "audio",
        originalPath: "/tmp/b.mp3",
        relPath: "media/b.mp3",
        durationSec: 30,
        hasAudio: true,
        importedAt: "2026-01-01T00:00:00.000Z"
      }
    ],
    tracks: {
      video: [{ id: "v1", clipId: "clip_a", in: 0, out: 4, start: 0 }],
      audio: [],
      text: []
    }
  };
}

describe("overlay and audio tracks", () => {
  it("adds and updates text", () => {
    let project = applyOverlayOps(sample(), [
      { op: "add_text", text: "Hello", start: 0, end: 2, style: "title" }
    ]);
    assert.equal(project.tracks.text.length, 1);
    const id = project.tracks.text[0].id;
    project = applyOverlayOps(project, [{ op: "update_text", itemId: id, text: "Hi" }]);
    assert.equal(project.tracks.text[0].text, "Hi");
    project = applyOverlayOps(project, [{ op: "remove_overlay", itemId: id }]);
    assert.equal(project.tracks.text.length, 0);
  });

  it("adds bgm with default volume", () => {
    const project = applyAudioOps(sample(), [{ op: "add_audio", clipId: "clip_bgm", in: 0, out: 4 }]);
    assert.equal(project.tracks.audio[0].volume, 0.25);
    assert.equal(project.tracks.audio[0].start, 0);
  });

  it("rejects text with end <= start", () => {
    assert.throws(() =>
      applyOverlayOps(sample(), [{ op: "add_text", text: "x", start: 2, end: 1 }])
    );
  });
});
