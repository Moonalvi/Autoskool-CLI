import assert from "node:assert/strict";
import test from "node:test";

import { createSkoolTransport, TransportError, type FetchLike } from "../src/skool-transport/index.js";
import type { AuthSession } from "../src/auth/index.js";

function response(status: number, body: string) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    async text() {
      return body;
    },
    async json() {
      return JSON.parse(body);
    },
  };
}

const authSession: AuthSession = {
  source: "dedicated-browser",
  savedAt: "2026-05-19T00:00:00.000Z",
  defaultCommunity: "demo",
  cookies: [{ name: "auth_token", value: "fake", domain: ".skool.com" }],
};

test("transport resolves buildId and reads Next.js data over HTTP", async () => {
  const calls: string[] = [];
  const fetchImpl: FetchLike = async (url) => {
    calls.push(url);
    if (url === "https://www.skool.com/demo") {
      return response(200, `{"buildId":"build-123"}`);
    }
    return response(200, JSON.stringify({ pageProps: { postTrees: [] } }));
  };

  const transport = createSkoolTransport({ authSession, fetchImpl });
  const result = await transport.readNextData("/demo", { group: "demo" });

  assert.equal(result.source, "http");
  assert.equal(calls[1], "https://www.skool.com/_next/data/build-123/demo.json?group=demo");
});

test("transport uses browser fallback for challenge-like read failures", async () => {
  const fetchImpl: FetchLike = async (url) => {
    if (url === "https://www.skool.com/demo") {
      return response(200, `{"buildId":"build-123"}`);
    }
    return response(403, "challenge");
  };

  const transport = createSkoolTransport({
    authSession,
    fetchImpl,
    browserFallback: {
      async readPageProps(url) {
        assert.equal(url, "https://www.skool.com/demo?group=demo");
        return { postTrees: [] };
      },
    },
  });

  const result = await transport.readNextData("/demo", { group: "demo" });
  assert.equal(result.source, "browser-fallback");
});

test("transport returns structured challenge errors without fallback", async () => {
  const fetchImpl: FetchLike = async (url) => {
    if (url === "https://www.skool.com/demo") {
      return response(200, `{"buildId":"build-123"}`);
    }
    return response(403, "challenge");
  };

  const transport = createSkoolTransport({ authSession, fetchImpl });
  await assert.rejects(
    transport.readNextData("/demo", { group: "demo" }),
    (error: unknown) => {
      assert.ok(error instanceof TransportError);
      assert.equal(error.kind, "challenge");
      return true;
    },
  );
});
