import assert from "node:assert/strict";
import Database from "better-sqlite3";
import test from "node:test";

import { getMcpStatus, handleMcpTool, listMcpTools } from "../src/mcp/index.js";
import { createQueueStore, initializeQueueDatabase } from "../src/queue/index.js";

test("MCP tool list exposes safe tools only", () => {
  const tools = listMcpTools();
  assert.ok(tools.length >= 3);
  assert.equal(tools.every((tool) => tool.safe), true);
  assert.equal(getMcpStatus().ready, true);
});

test("MCP queue tool uses local queue store", async () => {
  const db = new Database(":memory:");
  initializeQueueDatabase(db);
  const store = createQueueStore(db);
  store.addDemo();
  const result = await handleMcpTool("autoskool_queue_list", { queueStore: store });
  assert.equal((result as unknown[]).length, 1);
  store.close();
});
