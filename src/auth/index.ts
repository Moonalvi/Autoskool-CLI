import fs from "node:fs/promises";

import { chromium, type BrowserContext, type Cookie } from "playwright";

import type { AppConfig } from "../core/config.js";
import { AutoskoolError } from "../core/errors.js";
import { ensureStatePaths, getStatePaths } from "../core/paths.js";

export interface SkoolCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}

export interface AuthSession {
  source: "dedicated-browser";
  savedAt: string;
  defaultCommunity: string;
  cookies: SkoolCookie[];
}

export interface AuthStatus {
  authenticated: boolean;
  source: "dedicated-browser" | "missing";
  savedAt: string | null;
  defaultCommunity: string;
  cookieCount: number;
  authTokenMasked: string | null;
  authFile: string;
  browserProfile: string;
}

const RESERVED_SKOOOL_PATHS = new Set([
  "",
  "login",
  "signup",
  "sign-up",
  "privacy",
  "terms",
  "home",
]);

function isSkoolCookie(cookie: SkoolCookie): boolean {
  return String(cookie.domain ?? "").includes("skool.com") || cookie.name === "auth_token";
}

export function maskSecret(value: string): string {
  if (!value) {
    return "";
  }
  if (value.length <= 4) {
    return "****";
  }
  return `****${value.slice(-4)}`;
}

export function validateAuthCookies(cookies: SkoolCookie[]): SkoolCookie {
  const authCookie = cookies.find((cookie) => cookie.name === "auth_token" && cookie.value);
  if (!authCookie) {
    throw new AutoskoolError("AUTH_REQUIRED", "Skool auth_token cookie was not found. Run `autoskool auth login`.");
  }
  return authCookie;
}

export function buildCookieHeader(cookies: SkoolCookie[]): string {
  return cookies
    .filter((cookie) => isSkoolCookie(cookie) && cookie.name && cookie.value)
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

export function extractCommunitySlug(value: string): string | null {
  try {
    const url = new URL(value);
    if (!["skool.com", "www.skool.com"].includes(url.hostname)) {
      return null;
    }
    const slug = url.pathname.split("/").filter(Boolean)[0]?.trim() || "";
    if (!slug || RESERVED_SKOOOL_PATHS.has(slug.toLowerCase())) {
      return null;
    }
    return slug;
  } catch {
    return null;
  }
}

export async function saveAuthSession(config: AppConfig, session: AuthSession): Promise<void> {
  const paths = getStatePaths(config);
  ensureStatePaths(paths);
  await fs.writeFile(paths.authFile, `${JSON.stringify(session, null, 2)}\n`, { mode: 0o600 });
}

export async function readAuthSession(config: AppConfig): Promise<AuthSession | null> {
  const paths = getStatePaths(config);
  try {
    const raw = await fs.readFile(paths.authFile, "utf8");
    const parsed = JSON.parse(raw) as AuthSession;
    validateAuthCookies(parsed.cookies || []);
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return null;
    }
    if (error instanceof AutoskoolError) {
      return null;
    }
    throw error;
  }
}

export async function getAuthStatus(config: AppConfig): Promise<AuthStatus> {
  const paths = getStatePaths(config);
  const session = await readAuthSession(config);
  if (!session) {
    return {
      authenticated: false,
      source: "missing",
      savedAt: null,
      defaultCommunity: "",
      cookieCount: 0,
      authTokenMasked: null,
      authFile: paths.authFile,
      browserProfile: paths.browserProfile,
    };
  }
  const authCookie = validateAuthCookies(session.cookies);
  return {
    authenticated: true,
    source: session.source,
    savedAt: session.savedAt,
    defaultCommunity: session.defaultCommunity,
    cookieCount: session.cookies.filter(isSkoolCookie).length,
    authTokenMasked: maskSecret(authCookie.value),
    authFile: paths.authFile,
    browserProfile: paths.browserProfile,
  };
}

export async function logout(config: AppConfig): Promise<void> {
  const paths = getStatePaths(config);
  await fs.rm(paths.authFile, { force: true });
}

async function waitForAuthCookies(context: BrowserContext, timeoutMs: number): Promise<SkoolCookie[]> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const cookies = await context.cookies("https://www.skool.com");
    const skoolCookies = cookies
      .filter((cookie) => String(cookie.domain ?? "").includes("skool.com"))
      .map((cookie: Cookie) => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        expires: cookie.expires,
        httpOnly: cookie.httpOnly,
        secure: cookie.secure,
        sameSite: cookie.sameSite,
      }));
    try {
      validateAuthCookies(skoolCookies);
      return skoolCookies;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  throw new AutoskoolError("AUTH_REQUIRED", "Timed out waiting for Skool login cookies.");
}

export async function loginWithDedicatedBrowser(config: AppConfig, {
  timeoutMinutes = 10,
  community = "",
}: {
  timeoutMinutes?: number;
  community?: string;
} = {}): Promise<AuthSession> {
  const paths = getStatePaths(config);
  ensureStatePaths(paths);
  const context = await chromium.launchPersistentContext(paths.browserProfile, {
    channel: config.browserChannel === "chromium" ? undefined : config.browserChannel,
    headless: false,
  });

  try {
    const page = context.pages()[0] || await context.newPage();
    await page.goto("https://www.skool.com/login", { waitUntil: "domcontentloaded" });
    const cookies = await waitForAuthCookies(context, timeoutMinutes * 60 * 1000);
    const defaultCommunity = community || extractCommunitySlug(page.url()) || config.defaultCommunity || "";
    const session: AuthSession = {
      source: "dedicated-browser",
      savedAt: new Date().toISOString(),
      defaultCommunity,
      cookies,
    };
    await saveAuthSession(config, session);
    return session;
  } finally {
    await context.close().catch(() => {});
  }
}
