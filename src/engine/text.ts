import { existsSync } from "node:fs";
import type { TextItem } from "../types/project.js";

const FONT_CANDIDATES = [
  "/System/Library/Fonts/STHeiti Light.ttc",
  "/System/Library/Fonts/Hiragino Sans GB.ttc",
  "/System/Library/Fonts/PingFang.ttc",
  "/System/Library/Fonts/Supplemental/Songti.ttc",
  "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
  "/System/Library/Fonts/Helvetica.ttc",
  "/System/Library/Fonts/Supplemental/Arial.ttf"
];

export function resolveFontFile(): string {
  const env = process.env.MCPCUT_FONT?.trim();
  if (env) {
    if (!existsSync(env)) throw new Error(`MCPCUT_FONT not found: ${env}`);
    return env;
  }
  const found = FONT_CANDIDATES.find((p) => existsSync(p));
  if (!found) {
    throw new Error("No system font found for drawtext; set MCPCUT_FONT to a TTF/TTC file");
  }
  return found;
}

export function escapeDrawtext(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:")
    .replace(/%/g, "\\%");
}

const STYLE = {
  title: { fontsize: 72, y: "h*0.10" },
  subtitle: { fontsize: 48, y: "h*0.18" },
  caption: { fontsize: 36, y: "h-th-120" }
} as const;

export function drawtextFilter(item: TextItem, fontfile: string): string {
  const style = STYLE[item.style];
  const font = escapeDrawtext(fontfile);
  const text = escapeDrawtext(item.text);
  return (
    `drawtext=fontfile='${font}':text='${text}':fontsize=${style.fontsize}:` +
    `fontcolor=white:borderw=3:bordercolor=black:x=(w-text_w)/2:y=${style.y}:` +
    `enable='between(t,${item.start},${item.end})'`
  );
}
