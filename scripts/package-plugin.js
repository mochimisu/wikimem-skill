import { promises as fs } from "node:fs";
import path from "node:path";
if (!process.env.WIKIMEM_URL)
  throw new Error("Set WIKIMEM_URL to your service origin");
const url = new URL(process.env.WIKIMEM_URL);
if (
  !["http:", "https:"].includes(url.protocol) ||
  url.username ||
  url.password ||
  url.search ||
  url.hash ||
  url.pathname !== "/"
)
  throw new Error("WIKIMEM_URL must be an HTTP(S) origin with no credentials");
if (
  url.protocol !== "https:" &&
  !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
)
  throw new Error("Remote plugins require HTTPS");
const target = path.resolve("dist/wikimem");
await fs.rm(target, { recursive: true, force: true });
await fs.mkdir(target, { recursive: true });
await fs.cp("plugin", target, { recursive: true });
const mcp = {
  $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
  mcpServers: { wikimem: { type: "streamable-http" } },
};
mcp.mcpServers.wikimem.url = new URL("/mcp", url).href;
await fs.writeFile(
  path.join(target, "mcp.json"),
  JSON.stringify(mcp, null, 2) + "\n",
);
console.log(`Packaged ${target} for ${mcp.mcpServers.wikimem.url}`);

const appId = process.env.WIKIMEM_CHATGPT_APP_ID;
if (appId) {
  if (!/^plugin_asdk_app[_a-zA-Z0-9-]+$/.test(appId))
    throw new Error("Expected registered ChatGPT plugin_asdk_app ID");
  const hosted = path.resolve("dist/wikimem-chatgpt");
  await fs.rm(hosted, { recursive: true, force: true });
  await fs.cp(target, hosted, { recursive: true });
  await fs.rm(path.join(hosted, "mcp.json"));
  await fs.writeFile(
    path.join(hosted, ".app.json"),
    JSON.stringify(
      { apps: { wikimem: { id: appId, required: true } } },
      null,
      2,
    ) + "\n",
  );
  const manifest = JSON.parse(
    await fs.readFile(path.join(hosted, "plugin.json"), "utf8"),
  );
  manifest.extensions["com.openai"].apps = "./.app.json";
  await fs.writeFile(
    path.join(hosted, "plugin.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  console.log(`Packaged registered ChatGPT connection at ${hosted}`);
}
