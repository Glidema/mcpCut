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
  title: { fontsize: 72, y: "h*0.10", x: "(w-text_w)/2" },
  subtitle: { fontsize: 48, y: "h*0.18", x: "(w-text_w)/2" },
  caption: { fontsize: 36, y: "h-th-120", x: "(w-text_w)/2" }
} as const;

function xy(item: TextItem): { x: string; y: string; fontsize: number } {
  const base = STYLE[item.style];
  if (item.position === "top-right") {
    return { x: "w-text_w-48", y: "48", fontsize: item.style === "title" ? 42 : 28 };
  }
  if (item.position === "top") return { x: base.x, y: "80", fontsize: base.fontsize };
  if (item.position === "bottom") return { x: base.x, y: "h-th-80", fontsize: base.fontsize };
  return { x: base.x, y: base.y, fontsize: base.fontsize };
}

export function drawtextFilter(item: TextItem, fontfile: string): string {
  const pos = xy(item);
  const font = escapeDrawtext(fontfile);
  const text = escapeDrawtext(item.text);
  return (
    `drawtext=fontfile='${font}':text='${text}':fontsize=${pos.fontsize}:` +
    `fontcolor=white:borderw=3:bordercolor=black:x=${pos.x}:y=${pos.y}:` +
    `enable='between(t,${item.start},${item.end})'`
  );
}
