import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

async function runCli(args: string[], env: NodeJS.ProcessEnv = {}) {
  return execFileAsync(process.execPath, ["--import", "tsx", "src/cli/index.ts", ...args], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
  });
}

test("doctor passes on Node 20+", async () => {
  const { stdout } = await runCli(["doctor"]);
  assert.match(stdout, /ok node:/);
  assert.match(stdout, /ok state_root:/);
});

test("agent-context --json emits valid JSON", async () => {
  const { stdout } = await runCli(["--json", "agent-context"]);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.name, "autoskool-cli");
  assert.equal(parsed.safety.outboundActionsRequireApproval, true);
});

test("unknown commands return usage error", async () => {
  await assert.rejects(
    runCli(["nope"]),
    (error: unknown) => {
      const candidate = error as { code?: number; stderr?: string };
      assert.equal(candidate.code, 2);
      assert.match(candidate.stderr || "", /unknown command/i);
      return true;
    },
  );
});

test("queue add-demo, list, and approve work against isolated state", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "autoskool-cli-test-"));
  const env = { AUTOSKOOL_HOME: home };

  const added = await runCli(["--json", "queue", "add-demo"], env);
  const item = JSON.parse(added.stdout);
  assert.equal(item.status, "needs-action");
  assert.equal(item.type, "post_comment");

  const needsAction = await runCli(["--json", "queue", "list"], env);
  const items = JSON.parse(needsAction.stdout);
  assert.equal(items.length, 1);
  assert.equal(items[0].id, item.id);

  const approved = await runCli(["--json", "queue", "approve", item.id], env);
  const approvedItem = JSON.parse(approved.stdout);
  assert.equal(approvedItem.status, "approved");

  const remainingNeedsAction = await runCli(["--json", "queue", "list"], env);
  assert.equal(JSON.parse(remainingNeedsAction.stdout).length, 0);

  const approvedList = await runCli(["--json", "queue", "list", "--status", "approved"], env);
  assert.equal(JSON.parse(approvedList.stdout).length, 1);
});

test("short queue aliases work against isolated state", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "autoskool-cli-alias-test-"));
  const env = { AUTOSKOOL_HOME: home };

  const added = await runCli(["--json", "q", "demo"], env);
  const item = JSON.parse(added.stdout);
  assert.equal(item.status, "needs-action");

  const needsAction = await runCli(["--json", "q", "ls"], env);
  assert.equal(JSON.parse(needsAction.stdout).length, 1);

  const approved = await runCli(["--json", "q", "ok", item.id], env);
  assert.equal(JSON.parse(approved.stdout).status, "approved");

  const approvedList = await runCli(["--json", "q", "ls", "--status", "approved"], env);
  assert.equal(JSON.parse(approvedList.stdout).length, 1);
});

test("human shortcut commands are registered", async () => {
  let stdout = "";
  try {
    const result = await runCli(["--help"]);
    stdout = result.stdout;
  } catch (error) {
    stdout = (error as { stdout?: string }).stdout || "";
  }
  assert.match(stdout, /login \[options\]\s+Shortcut for auth login/);
  assert.match(stdout, /communities\|groups\s+Shortcut for community list/);
  assert.match(stdout, /feed \[options\] <community>\s+Shortcut for community feed/);
});

test("auth status exits with auth-required when no local session exists", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "autoskool-cli-auth-missing-"));
  await assert.rejects(
    runCli(["--json", "auth", "status"], { AUTOSKOOL_HOME: home }),
    (error: unknown) => {
      const candidate = error as { code?: number; stdout?: string; stderr?: string };
      assert.equal(candidate.code, 3);
      const status = JSON.parse(candidate.stdout || "{}");
      assert.equal(status.authenticated, false);
      assert.match(candidate.stderr || "", /authentication is required/i);
      return true;
    },
  );
});

test("community feed requires auth before any Skool request", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "autoskool-cli-community-missing-"));
  await assert.rejects(
    runCli(["--json", "community", "feed", "--community", "demo"], { AUTOSKOOL_HOME: home }),
    (error: unknown) => {
      const candidate = error as { code?: number; stderr?: string };
      assert.equal(candidate.code, 3);
      assert.match(candidate.stderr || "", /authentication is required/i);
      return true;
    },
  );
});

test("community list requires auth before opening browser fallback", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "autoskool-cli-community-list-missing-"));
  await assert.rejects(
    runCli(["--json", "community", "list"], { AUTOSKOOL_HOME: home }),
    (error: unknown) => {
      const candidate = error as { code?: number; stderr?: string };
      assert.equal(candidate.code, 3);
      assert.match(candidate.stderr || "", /authentication is required/i);
      return true;
    },
  );
});
