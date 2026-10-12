import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { ServerFactory } from "./transport/base-transport.js";
import { Logger } from "./utils/logger.js";
import {
  beginRecording,
  clampMaxSeconds,
  getLastRecording,
  getRecordingStatus,
  listRecordings,
  requestStopRecording,
} from "./recording/store.js";

// Store clients with their resolve functions, grouped by user
export let clients = new Map<string, Map<string, any>>(); // user -> clientId -> response
export let captureCallbacks = new Map<
  string,
  Map<string, (response: string | { error: string }) => void>
>(); // user -> clientId -> callback

interface ParsedDataUrl {
  mimeType: string;
  base64Data: string;
}

function parseDataUrl(dataUrl: string): ParsedDataUrl {
  const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) {
    throw new Error("Invalid data URL format");
  }
  return {
    mimeType: matches[1],
    base64Data: matches[2],
  };
}

function getPort(): number {
  // Check command line argument first (from process.argv)
  const args = process.argv.slice(2);
  const portArgIndex = args.findIndex(arg => arg === '-p' || arg === '--port');
  if (portArgIndex !== -1 && portArgIndex + 1 < args.length) {
    const portValue = parseInt(args[portArgIndex + 1]);
    if (!isNaN(portValue)) {
      return portValue;
    }
  }
  
  // Check positional argument for backward compatibility
  const lastArg = args[args.length - 1];
  if (lastArg && !lastArg.startsWith('-') && !isNaN(Number(lastArg))) {
    return Number(lastArg);
  }
  
  // Check environment variable
  if (process.env.PORT) {
    return parseInt(process.env.PORT);
  }
  
  return 3333;
}

function getMcpHost(): string {
  return process.env.MCP_HOST || `http://localhost:${getPort()}`;
}

// Helper functions for user-scoped client management
export function getUserClients(user: string): Map<string, any> {
  if (!clients.has(user)) {
    clients.set(user, new Map());
  }
  return clients.get(user)!;
}

export function getUserCallbacks(user: string): Map<string, (response: string | { error: string }) => void> {
  if (!captureCallbacks.has(user)) {
    captureCallbacks.set(user, new Map());
  }
  return captureCallbacks.get(user)!;
}

function notifyBrowser(user: string, payload: Record<string, unknown>): boolean {
  const userClients = getUserClients(user);
  const clientId = Array.from(userClients.keys())[0];
  if (!clientId) return false;
  const res = userClients.get(clientId);
  if (!res) return false;
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
  return true;
}

function noBrowserError(user: string) {
  return {
    isError: true as const,
    content: [
      {
        type: "text" as const,
        text: `还没有打开摄像头页面。请让用户用浏览器打开 ${getMcpHost()}${user !== "default" ? `?user=${user}` : ""}，允许摄像头后重试。`,
      },
    ],
  };
}

/**
 * Factory function to create and configure an MCP server instance with webcam capabilities
 */
