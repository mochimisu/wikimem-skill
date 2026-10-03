import { readFile } from "node:fs/promises";
import net from "node:net";
import http from "node:http";
import { Readable } from "node:stream";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export async function connect(config) {
  const token =
    process.env.WIKIMEM_API_KEY ||
    (await readFile(config.keyFile, "utf8")).trim();
  if (!token) throw new Error("Missing Wikimem access key");
  const canonical = new URL(config.url);
  if (
    canonical.protocol !== "https:" &&
    !["127.0.0.1", "localhost", "[::1]"].includes(canonical.hostname)
  )
    throw new Error("Remote Wikimem requires HTTPS");
  let tunnel;
  const open = async (url, route) => {
    const client = new Client({
      name: "wikimem-local-bridge",
      version: "0.2.0",
    });
    const transport = new StreamableHTTPClientTransport(new URL(url), {
      fetch: new URL(url).protocol === "http:" ? loopbackFetch : undefined,
      requestInit: {
        headers: { Authorization: `Bearer ${token}`, Host: canonical.host },
        redirect: "error",
      },
    });
    try {
      await client.connect(transport, { timeout: 5000 });
      return {
        client,
        route,
        close: async () => {
          await client.close();
          tunnel?.kill();
        },
      };
    } catch (e) {
      await client.close().catch(() => {});
      throw e;
    }
  };
  if (config.localUrl) {
    const local = new URL(config.localUrl);
    if (
      local.protocol !== "http:" ||
      !["127.0.0.1", "localhost", "[::1]"].includes(local.hostname)
    )
      throw new Error("localUrl must be loopback HTTP");
    try {
      return await open(local.href, "loopback");
    } catch (e) {
      if (e.code === 401 || e.code === 403) throw e;
    }
  }
  if (config.sshTarget) {
    if (
      !/^[a-zA-Z0-9_.@-]+$/.test(config.sshTarget) ||
      config.sshTarget.startsWith("-")
    )
      throw new Error("Invalid SSH target");
    const probe = net.createServer();
    await new Promise((r) => probe.listen(0, "127.0.0.1", r));
    const port = probe.address().port;
    await new Promise((r) => probe.close(r));
    tunnel = spawn(
      "ssh",
      [
        "-N",
        "-o",
        "BatchMode=yes",
        "-o",
        "StrictHostKeyChecking=yes",
        "-o",
        "ConnectTimeout=2",
        "-o",
        "ConnectionAttempts=1",
        "-o",
        "ExitOnForwardFailure=yes",
        "-o",
        "ServerAliveInterval=15",
        "-o",
        "ServerAliveCountMax=2",
        "-L",
        `127.0.0.1:${port}:127.0.0.1:${config.remotePort ?? 4783}`,
        config.sshTarget,
      ],
      { stdio: "ignore" },
    );
    let failed = false;
    tunnel.on("error", () => {
      failed = true;
    });
    tunnel.on("exit", () => {
      failed = true;
    });
    const deadline = Date.now() + 3000;
    while (!failed && Date.now() < deadline) {
      const ready = await new Promise((resolve) => {
        const s = net.connect(port, "127.0.0.1");
        s.once("connect", () => {
          s.destroy();
          resolve(true);
        });
        s.once("error", () => resolve(false));
      });
      if (ready) {
        try {
          return await open(`http://127.0.0.1:${port}/mcp`, "lan-ssh");
        } catch (e) {
          tunnel.kill();
          if (e.code === 401 || e.code === 403) throw e;
          break;
        }
      }
      await delay(50);
    }
    tunnel.kill();
    tunnel = undefined;
  }
  return open(canonical.href, "public-https");
}

// Node fetch normalizes Host to the URL host. The local tunnel needs the
// canonical virtual host without relaxing the server's Host/Origin checks.
export function loopbackFetch(url, init = {}) {
  const target = new URL(url);
  if (
    target.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname)
  )
    throw new Error("Loopback transport only");
  return new Promise((resolve, reject) => {
    const req = http.request(
      target,
      {
        method: init.method,
        headers: Object.fromEntries(new Headers(init.headers)),
        signal: init.signal,
      },
      (res) => {
        const headers = new Headers();
        for (const [k, v] of Object.entries(res.headers))
          if (v !== undefined)
            headers.set(k, Array.isArray(v) ? v.join(", ") : v);
        resolve(
          new Response(
            [204, 205, 304].includes(res.statusCode)
              ? null
              : Readable.toWeb(res),
            { status: res.statusCode, headers },
          ),
        );
      },
    );
    req.on("error", reject);
    req.end(init.body);
  });
}
