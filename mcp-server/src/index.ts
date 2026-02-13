#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { startHttpBridge } from "./http-server.js";
import { registerTools } from "./tools.js";

const PORT = parseInt(process.env.VF_PORT || "9823", 10);

const server = new McpServer({
  name: "visual-feedback",
  version: "1.0.0",
});

registerTools(server);
startHttpBridge(PORT);

const transport = new StdioServerTransport();
await server.connect(transport);

console.error("[MCP] Visual Feedback server running (stdio + HTTP)");
