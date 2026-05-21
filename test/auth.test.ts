import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadConfig } from "../src/core/config.js";
import {
  buildCookieHeader,
  getAuthStatus,
  logout,
  maskSecret,
  saveAuthSession,
  validateAuthCookies,
} from "../src/auth/index.js";

function testConfig(homeDir: string) {
  return loadConfig({
    AUTOSKOOL_HOME: homeDir,
    AUTOSKOOL_REQUIRE_APPROVAL: "true",
  } as NodeJS.ProcessEnv);
}

test("auth cookie validation and masking never exposes the full token", () => {
  const token = "secret-auth-token-123456";
  const cookie = validateAuthCookies([
    { name: "auth_token", value: token, domain: ".skool.com" },
  ]);
  assert.equal(cookie.value, token);
  assert.equal(maskSecret(token), "****3456");
  assert.ok(!maskSecret(token).includes("secret-auth-token"));
});

test("cookie header includes Skool cookies", () => {
  const header = buildCookieHeader([
    { name: "auth_token", value: "abc", domain: ".skool.com" },
    { name: "other", value: "def", domain: ".example.com" },
  ]);
  assert.equal(header, "auth_token=abc");
});

test("auth status reads and clears local session without leaking full token", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "autoskool-cli-auth-"));
  const config = testConfig(home);

  await saveAuthSession(config, {
    source: "dedicated-browser",
    savedAt: "2026-05-19T00:00:00.000Z",
    defaultCommunity: "demo-community",
    cookies: [
      { name: "auth_token", value: "very-secret-token-value", domain: ".skool.com" },
      { name: "skool_session", value: "session", domain: ".skool.com" },
    ],
  });

  const status = await getAuthStatus(config);
  assert.equal(status.authenticated, true);
  assert.equal(status.cookieCount, 2);
  assert.equal(status.authTokenMasked, "****alue");
  assert.notEqual(status.authTokenMasked, "very-secret-token-value");

  await logout(config);
  const afterLogout = await getAuthStatus(config);
  assert.equal(afterLogout.authenticated, false);
});
