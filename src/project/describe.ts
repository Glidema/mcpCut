import type { Project } from "../types/project.js";
import { clipDuration, timelineDuration } from "./timeline.js";

export function describeProject(project: Project): string {
  const total = timelineDuration(project);
  const lines = [
    `Project ${project.name} (${project.id}) rev ${project.revision}`,
    `Spec ${project.spec.width}x${project.spec.height} @ ${project.spec.fps}fps (${project.spec.aspect})`,
    `Media ${project.media.length} clip(s); video ${project.tracks.video.length}; ` +
      `audio ${project.tracks.audio.length}; text ${project.tracks.text.length}; duration ${total.toFixed(2)}s`
  ];

  project.tracks.video.forEach((item, i) => {
    const clip = project.media.find((m) => m.id === item.clipId);
    lines.push(
      `  [${i}] ${item.id} clip=${item.clipId} src ${item.in.toFixed(2)}-${item.out.toFixed(2)}s ` +
        `→ timeline ${item.start.toFixed(2)}s (${clipDuration(item).toFixed(2)}s)` +
        (item.layout === "pip" ? " PIP" : "") +
        (clip ? ` file=${clip.relPath}` : "")
    );
  });

  if (project.tracks.video.length === 0) {
    lines.push("  (empty video track)");
  }

  if (project.tracks.text.length > 0) {
    lines.push("Text:");
    project.tracks.text.forEach((item, i) => {
      lines.push(
        `  [${i}] ${item.id} ${item.style} ${item.start.toFixed(2)}-${item.end.toFixed(2)}s "${item.text}"`
      );
    });
  }

  if (project.tracks.audio.length > 0) {
    lines.push("Audio overlays:");
    project.tracks.audio.forEach((item, i) => {
      lines.push(
        `  [${i}] ${item.id} clip=${item.clipId} src ${item.in.toFixed(2)}-${item.out.toFixed(2)}s ` +
          `@ ${item.start.toFixed(2)}s vol=${item.volume}`
      );
    });
  }

  return lines.join("\n");
}
