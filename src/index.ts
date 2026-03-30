#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.js";

async function startMcpServer(): Promise<void> {
  const server = new McpServer({
    name: "garmin-connect-mcp",
    version: "0.1.0",
  });

  registerTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("garmin-connect-mcp server running on stdio");
}

async function main(): Promise<void> {
  const command = process.argv[2];

  if (command === "login") {
    const { runLogin } = await import("./auth.js");
    await runLogin();
  } else {
    await startMcpServer();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
