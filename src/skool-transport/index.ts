import { chromium } from "playwright";

import { buildCookieHeader, type AuthSession } from "../auth/index.js";
import { AutoskoolError } from "../core/errors.js";

export type SkoolTransportSource = "http" | "browser-fallback";
export type TransportFailureKind = "auth-required" | "stale-build-id" | "challenge" | "page-shape" | "network";

export interface SkoolReadResult<T> {
  source: SkoolTransportSource;
  fetchedAt: string;
  value: T;
}

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  statusText: string;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<FetchResponseLike>;

export interface BrowserFallback {
  readPageProps(url: string): Promise<unknown>;
}

export interface SkoolTransport {
  resolveBuildId(community?: string): Promise<string>;
  readNextData(path: string, params?: Record<string, string>): Promise<SkoolReadResult<unknown>>;
  resolveVideoPlayback?(videoId: string): Promise<SkoolVideoPlayback>;
  postComment(input: PostCommentInput): Promise<PostCommentResult>;
}

export interface SkoolVideoPlayback {
  videoId: string;
  playbackId: string;
  playbackToken: string;
  thumbnailToken: string | null;
  storyboardToken: string | null;
  expiresAt: string | null;
  durationMs: number | null;
  aspectRatio: string | null;
}

export interface PostCommentInput {
  postId: string;
  groupId: string;
  content: string;
  parentId?: string | null;
}

export interface PostCommentResult {
  source: "api2";
  sentAt: string;
  response: unknown;
}

export class TransportError extends Error {
  readonly kind: TransportFailureKind;
  readonly status?: number;

  constructor(kind: TransportFailureKind, message: string, status?: number) {
    super(message);
    this.name = "TransportError";
    this.kind = kind;
    this.status = status;
  }
}

const BUILD_ID_PATTERN = /"buildId"\s*:\s*"([^"]+)"/;
const DEFAULT_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function classifyHttpFailure(status: number, body: string): TransportFailureKind {
  if (status === 401) {
    return "auth-required";
  }
  if (status === 404) {
    return "stale-build-id";
  }
  if (status === 202 || status === 403 || /challenge|captcha|cloudfront|waf/i.test(body)) {
    return "challenge";
  }
  return "network";
}

function normalizeBaseUrl(baseUrl = "https://www.skool.com"): string {
  return baseUrl.replace(/\/+$/, "");
}

function buildQuery(params: Record<string, string> = {}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value);
    }
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export function createBrowserFallback({
  browserProfile,
  browserChannel = "msedge",
}: {
  browserProfile: string;
  browserChannel?: string;
}): BrowserFallback {
  return {
    async readPageProps(url: string) {
      const context = await chromium.launchPersistentContext(browserProfile, {
        channel: browserChannel === "chromium" ? undefined : browserChannel,
        headless: true,
      });
      try {
        const page = context.pages()[0] || await context.newPage();
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await page.waitForSelector("#__NEXT_DATA__", { state: "attached", timeout: 30000 });
        return await page.evaluate(() => {
          const raw = document.querySelector("#__NEXT_DATA__")?.textContent || "";
          const parsed = JSON.parse(raw);
          return parsed?.props?.pageProps || parsed?.pageProps || null;
        });
      } finally {
        await context.close().catch(() => {});
      }
    },
  };
}

