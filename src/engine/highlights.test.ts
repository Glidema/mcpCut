import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Project } from "../types/project.js";
import { highlightPlanToOps, shouldUseSpeechIslands } from "./highlights.js";
import { evenPick } from "./scenes.js";
import { applyOperations } from "../project/timeline.js";

function project(): Project {
  return {
    schemaVersion: 1,
    id: "demo",
    name: "demo",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    revision: 16,
    spec: { width: 1080, height: 1920, fps: 30, aspect: "9:16" },
    media: [
      {
        id: "clip_a",
        kind: "video",
        originalPath: "/tmp/a.mp4",
        relPath: "media/a.mp4",
        durationSec: 60,
        hasAudio: true,
        importedAt: "2026-01-01T00:00:00.000Z"
      }
    ],
    tracks: {
      video: [
        { id: "v1", clipId: "clip_a", in: 20, out: 26, start: 0 },
        { id: "pip", clipId: "clip_a", in: 0, out: 3, start: 2, layout: "pip" }
      ],
      audio: [],
      text: []
    }
  };
}

describe("highlight plan ops", () => {
  it("replaces main clips and keeps pip", () => {
    const ops = highlightPlanToOps(project(), {
      strategyUsed: "scenes",
      speechRatio: 0.05,
      windowSec: 60,
      keepSec: 8,
      note: "test",
      clips: [
        { clipId: "clip_a", in: 9.2, out: 20.5, reason: "scene" },
        { clipId: "clip_a", in: 47, out: 54, reason: "scene" }
      ]
    });
    const next = applyOperations(project(), ops);
    const mains = next.tracks.video.filter((item) => item.layout !== "pip");
    const pip = next.tracks.video.find((item) => item.layout === "pip");
    assert.equal(mains.length, 2);
    assert.equal(mains[0].in, 9.2);
    assert.equal(mains[1].in, 47);
    assert.equal(pip?.start, 2);
    assert.equal(mains[0].id.startsWith("v_"), true);
  });
});

describe("hybrid speech vs music", () => {
  it("rejects a single wall-of-sound island", () => {
    assert.equal(shouldUseSpeechIslands(0.99, 1), false);
    assert.equal(shouldUseSpeechIslands(0.03, 1), false);
    assert.equal(shouldUseSpeechIslands(0.55, 6), true);
  });
});

describe("scene highlight keep duration", () => {
  it("even-picks a subset of long shots so keepSec is below the full window", () => {
    const segs = [
      { start: 0, end: 9.2 },
      { start: 9.2, end: 20.5 },
      { start: 22.5, end: 28.2 },
      { start: 32.3, end: 40.4 },
      { start: 40.4, end: 43.9 },
      { start: 43.9, end: 47.8 },
      { start: 47.8, end: 53.7 },
      { start: 54.8, end: 58.4 },
      { start: 58.4, end: 60.1 }
    ];
    const picked = evenPick(
      segs.filter((span) => span.end - span.start >= 1.2 * 0.85),
      8
    );
    const keep = picked.reduce((sum, span) => sum + (span.end - span.start), 0);
    assert.ok(picked.length > 1);
    assert.ok(keep < 58);
  });
});
