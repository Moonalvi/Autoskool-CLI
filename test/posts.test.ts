import assert from "node:assert/strict";
import Database from "better-sqlite3";
import test from "node:test";

import { draftComment, queuePostDraft, scorePostOpportunities } from "../src/posts/index.js";
import { createQueueStore, initializeQueueDatabase } from "../src/queue/index.js";

test("post scoring prioritizes zero-comment help posts", () => {
  const opportunities = scorePostOpportunities([
    {
      id: "post-1",
      title: "How do I fix this workflow?",
      authorName: "Demo Member",
      body: "I am stuck with an automation handoff and need advice on what to check next.",
      commentCount: 0,
      likeCount: 1,
      sectionId: "support",
      sectionName: "Support Needed",
      attachmentIds: [],
      attachments: [],
      createdAt: "2026-05-19T00:00:00.000Z",
      url: "https://www.skool.com/demo/post-1",
    },
    {
      id: "post-2",
      title: "Quick win",
      authorName: "Member",
      body: "Done.",
      commentCount: 4,
      likeCount: 2,
      sectionId: "general",
      sectionName: "General Discussion",
      attachmentIds: [],
      attachments: [],
      createdAt: "2026-05-19T00:00:00.000Z",
      url: "https://www.skool.com/demo/post-2",
    },
  ]);

  assert.equal(opportunities[0].postId, "post-1");
  assert.ok(opportunities[0].score > opportunities[1].score);
});

test("post draft queue item includes source evidence", () => {
  const db = new Database(":memory:");
  initializeQueueDatabase(db);
  const store = createQueueStore(db);
  const opportunity = scorePostOpportunities([
    {
      id: "post-1",
      title: "How do I fix this workflow?",
      authorName: "Demo Member",
      body: "Need help with the exact bottleneck.",
      commentCount: 0,
      likeCount: 0,
      sectionId: "support",
      sectionName: "Support Needed",
      attachmentIds: [],
      attachments: [],
      createdAt: null,
      url: "https://www.skool.com/demo/post-1",
    },
  ])[0];

  const item = queuePostDraft(store, {
    ...opportunity,
    evidence: { ...opportunity.evidence, groupId: "group-1" },
  }, draftComment(opportunity));

  assert.equal(item.type, "post_comment");
  assert.equal(item.evidence.postId, "post-1");
  assert.equal(item.evidence.groupId, "group-1");
  store.close();
});
