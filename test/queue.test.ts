import assert from "node:assert/strict";
import Database from "better-sqlite3";
import test from "node:test";

import { createQueueStore, initializeQueueDatabase } from "../src/queue/index.js";

test("queue database initializes and records audit events", () => {
  const db = new Database(":memory:");
  initializeQueueDatabase(db);
  const store = createQueueStore(db);

  const item = store.addDemo(new Date("2026-05-19T00:00:00.000Z"));
  assert.equal(item.status, "needs-action");
  assert.equal(store.list("needs-action").length, 1);

  const approved = store.approve(item.id, new Date("2026-05-19T00:01:00.000Z"));
  assert.equal(approved.status, "approved");
  assert.equal(store.list("needs-action").length, 0);
  assert.equal(store.list("approved").length, 1);

  const events = store.auditEvents(item.id);
  assert.deepEqual(events.map((event) => event.action), [
    "queue.item_added",
    "queue.demo_added",
    "queue.approved",
  ]);

  store.close();
});

test("ignored items disappear from the needs-action view", () => {
  const db = new Database(":memory:");
  initializeQueueDatabase(db);
  const store = createQueueStore(db);

  const item = store.addDemo();
  const ignored = store.ignore(item.id);
  assert.equal(ignored.status, "ignored");
  assert.equal(store.list("needs-action").length, 0);
  assert.equal(store.list("ignored").length, 1);

  store.close();
});