export const createWebcamServer: ServerFactory = async (user: string = 'default') => {
  const mcpServer = new McpServer(
    {
      name: "mcp-webcam",
      version: "0.3.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        sampling: {}, // Enable sampling capability
      },
    }
  );

  // Set up resource handlers
  mcpServer.server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const userClients = getUserClients(user);
    if (userClients.size === 0) return { resources: [] };

    return {
      resources: [
        {
          uri: "webcam://current",
          name: "Current view from the Webcam",
          mimeType: "image/jpeg", // probably :)
        },
      ],
    };
  });

  mcpServer.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    // Check if we have any connected clients for this user
    const userClients = getUserClients(user);
    if (userClients.size === 0) {
      throw new Error(
        `No clients connected for user '${user}'. Please visit ${getMcpHost()}${user !== 'default' ? `?user=${user}` : ''} and enable your Webcam.`
      );
    }

    // Validate URI
    if (request.params.uri !== "webcam://current") {
      throw new Error(
        "Invalid resource URI. Only webcam://current is supported."
      );
    }

    const clientId = Array.from(userClients.keys())[0];
    const userCallbacks = getUserCallbacks(user);

    // Capture image
    const result = await new Promise<string | { error: string }>((resolve) => {
      userCallbacks.set(clientId, resolve);
      userClients
        .get(clientId)
        ?.write(`data: ${JSON.stringify({ type: "capture" })}\n\n`);
    });

    // Handle error case
    if (typeof result === "object" && "error" in result) {
      throw new Error(`Failed to capture image: ${result.error}`);
    }

    // Parse the data URL
    const { mimeType, base64Data } = parseDataUrl(result);

    // Return in the blob format
    return {
      contents: [
        {
          uri: request.params.uri,
          mimeType,
          blob: base64Data,
        },
      ],
    };
  });

  // Define tools using the modern McpServer tool method
  mcpServer.tool(
    "capture",
    "Gets the latest picture from the webcam. You can use this " +
      " if the human asks questions about their immediate environment,  " +
      "if you want to see the human or to examine an object they may be " +
      "referring to or showing you.",
    {},
    {
      openWorldHint: true,
      readOnlyHint: true,
      title: "Take a Picture from the webcam",
    },
    async () => {
      const userClients = getUserClients(user);
      if (userClients.size === 0) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `还没有打开摄像头页面。请让用户打开 ${getMcpHost()}${user !== 'default' ? `?user=${user}` : ''}，允许摄像头后重试。`,
            },
          ],
        };
      }

      const clientId = Array.from(userClients.keys())[0];

      if (!clientId) {
        throw new Error("No clients connected");
      }

      const userCallbacks = getUserCallbacks(user);

      // Modified promise to handle both success and error cases
      const result = await new Promise<string | { error: string }>(
        (resolve) => {
          Logger.info(`Capturing for ${clientId} (user: ${user}`);
          userCallbacks.set(clientId, resolve);

          userClients
            .get(clientId)
            ?.write(`data: ${JSON.stringify({ type: "capture" })}\n\n`);
        }
      );

      // Handle error case
      if (typeof result === "object" && "error" in result) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Failed to capture: ${result.error}`,
            },
          ],
        };
      }

      const { mimeType, base64Data } = parseDataUrl(result);

      return {
        content: [
          {
            type: "text",
            text: "Here is the latest image from the Webcam",
          },
          {
            type: "image",
            data: base64Data,
            mimeType: mimeType,
          },
        ],
      };
    }
  );

  mcpServer.tool(
    "screenshot",
    "Gets a screenshot of the current screen or window",
    {},
    {
      openWorldHint: true,
      readOnlyHint: true,
      title: "Take a Screenshot",
    },
    async () => {
      const userClients = getUserClients(user);
      if (userClients.size === 0) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `还没有打开摄像头页面。请让用户打开 ${getMcpHost()}?user=${user}，允许摄像头后重试。`,
            },
          ],
        };
      }

      const clientId = Array.from(userClients.keys())[0];

      if (!clientId) {
        throw new Error("No clients connected");
      }

      const userCallbacks = getUserCallbacks(user);

      // Modified promise to handle both success and error cases
      const result = await new Promise<string | { error: string }>(
        (resolve) => {
          Logger.info(`Taking screenshot for ${clientId} (user: ${user}`);
          userCallbacks.set(clientId, resolve);

          userClients
            .get(clientId)
            ?.write(`data: ${JSON.stringify({ type: "screenshot" })}\n\n`);
        }
      );

      // Handle error case
      if (typeof result === "object" && "error" in result) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Failed to capture screenshot: ${result.error}`,
            },
          ],
        };
      }

      const { mimeType, base64Data } = parseDataUrl(result);

      return {
        content: [
          {
            type: "text",
            text: "Here is the requested screenshot",
          },
          {
            type: "image",
            data: base64Data,
            mimeType: mimeType,
          },
        ],
      };
    }
  );

  mcpServer.tool(
    "start_recording",
    "Start recording the webcam (and microphone by default) in the browser tab. " +
      "Optional args: maxSeconds (1-300, default 60), withAudio (default true). " +
      "Call stop_recording when done. Returns a local path for mcpCut import_clip.",
    {},
    {
      openWorldHint: true,
      readOnlyHint: false,
      title: "Start Webcam Recording",
    },
    async (extra: any) => {
      const args = (extra?.arguments ?? extra ?? {}) as {
        maxSeconds?: number;
        withAudio?: boolean;
      };
      const userClients = getUserClients(user);
      if (userClients.size === 0) return noBrowserError(user);

      try {
        const maxSeconds =
          args?.maxSeconds != null ? clampMaxSeconds(Number(args.maxSeconds)) : undefined;
        const withAudio =
          args?.withAudio == null ? undefined : Boolean(args.withAudio);
        const started = await beginRecording(
          user,
          { maxSeconds, withAudio, force: true },
          (payload) => notifyBrowser(user, payload)
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "recording",
                  ...started,
                  hint: "Call stop_recording when finished (or wait for maxSeconds auto-stop).",
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: err instanceof Error ? err.message : String(err),
            },
          ],
        };
      }
    }
  );

  mcpServer.tool(
    "stop_recording",
    "Stop the current webcam recording, wait for upload/save, and return the local file path " +
      "(mp4 when ffmpeg is available, otherwise webm).",
    {},
    {
      openWorldHint: true,
      readOnlyHint: false,
      title: "Stop Webcam Recording",
    },
    async () => {
      try {
        const result = await requestStopRecording(user, (payload) =>
          notifyBrowser(user, payload)
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: err instanceof Error ? err.message : String(err),
            },
          ],
        };
      }
    }
  );

  mcpServer.tool(
    "recording_status",
    "Report whether the webcam is idle, recording, or saving. Includes elapsed seconds and last file path.",
    {},
    {
      openWorldHint: true,
      readOnlyHint: true,
      title: "Webcam Recording Status",
    },
    async () => {
      const status = getRecordingStatus(user);
      return {
        content: [{ type: "text", text: JSON.stringify(status, null, 2) }],
      };
    }
  );

  mcpServer.tool(
    "list_recordings",
    "List recent saved webcam recordings (local paths). Prefer mp4 when both webm and mp4 exist. Optional arg: limit (default 20).",
    {},
    {
      openWorldHint: true,
      readOnlyHint: true,
      title: "List Webcam Recordings",
    },
    async (extra: any) => {
      const args = (extra?.arguments ?? extra ?? {}) as { limit?: number };
      const limit = args?.limit != null ? Number(args.limit) : 20;
      const items = await listRecordings(limit);
      return {
        content: [{ type: "text", text: JSON.stringify({ recordings: items }, null, 2) }],
      };
    }
  );

  mcpServer.tool(
    "get_last_recording",
    "Return the most recent webcam recording path for this session/user (or on disk).",
    {},
    {
      openWorldHint: true,
      readOnlyHint: true,
      title: "Get Last Webcam Recording",
    },
    async () => {
      const last = await getLastRecording(user);
      if (!last) {
        return {
          isError: true,
          content: [{ type: "text", text: "还没有录像。请先 start_recording，再 stop_recording。" }],
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(last, null, 2) }],
      };
    }
  );

  return mcpServer;
};