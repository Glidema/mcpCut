import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  capClipCount,
  invertToSpeech,
  mergeShortSegments,
  mergeSpans,
  parseSilenceSpans,
  speechRatio
} from "./silence.js";

describe("silence", () => {
  it("parses ffmpeg silencedetect and inverts to speech", () => {
    const log = `
[silencedetect @] silence_start: 0.00
[silencedetect @] silence_end: 1.50 | silence_duration: 1.50
[silencedetect @] silence_start: 4.00
[silencedetect @] silence_end: 5.00 | silence_duration: 1.00
`;
    const silences = parseSilenceSpans(log);
    assert.deepEqual(silences, [
      { start: 0, end: 1.5 },
      { start: 4, end: 5 }
    ]);
    const speech = invertToSpeech(silences, 6);
    assert.deepEqual(speech, [
      { start: 1.5, end: 4 },
      { start: 5, end: 6 }
    ]);
  });

  it("merges close islands and drops shorts", () => {
    const merged = mergeSpans(
      [
        { start: 1, end: 1.4 },
        { start: 1.6, end: 3 },
        { start: 10, end: 10.2 }
      ],
      { maxGap: 0.45, pad: 0, minSec: 1.2 }
    );
    assert.equal(merged.length, 1);
    assert.equal(merged[0].start, 1);
    assert.equal(merged[0].end, 3);
  });

  it("caps clip count by merging the shortest pair", () => {
    const capped = capClipCount(
      [
        { start: 0, end: 2 },
        { start: 3, end: 4 },
        { start: 10, end: 16 }
      ],
      2
    );
    assert.equal(capped.length, 2);
    assert.equal(capped[0].start, 0);
    assert.equal(capped[0].end, 4);
  });

  it("merges short scene shots", () => {
    const shots = mergeShortSegments(
      [
        { start: 0, end: 0.4 },
        { start: 0.4, end: 2.5 },
        { start: 2.5, end: 2.7 },
        { start: 2.7, end: 5 }
      ],
      1.2
    );
    assert.ok(shots.every((s) => s.end - s.start >= 1.2 * 0.85));
    assert.ok(speechRatio(shots, 5) > 0.9);
  });
});
