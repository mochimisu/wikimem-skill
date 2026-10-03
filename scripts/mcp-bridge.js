import { readFile } from "node:fs/promises";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { connect } from "../src/client/connect.js";
const config = JSON.parse(await readFile(process.argv[2], "utf8"));
const upstream = await connect(config);
console.error(`[wikimem] connected via ${upstream.route}`);
const server = new Server(
  { name: "wikimem", version: "0.2.0" },
  { capabilities: { tools: {} } },
);
server.setRequestHandler(ListToolsRequestSchema, () =>
  upstream.client.listTools(),
);
server.setRequestHandler(CallToolRequestSchema, (request) =>
  upstream.client.callTool(request.params),
);
// Never replay a failed mutation on the fallback route: its outcome may be unknown.
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await server.close();
  await upstream.close();
}
process.on("SIGTERM", () => close().finally(() => process.exit()));
process.on("SIGINT", () => close().finally(() => process.exit()));
process.stdin.on("end", () => close());
await server.connect(new StdioServerTransport());
