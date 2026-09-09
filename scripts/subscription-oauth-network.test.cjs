"use strict";

// node --test scripts/subscription-oauth-network.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const http = require("node:http");

test("subscription requests use Electron networking and preserve streaming", async (t) => {
  // The distributable must load without Electron installed in the test process.
  const plugin = require("../plugins/subscription-oauth/index.cjs");
  assert.equal(typeof plugin.register, "function");
  const oauth = require("../plugins/subscription-oauth/lib/oauth.cjs");
  const { fetchCatalog } = require("../plugins/subscription-oauth/lib/catalog.cjs");
  const { fetchUsage } = require("../plugins/subscription-oauth/lib/usage.cjs");
  const { createProxy } = require("../plugins/subscription-oauth/lib/proxy.cjs");
  const calls = [];
  let reply = () => new Response("{}");
  const net = {
    async fetch(url, init) {
      assert.equal(this, net);
      calls.push({ url, init });
      return reply(url, init);
    },
  };
  const originalLoad = Module._load;
  t.mock.method(Module, "_load", function (id, ...args) {
    if (id === "electron") return { net };
    return originalLoad.call(this, id, ...args);
  });
  t.mock.method(globalThis, "fetch", () => {
    throw new Error("Unexpected Node fetch: would bypass system proxy settings");
  });
  const tokens = { accessToken: "test-access-token" };

  await t.test("token refresh for all providers uses net.fetch", async () => {
    reply = () => Response.json({ access_token: "new-token", refresh_token: "new-refresh" });
    for (const provider of ["chatgpt", "claude", "grok"]) {
      const result = await oauth.refresh(provider, "test-refresh-token", () => {});
      assert.equal(result.accessToken, "new-token");
      const { url, init } = calls.at(-1);
      assert.equal(url, oauth.OAUTH_SPECS[provider].tokenUrl);
      assert.equal(init.method, "POST");
      assert.match(init.body, /test-refresh-token/);
    }
  });

  await t.test("catalog and usage requests retain authentication and cancellation", async () => {
    reply = () => Response.json({
      models: [{ slug: "gpt-5", visibility: "list" }],
      data: [{ id: "test-model" }],
      five_hour: { utilization: 0 },
    });
    for (const provider of ["chatgpt", "claude", "grok"]) {
      for (const operation of [fetchCatalog, fetchUsage]) {
        const first = calls.length;
        const result = await operation(provider, tokens);
        assert.equal(result.ok, true, result.error);
        assert.ok(calls.length > first);
        for (const { init } of calls.slice(first)) {
          assert.equal(init.method, "GET");
          assert.equal(init.headers.authorization, "Bearer test-access-token");
          assert.ok(init.signal instanceof AbortSignal);
        }
      }
    }
  });

  await t.test("chat forwards the first SSE chunk before upstream finishes", async () => {
    let controller;
    const firstChunk = 'data: {"delta":"hello"}\n\n';
    const lastChunk = "data: [DONE]\n\n";
    reply = () => new Response(new ReadableStream({
      start(value) {
        controller = value;
        controller.enqueue(new TextEncoder().encode(firstChunk));
      },
    }));
    const proxy = createProxy({ getTokens: async () => ({ tokens }) });
    await proxy.start(0);
    try {
      const result = await new Promise((resolve, reject) => {
        const req = http.request({
          host: "127.0.0.1", port: proxy.port(), path: "/v1/responses", method: "POST",
          headers: { "Content-Type": "application/json" },
        }, (res) => {
          let body = "";
          res.setEncoding("utf8");
          res.once("data", () => {
            controller.enqueue(new TextEncoder().encode(lastChunk));
            controller.close();
          });
          res.on("data", (chunk) => { body += chunk; });
          res.on("end", () => resolve({ status: res.statusCode, body }));
          res.on("error", reject);
        });
        req.setTimeout(3000, () => req.destroy(new Error("SSE did not stream")));
        req.on("error", reject);
        req.end(JSON.stringify({ model: "gpt-5", input: [], stream: true }));
      });
      assert.equal(result.status, 200);
      assert.equal(result.body, firstChunk + lastChunk);
      const { url, init } = calls.at(-1);
      assert.equal(url, "https://chatgpt.com/backend-api/codex/responses");
      assert.equal(init.headers.authorization, "Bearer test-access-token");
      assert.ok(init.signal instanceof AbortSignal);
      assert.equal(JSON.parse(init.body).store, false);
    } finally {
      await proxy.stop();
    }
  });
});
