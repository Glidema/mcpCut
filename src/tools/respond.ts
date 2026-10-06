import type { CallToolResult } from "@modelcontextprotocol/server";
import { CommandError } from "../engine/process.js";

export function ok(text: string, extra?: Record<string, unknown>): CallToolResult {
  const body = extra ? `${text}\n\n${JSON.stringify(extra, null, 2)}` : text;
  return { content: [{ type: "text", text: body }] };
}

export function fail(err: unknown): CallToolResult {
  const message = formatError(err);
  return { content: [{ type: "text", text: message }], isError: true };
}

export function formatError(err: unknown): string {
  if (err instanceof CommandError) {
    return err.details ? `${err.message}\n${err.details}` : err.message;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
