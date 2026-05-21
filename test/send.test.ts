import assert from "node:assert/strict";
import Database from "better-sqlite3";
import test from "node:test";

import { createQueueStore, initializeQueueDatabase } from "../src/queue/index.js";
import { sendQueueItem } from "../src/queue/send.js";
import type { SkoolTransport } from "../src/skool-transport/index.js";

function fakeTransport(): SkoolTransport {
  return {
    async resolveBuildId() {
      return "build";
    },
    async readNextData() {
      return { source: "http", fetchedAt: new Date().toISOString(), value: {} };
    },
    async postComment(input) {
      return {
        source: "api2",
        sentAt: "2026-05-19T00:00:00.000Z",
        response: { id: `sent-${input.postId}` },
      };
    },
  };
}

test("send requires approval and final confirmation", async () => {
  const db = new Database(":memory:");
  initializeQueueDatabase(db);
  const store = createQueueStore(db);
  const item = store.add({
    type: "post_comment",
    title: "Draft",
    draft: "Draft",
    evidence: { postId: "post-1", groupId: "group-1" },
  });

  await assert.rejects(() => sendQueueItem({ id: item.id, confirm: false, store, transport: fakeTransport() }), /Final send confirmation/);
  store.approve(item.id);
  await assert.rejects(() => sendQueueItem({ id: item.id, confirm: false, store, transport: fakeTransport() }), /Final send confirmation/);
  const sent = await sendQueueItem({ id: item.id, confirm: true, store, transport: fakeTransport() });
  assert.equal(sent.status, "sent");
  store.close();
});

test("safety pause blocks sending", async () => {
  const db = new Database(":memory:");
  initializeQueueDatabase(db);
  const store = createQueueStore(db);
  const item = store.add({
    type: "post_comment",
    title: "Draft",
    draft: "Draft",
    evidence: { postId: "post-1", groupId: "group-1" },
  });
  store.approve(item.id);
  store.createSafetyPause("challenge", "Skool challenge detected.");
  await assert.rejects(() => sendQueueItem({ id: item.id, confirm: true, store, transport: fakeTransport() }), /Safety pause active/);
  store.close();
});
