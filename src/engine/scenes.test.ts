import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evenPick,
  formatSceneReport,
  mergeSceneCuts,
  parseSceneCuts,
  segmentsFromCuts
} from "./scenes.js";

describe("scenes", () => {
  it("parses showinfo pts_time", () => {
    const log = `
[Parsed_showinfo_2] n:  0 pts:  90090 pts_time:3.003
[Parsed_showinfo_2] n:  1 pts: 180180 pts_time:6.006
`;
    assert.deepEqual(parseSceneCuts(log), [3.003, 6.006]);
  });

  it("merges close cuts and builds segments", () => {
    const { cuts } = mergeSceneCuts([0, 0.05, 1.0, 1.2, 8], { start: 0, end: 10, minGap: 0.35 });
    assert.deepEqual(cuts, [1, 8]);
    assert.deepEqual(segmentsFromCuts(cuts, 10), [
      { start: 0, end: 1 },
      { start: 1, end: 8 },
      { start: 8, end: 10 }
    ]);
  });

  it("even-picks and formats", () => {
    assert.deepEqual(evenPick([1, 2, 3, 4, 5], 3), [1, 3, 5]);
    const text = formatSceneReport({
      threshold: 0.3,
      cuts: [1, 2],
      segments: [],
      truncated: false
    });
    assert.match(text, /scenes=2/);
  });
});
