#!/usr/bin/env node
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { ensureFfmpegOnPath } from "./config.js";
import { createServer } from "./server.js";

ensureFfmpegOnPath();
serveStdio(() => createServer());