export function createSkoolTransport({
  authSession,
  baseUrl = "https://www.skool.com",
  fetchImpl = fetch as unknown as FetchLike,
  browserFallback = null,
}: {
  authSession: AuthSession;
  baseUrl?: string;
  fetchImpl?: FetchLike;
  browserFallback?: BrowserFallback | null;
}): SkoolTransport {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const cookieHeader = buildCookieHeader(authSession.cookies);
  let cachedBuildId: string | null = null;

  async function requestText(url: string): Promise<string> {
    const response = await fetchImpl(url, {
      headers: {
        Accept: "application/json,text/html;q=0.9,*/*;q=0.8",
        Cookie: cookieHeader,
        "User-Agent": DEFAULT_USER_AGENT,
      },
    });
    const text = await response.text();
    if (!response.ok) {
      const kind = classifyHttpFailure(response.status, text);
      if (kind === "auth-required") {
        throw new AutoskoolError("AUTH_REQUIRED", "Skool authentication is required or expired.");
      }
      throw new TransportError(kind, `Skool request failed with HTTP ${response.status}.`, response.status);
    }
    return text;
  }

  async function readJson(url: string): Promise<unknown> {
    const response = await fetchImpl(url, {
      headers: {
        Accept: "application/json",
        Cookie: cookieHeader,
        "User-Agent": DEFAULT_USER_AGENT,
      },
    });
    const text = await response.text();
    if (!response.ok) {
      const kind = classifyHttpFailure(response.status, text);
      if (kind === "auth-required") {
        throw new AutoskoolError("AUTH_REQUIRED", "Skool authentication is required or expired.");
      }
      throw new TransportError(kind, `Skool data request failed with HTTP ${response.status}.`, response.status);
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new TransportError("page-shape", "Skool response was not valid JSON.");
    }
  }

  async function writeJson(url: string, body: unknown): Promise<unknown> {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Cookie: cookieHeader,
        "User-Agent": DEFAULT_USER_AGENT,
      },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) {
      const kind = classifyHttpFailure(response.status, text);
      if (kind === "auth-required") {
        throw new AutoskoolError("AUTH_REQUIRED", "Skool authentication is required or expired.");
      }
      throw new TransportError(kind, `Skool write request failed with HTTP ${response.status}.`, response.status);
    }
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      return { text };
    }
  }

  return {
    async resolveBuildId(community = authSession.defaultCommunity) {
      if (cachedBuildId) {
        return cachedBuildId;
      }
      const sourceUrl = community ? `${normalizedBaseUrl}/${community}` : normalizedBaseUrl;
      const html = await requestText(sourceUrl);
      const match = html.match(BUILD_ID_PATTERN);
      if (!match?.[1]) {
        throw new TransportError("page-shape", "Could not extract Skool buildId from page HTML.");
      }
      cachedBuildId = match[1];
      return cachedBuildId;
    },

    async readNextData(path: string, params: Record<string, string> = {}) {
      const community = params.group || authSession.defaultCommunity;
      try {
        const buildId = await this.resolveBuildId(community);
        const dataPath = path.startsWith("/") ? path : `/${path}`;
        const url = `${normalizedBaseUrl}/_next/data/${buildId}${dataPath}.json${buildQuery(params)}`;
        const value = await readJson(url);
        return {
          source: "http",
          fetchedAt: new Date().toISOString(),
          value,
        };
      } catch (error) {
        if (!(error instanceof TransportError) || !browserFallback) {
          throw error;
        }
        if (!["stale-build-id", "challenge", "page-shape"].includes(error.kind)) {
          throw error;
        }
        const pagePath = path.startsWith("/") ? path : `/${path}`;
        const fallbackUrl = `${normalizedBaseUrl}${pagePath}${buildQuery(params)}`;
        const value = await browserFallback.readPageProps(fallbackUrl);
        return {
          source: "browser-fallback",
          fetchedAt: new Date().toISOString(),
          value,
        };
      }
    },

    async postComment(input: PostCommentInput) {
      const response = await writeJson(`https://api2.skool.com/posts/${input.postId}/comments`, {
        groupId: input.groupId,
        content: input.content,
        parentId: input.parentId || undefined,
      });
      return {
        source: "api2",
        sentAt: new Date().toISOString(),
        response,
      };
    },

    async resolveVideoPlayback(videoId: string) {
      const response = await writeJson(`https://api2.skool.com/videos/${videoId}/request-data`, {});
      const data = response as Record<string, unknown>;
      const expire = Number(data.expire);
      return {
        videoId,
        playbackId: String(data.playback_id || ""),
        playbackToken: String(data.playback_token || ""),
        thumbnailToken: data.thumbnail_token ? String(data.thumbnail_token) : null,
        storyboardToken: data.storyboard_token ? String(data.storyboard_token) : null,
        expiresAt: Number.isFinite(expire) ? new Date(expire * 1000).toISOString() : null,
        durationMs: Number.isFinite(Number(data.duration)) ? Number(data.duration) : null,
        aspectRatio: data.aspect_ratio ? String(data.aspect_ratio) : null,
      };
    },
  };
}
