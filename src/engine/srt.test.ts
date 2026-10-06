import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatSrt, parseSrt, parseWhisperJson } from "./srt.js";

describe("srt", () => {
  it("round-trips cues", () => {
    const srt = formatSrt([
      { start: 0, end: 1.5, text: "你好" },
      { start: 1.5, end: 3, text: "世界" }
    ]);
    const cues = parseSrt(srt);
    assert.equal(cues.length, 2);
    assert.equal(cues[0].text, "你好");
    assert.equal(cues[1].start, 1.5);
    assert.match(srt, /00:00:01,500 --> 00:00:03,000/);
  });

  it("parses openai whisper json", () => {
    const cues = parseWhisperJson(
      JSON.stringify({
        segments: [
          { start: 0.2, end: 1.1, text: " hello " },
          { start: 1.1, end: 2, text: "drop" }
        ]
      })
    );
    assert.deepEqual(cues, [
      { start: 0.2, end: 1.1, text: "hello" },
      { start: 1.1, end: 2, text: "drop" }
    ]);
  });
});
