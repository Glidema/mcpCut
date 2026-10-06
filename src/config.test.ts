import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { pathWithFfmpegDir } from "./config.js";

describe("pathWithFfmpegDir", () => {
  it("prepends the ffmpeg directory once", () => {
    const once = pathWithFfmpegDir("/tmp/mcpcut-ffmpeg-shim/ffmpeg", "/usr/bin");
    assert.equal(once, `/tmp/mcpcut-ffmpeg-shim${path.delimiter}/usr/bin`);
    const twice = pathWithFfmpegDir("/tmp/mcpcut-ffmpeg-shim/ffmpeg", once);
    assert.equal(twice, once);
  });
});
