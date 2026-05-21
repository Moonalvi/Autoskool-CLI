import assert from "node:assert/strict";
import Database from "better-sqlite3";
import test from "node:test";

import { startDashboard } from "../src/dashboard/index.js";
import { createQueueStore, initializeQueueDatabase } from "../src/queue/index.js";

test("dashboard exposes queue and safety APIs without secrets", async () => {
  const db = new Database(":memory:");
  initializeQueueDatabase(db);
  const store = createQueueStore(db);
  store.addDemo();
  const { server, status } = await startDashboard({ queueStore: store, port: 0 });
  try {
    const queueResponse = await fetch(`http://127.0.0.1:${status.port}/api/queue`);
    const queueBody = await queueResponse.json() as { items: unknown[] };
    assert.equal(queueBody.items.length, 1);

    const safetyResponse = await fetch(`http://127.0.0.1:${status.port}/api/safety`);
    const safetyBody = await safetyResponse.json() as { paused: boolean };
    assert.equal(safetyBody.paused, false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
  }
});
