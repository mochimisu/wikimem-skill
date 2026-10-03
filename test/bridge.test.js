import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { connect, loopbackFetch } from "../src/client/connect.js";

test("stdio bridge preserves canonical host, authentication, tools and results", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "wikimem-client-"));
  const connections = [];
  const server = http.createServer(async (req, res) => {
    if (
      req.headers.host !== "memory.example" ||
      req.headers.authorization !== "Bearer fixture-key"
    ) {
      res.writeHead(403);
      res.end();
      return;
    }
    const mcp = new McpServer({ name: "fixture", version: "1" });
    mcp.registerTool("wiki_status", { inputSchema: {} }, async () => ({
      content: [{ type: "text", text: "fixture" }],
      structuredContent: { user: "fixture" },
    }));
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    connections.push(mcp);
    await mcp.connect(transport);
    await transport.handleRequest(req, res);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const client = new Client({ name: "test", version: "1" });
  try {
    const keyFile = path.join(temp, "key");
    await writeFile(keyFile, "fixture-key", { mode: 0o600 });
    const config = path.join(temp, "client.json");
    await writeFile(
      config,
      JSON.stringify({
        url: "https://memory.example/mcp",
        localUrl: `http://127.0.0.1:${server.address().port}/mcp`,
        keyFile,
      }),
    );
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: ["scripts/mcp-bridge.js", config],
        stderr: "pipe",
      }),
    );
    assert.equal((await client.listTools()).tools[0].name, "wiki_status");
    assert.equal(
      (await client.callTool({ name: "wiki_status", arguments: {} }))
        .structuredContent.user,
      "fixture",
    );
  } finally {
    await client.close();
    for (const c of connections) await c.close();
    await new Promise((r) => server.close(r));
    await rm(temp, { recursive: true, force: true });
  }
});

test("loopback transport rejects remote plaintext destinations", () => {
  assert.throws(
    () => loopbackFetch("http://192.0.2.1/mcp"),
    /Loopback transport only/,
  );
});

test("unavailable local route falls back without changing the canonical endpoint", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "wikimem-fallback-"));
  const connections = [];
  const server = http.createServer(async (req, res) => {
    const mcp = new McpServer({ name: "fixture", version: "1" });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    connections.push(mcp);
    await mcp.connect(transport);
    await transport.handleRequest(req, res);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  let c;
  try {
    const keyFile = path.join(temp, "key");
    await writeFile(keyFile, "fixture-key");
    c = await connect({
      url: `http://127.0.0.1:${server.address().port}/mcp`,
      localUrl: "http://127.0.0.1:1/mcp",
      keyFile,
    });
    assert.equal(c.route, "public-https");
  } finally {
    await c?.close();
    for (const x of connections) await x.close();
    await new Promise((r) => server.close(r));
    await rm(temp, { recursive: true, force: true });
  }
});
