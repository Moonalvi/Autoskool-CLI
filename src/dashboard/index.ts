import http from "node:http";

import type { QueueStore } from "../queue/index.js";

export interface DashboardStatus {
  ready: boolean;
  port: number;
}

function sendJson(response: http.ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body, null, 2));
}

function sendHtml(response: http.ServerResponse): void {
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
  });
  response.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Autoskool CLI Dashboard</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 2rem; background: #f7f7f4; color: #181817; }
      main { max-width: 900px; margin: 0 auto; }
      code { background: #ecebe6; padding: .2rem .35rem; border-radius: 4px; }
    </style>
  </head>
  <body>
    <main>
      <h1>Autoskool CLI Dashboard</h1>
      <p>Local operator console. Queue and safety APIs are available at <code>/api/queue</code> and <code>/api/safety</code>.</p>
    </main>
  </body>
</html>`);
}

export function createDashboardServer({
  queueStore,
}: {
  queueStore: QueueStore;
}): http.Server {
  return http.createServer((request, response) => {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    if (request.method === "GET" && url.pathname === "/") {
      sendHtml(response);
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/queue") {
      sendJson(response, 200, { items: queueStore.list(url.searchParams.get("status") as never || "needs-action") });
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/safety") {
      const pause = queueStore.getActiveSafetyPause();
      sendJson(response, 200, { paused: Boolean(pause), pause });
      return;
    }
    sendJson(response, 404, { error: "not_found" });
  });
}

export async function startDashboard({
  queueStore,
  port = 4320,
}: {
  queueStore: QueueStore;
  port?: number;
}): Promise<{ server: http.Server; status: DashboardStatus }> {
  const server = createDashboardServer({ queueStore });
  await new Promise<void>((resolve) => {
    server.listen(port, "127.0.0.1", resolve);
  });
  const address = server.address();
  const resolvedPort = typeof address === "object" && address ? address.port : port;
  return {
    server,
    status: {
      ready: true,
      port: resolvedPort,
    },
  };
}
