import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Project } from "../types/project.js";
import { buildTimelineAudioPlan } from "./extract-audio.js";

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
        { id: "v2", clipId: "clip_a", in: 45, out: 51, start: 6 },
        { id: "pip", clipId: "clip_a", in: 0, out: 3, start: 2, layout: "pip" }
      ],
      audio: [],
      text: []
    }
  };
}

describe("timeline audio extract", () => {
  it("concats main clips only and skips pip", () => {
    const plan = buildTimelineAudioPlan(project());
    assert.equal(plan.inputs.length, 2);
    assert.match(plan.filter, /atrim=start=20:end=26/);
    assert.match(plan.filter, /atrim=start=45:end=51/);
    assert.match(plan.filter, /concat=n=2:v=0:a=1/);
    assert.match(plan.output, /transcripts\/timeline\.wav$/);
  });
});
