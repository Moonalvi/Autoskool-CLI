import assert from "node:assert/strict";
import Database from "better-sqlite3";
import test from "node:test";

import { classifyReplySignal, queueReplyDraft } from "../src/replies/index.js";
import { createQueueStore, initializeQueueDatabase } from "../src/queue/index.js";

test("low-signal replies are ignored", () => {
  const signal = classifyReplySignal({
    replyId: "reply-1",
    postId: "post-1",
    postTitle: "Post",
    replyAuthorName: "Member",
    replyText: "nice",
  });
  assert.equal(signal.needsAttention, false);
  assert.equal(signal.reason, "low_signal_ack");
});

test("meaningful replies can be queued with duplicate-safe evidence", () => {
  const db = new Database(":memory:");
  initializeQueueDatabase(db);
  const store = createQueueStore(db);
  const signal = classifyReplySignal({
    replyId: "reply-1",
    postId: "post-1",
    postTitle: "Post",
    replyAuthorName: "Member",
    replyText: "Can you explain how this works?",
  });
  const item = queueReplyDraft(store, signal, undefined, { groupId: "group-1" });
  assert.ok(item);
  assert.equal(item?.type, "reply_follow_up");
  assert.equal(item?.evidence.replyId, "reply-1");
  assert.equal(item?.evidence.groupId, "group-1");
  store.close();
});
