import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRenderPlan } from "./render.js";
import type { Project } from "../types/project.js";

function project(): Project {
  return {
    schemaVersion: 1,
    id: "demo",
    name: "demo",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    revision: 3,
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
      }
    ],
    tracks: {
      video: [
        { id: "v1", clipId: "clip_a", in: 0, out: 1.5, start: 0 },
        { id: "v2", clipId: "clip_a", in: 5, out: 8, start: 1.5 }
      ],
      audio: [],
      text: []
    }
  };
}

describe("render plan", () => {
  it("builds concat filter for two trims", () => {
    const plan = buildRenderPlan(project());
    assert.equal(plan.inputs.length, 2);
    assert.match(plan.filter, /concat=n=2:v=1:a=1/);
    assert.match(plan.filter, /trim=start=0:end=1.5/);
    assert.match(plan.filter, /trim=start=5:end=8/);
    assert.match(plan.output, /rev-0003\.mp4$/);
    assert.equal(plan.args.includes("-filter_complex"), true);
  });

  it("rejects empty track", () => {
    const empty = project();
    empty.tracks.video = [];
    assert.throws(() => buildRenderPlan(empty));
  });

  it("burns text and mixes extra audio", () => {
    const p = project();
    p.tracks.text = [{ id: "t1", start: 0, end: 1, text: "Hi", style: "title" }];
    p.tracks.audio = [
      { id: "a1", clipId: "clip_a", in: 0, out: 2, start: 0, volume: 0.2 }
    ];
    const plan = buildRenderPlan(p);
    assert.match(plan.filter, /drawtext=/);
    assert.match(plan.filter, /amix=inputs=2/);
    assert.equal(plan.inputs.length, 3);
  });
});
