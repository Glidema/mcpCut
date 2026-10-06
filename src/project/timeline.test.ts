import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Project } from "../types/project.js";
import { describeProject } from "./describe.js";
import { applyOperations, clipDuration, packVideo, timelineDuration } from "./timeline.js";

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
        relPath: "media/clip_a.mp4",
        durationSec: 10,
        importedAt: "2026-01-01T00:00:00.000Z"
      }
    ],
    tracks: { video: [], audio: [], text: [] }
  };
}

describe("timeline", () => {
  it("packs clips end to end", () => {
    const packed = packVideo([
      { id: "v1", clipId: "clip_a", in: 0, out: 2, start: 99 },
      { id: "v2", clipId: "clip_a", in: 5, out: 8, start: 99 }
    ]);
    assert.equal(packed[0].start, 0);
    assert.equal(packed[1].start, 2);
    assert.equal(clipDuration(packed[1]), 3);
  });

  it("adds two segments and reports duration", () => {
    const project = applyOperations(sample(), [
      { op: "add_video", clipId: "clip_a", in: 0, out: 3 },
      { op: "add_video", clipId: "clip_a", in: 5, out: 8 }
    ]);
    assert.equal(project.tracks.video.length, 2);
    assert.equal(timelineDuration(project), 6);
  });

  it("trims, reorders, and removes", () => {
    let project = applyOperations(sample(), [
      { op: "add_video", clipId: "clip_a", in: 0, out: 3 },
      { op: "add_video", clipId: "clip_a", in: 5, out: 8 }
    ]);
    const first = project.tracks.video[0].id;
    const second = project.tracks.video[1].id;

    project = applyOperations(project, [{ op: "trim_video", itemId: first, in: 0, out: 1 }]);
    assert.equal(timelineDuration(project), 4);

    project = applyOperations(project, [{ op: "reorder_video", itemIds: [second, first] }]);
    assert.equal(project.tracks.video[0].id, second);
    assert.equal(project.tracks.video[1].start, 3);

    project = applyOperations(project, [{ op: "remove_item", itemId: second }]);
    assert.equal(project.tracks.video.length, 1);
    assert.equal(project.tracks.video[0].start, 0);
    assert.equal(timelineDuration(project), 1);
  });

  it("rejects out beyond duration and incomplete reorder", () => {
    const project = applyOperations(sample(), [{ op: "add_video", clipId: "clip_a", in: 0, out: 3 }]);
    assert.throws(() => applyOperations(project, [{ op: "trim_video", itemId: project.tracks.video[0].id, in: 0, out: 99 }]));
    assert.throws(() => applyOperations(project, [{ op: "reorder_video", itemIds: ["nope"] }]));
  });

  it("keeps pip off the packed duration", () => {
    const project = applyOperations(sample(), [
      { op: "add_video", clipId: "clip_a", in: 0, out: 3 },
      { op: "add_video", clipId: "clip_a", in: 0, out: 1, layout: "pip", start: 1 }
    ]);
    assert.equal(timelineDuration(project), 3);
    const pip = project.tracks.video.find((item) => item.layout === "pip");
    assert.equal(pip?.start, 1);
  });
});

describe("describe", () => {
  it("mentions empty track", () => {
    const text = describeProject(sample());
    assert.match(text, /empty video track/);
  });
});
