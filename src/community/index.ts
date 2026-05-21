import type { BrowserFallback, SkoolReadResult, SkoolTransport } from "../skool-transport/index.js";

export interface CommunityFeedItem {
  id: string;
  title: string;
  authorName: string;
  body: string;
  commentCount: number;
  likeCount: number;
  sectionId: string | null;
  sectionName: string | null;
  attachmentIds: string[];
  attachments: PostAttachment[];
  createdAt: string | null;
  url: string | null;
}

export type PostAttachmentType = "image" | "video" | "document" | "file" | "link";

export interface PostAttachment {
  type: PostAttachmentType;
  source: "feed-preview" | "post-detail";
  id: string | null;
  url: string | null;
  thumbnailUrl: string | null;
  fileName: string | null;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  videoId: string | null;
  provider: string | null;
  playbackId: string | null;
  streamUrl: string | null;
  streamHeaders: Record<string, string> | null;
  expiresAt: string | null;
  durationMs: number | null;
  aspectRatio: string | null;
}

export interface CommunityFeed {
  community: string;
  source: "http" | "browser-fallback";
  fetchedAt: string;
  items: CommunityFeedItem[];
}

export interface CommunityInfo {
  community: string;
  source: "http" | "browser-fallback";
  fetchedAt: string;
  name: string;
  memberCount: number | null;
  ownerId: string | null;
  ownerUsername: string | null;
  ownerName: string | null;
  ownerProfileUrl: string | null;
}

export interface JoinedCommunity {
  id: string;
  slug: string;
  name: string;
  description: string;
  groupId: string | null;
  ownerId: string | null;
  ownerUsername: string | null;
  ownerName: string | null;
  ownerProfileUrl: string | null;
  href: string;
  pinned: boolean;
}

export interface JoinedCommunityList {
  source: "browser-fallback";
  fetchedAt: string;
  communities: JoinedCommunity[];
}

function normalizeText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function getPageProps(result: SkoolReadResult<unknown>): Record<string, unknown> {
  const value = result.value as Record<string, unknown>;
  return (value?.pageProps || value) as Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function normalizeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeNullableNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function splitIds(value: unknown): string[] {
  return normalizeText(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  const raw = normalizeText(value);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  const raw = normalizeText(value);
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function normalizeOwner(metadata: Record<string, unknown>): {
  ownerId: string | null;
  ownerUsername: string | null;
  ownerName: string | null;
  ownerProfileUrl: string | null;
} {
  const owner = parseJsonRecord(metadata.owner);
  const ownerId = normalizeText(owner.id || metadata.createdBy) || null;
  const ownerUsername = normalizeText(owner.name || owner.username) || null;
  const firstName = normalizeText(owner.first_name || owner.firstName);
  const lastName = normalizeText(owner.last_name || owner.lastName);
  const ownerName = normalizeText([firstName, lastName].filter(Boolean).join(" ") || owner.displayName || ownerUsername) || null;
  return {
    ownerId,
    ownerUsername,
    ownerName,
    ownerProfileUrl: ownerUsername ? `https://www.skool.com/@${ownerUsername}` : null,
  };
}

function detectAttachmentType(mimeType: string, url: string): PostAttachmentType {
  const normalizedMime = mimeType.toLowerCase();
  const normalizedUrl = url.toLowerCase();
  if (normalizedMime.includes("image") || /\.(png|jpe?g|webp|gif|avif|svg|heic|heif)(?:$|\?)/i.test(normalizedUrl)) {
    return "image";
  }
  if (normalizedMime.includes("video") || /\.(mp4|mov|webm|m4v|m3u8)(?:$|\?)/i.test(normalizedUrl)) {
    return "video";
  }
  if (normalizedMime.includes("pdf") || /\.(pdf)(?:$|\?)/i.test(normalizedUrl)) {
    return "document";
  }
  return "file";
}

function dedupeAttachments(attachments: PostAttachment[]): PostAttachment[] {
  const seen = new Set<string>();
  const deduped: PostAttachment[] = [];
  for (const attachment of attachments) {
    const key = [
      attachment.type,
      attachment.id || "",
      attachment.url || "",
      attachment.thumbnailUrl || "",
      attachment.videoId || "",
    ].join("|");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(attachment);
  }
  return deduped;
}

function normalizeAttachmentData(value: unknown): PostAttachment | null {
  const entry = asRecord(value);
  const metadata = asRecord(entry.metadata);
  const id = normalizeText(entry.id) || null;
  const url = normalizeText(metadata.read_url || metadata.src_read_url || metadata.image_md_url || metadata.image_sm_url) || null;
  const thumbnailUrl = normalizeText(metadata.image_md_url || metadata.image_sm_url || metadata.thumbnail_url || metadata.thumbnailUrl) || null;
  const mimeType = normalizeText(metadata.content_type || metadata.src_content_type) || null;
  if (!url && !thumbnailUrl) {
    return null;
  }

  return {
    type: detectAttachmentType(mimeType || "", url || thumbnailUrl || ""),
    source: "post-detail",
    id,
    url,
    thumbnailUrl,
    fileName: normalizeText(metadata.file_name || metadata.name) || null,
    mimeType,
    width: normalizeNullableNumber(metadata.src_width || metadata.image_md_width || metadata.image_sm_width),
    height: normalizeNullableNumber(metadata.src_height || metadata.image_md_height || metadata.image_sm_height),
    videoId: null,
    provider: null,
    playbackId: null,
    streamUrl: null,
    streamHeaders: null,
    expiresAt: null,
    durationMs: null,
    aspectRatio: null,
  };
}

function normalizeVideoLinkData(value: unknown): PostAttachment | null {
  const entry = asRecord(value);
  const url = normalizeText(entry.url);
  const thumbnailUrl = normalizeText(entry.thumbnail);
  const videoId = normalizeText(entry.video_id || entry.videoId);
  const rawProvider = normalizeText(entry.provider);
  if (!url && !thumbnailUrl && !videoId) {
    return null;
  }

  return {
    type: "video",
    source: "post-detail",
    id: null,
    url: url || null,
    thumbnailUrl: thumbnailUrl || null,
    fileName: normalizeText(entry.title) || null,
    mimeType: null,
    width: null,
    height: null,
    videoId: videoId || null,
    provider: rawProvider === "1" ? "youtube" : rawProvider || null,
    playbackId: null,
    streamUrl: null,
    streamHeaders: null,
    expiresAt: null,
    durationMs: null,
    aspectRatio: null,
  };
}

function normalizePostAttachments(metadata: Record<string, unknown>, source: "feed-preview" | "post-detail"): PostAttachment[] {
  const attachments: PostAttachment[] = [];

  for (const entry of parseJsonArray(metadata.attachmentsData || metadata.attachments_data)) {
    const attachment = normalizeAttachmentData(entry);
    if (attachment) {
      attachments.push({ ...attachment, source });
    }
  }

  for (const entry of parseJsonArray(metadata.videoLinksData || metadata.video_links_data)) {
    const attachment = normalizeVideoLinkData(entry);
    if (attachment) {
      attachments.push({ ...attachment, source });
    }
  }

  const videoIds = splitIds(metadata.videoIds);
  for (const videoId of videoIds) {
    attachments.push({
      type: "video",
      source,
      id: videoId,
      url: null,
      thumbnailUrl: normalizeText(metadata.imagePreview || metadata.imagePreviewSmall) || null,
      fileName: null,
      mimeType: null,
      width: null,
      height: null,
      videoId,
      provider: "skool",
      playbackId: null,
      streamUrl: null,
      streamHeaders: null,
      expiresAt: null,
      durationMs: null,
      aspectRatio: null,
    });
  }

  const imagePreview = normalizeText(metadata.imagePreview);
  const imagePreviewSmall = normalizeText(metadata.imagePreviewSmall);
  if (imagePreview && attachments.length === 0) {
    attachments.push({
      type: imagePreview.includes("image.video.skool.com") ? "video" : "image",
      source,
      id: null,
      url: imagePreview,
      thumbnailUrl: imagePreviewSmall || imagePreview,
      fileName: null,
      mimeType: null,
      width: null,
      height: null,
      videoId: null,
      provider: imagePreview.includes("ytimg.com") ? "youtube" : null,
      playbackId: null,
      streamUrl: null,
      streamHeaders: null,
      expiresAt: null,
      durationMs: null,
      aspectRatio: null,
    });
  }

  return dedupeAttachments(attachments);
}

function buildSectionMap(pageProps: Record<string, unknown>): Map<string, { id: string; name: string }> {
  const group = asRecord(pageProps.currentGroup || pageProps.group);
  const labels = Array.isArray(group.labels) ? group.labels : [];
  const sections = new Map<string, { id: string; name: string }>();

  for (const label of labels) {
    const candidate = asRecord(label);
    const metadata = asRecord(candidate.metadata);
    const id = normalizeText(candidate.id);
    if (!id) {
      continue;
    }
    sections.set(id, {
      id,
      name: normalizeText(metadata.displayName || metadata.name || candidate.name || id),
    });
  }

  return sections;
}

function normalizePostTree(tree: Record<string, unknown>, community: string, sections = new Map<string, { id: string; name: string }>()): CommunityFeedItem {
  const post = (tree.post || tree) as Record<string, unknown>;
  const metadata = (post.metadata || {}) as Record<string, unknown>;
  const user = (tree.user || post.user || {}) as Record<string, unknown>;
  const slug = normalizeText(post.name || post.slug || post.id);
  const sectionId = normalizeText(post.labelId || metadata.labels) || null;
  const section = sectionId ? sections.get(sectionId) : null;
  const attachmentIds = splitIds(metadata.attachments);
  return {
    id: normalizeText(post.id || slug),
    title: normalizeText(metadata.title || metadata.displayName || post.title || slug),
    authorName: normalizeText(user.name || "Unknown member"),
    body: normalizeText(metadata.content || post.content || post.body),
    commentCount: normalizeNumber(metadata.comments || post.commentCount),
    likeCount: normalizeNumber(metadata.upvotes || metadata.likes || post.likeCount || post.likes),
    sectionId,
    sectionName: section?.name || null,
    attachmentIds,
    attachments: normalizePostAttachments(metadata, "feed-preview"),
    createdAt: normalizeText(post.createdAt) || null,
    url: slug ? `https://www.skool.com/${community}/${slug}` : null,
  };
}

export function normalizeCommunityFeed(pageProps: Record<string, unknown>, community: string): CommunityFeedItem[] {
  const trees = Array.isArray(pageProps.postTrees) ? pageProps.postTrees : [];
  const sections = buildSectionMap(pageProps);
  return trees.map((tree) => normalizePostTree(tree as Record<string, unknown>, community, sections));
}

function normalizeJoinedCommunityEntry(entry: unknown, pinnedIds: Set<string>, current?: JoinedCommunity): JoinedCommunity | null {
  const candidate = asRecord(asRecord(entry).group || entry);
  const metadata = asRecord(candidate.metadata);
  const slug = normalizeText(candidate.name || candidate.slug || current?.slug);
  if (!slug) {
    return null;
  }

  const groupId = normalizeText(candidate.id || current?.groupId) || null;
  const owner = normalizeOwner(metadata);
  return {
    id: slug,
    slug,
    name: normalizeText(
      metadata.displayName ||
      metadata.title ||
      metadata.name ||
      candidate.displayName ||
      candidate.label ||
      current?.name ||
      slug,
    ) || slug,
    description: normalizeText(metadata.description || candidate.description || current?.description),
    groupId,
    ownerId: owner.ownerId || current?.ownerId || null,
    ownerUsername: owner.ownerUsername || current?.ownerUsername || null,
    ownerName: owner.ownerName || current?.ownerName || null,
    ownerProfileUrl: owner.ownerProfileUrl || current?.ownerProfileUrl || null,
    href: `https://www.skool.com/${slug}`,
    pinned: Boolean(current?.pinned || (groupId && pinnedIds.has(groupId))),
  };
}

export function normalizeJoinedCommunities(pageProps: Record<string, unknown>): JoinedCommunity[] {
  const self = asRecord(pageProps.self);
  const pinnedGroups = Array.isArray(self.pinnedGroups) ? self.pinnedGroups : [];
  const allGroups = Array.isArray(self.allGroups) ? self.allGroups : [];
  const fallbackGroups = Array.isArray(self.groups)
    ? self.groups
    : Array.isArray(self.communities)
      ? self.communities
      : [];
  const pinnedIds = new Set(
    pinnedGroups
      .map((entry) => normalizeText(asRecord(entry).id))
      .filter(Boolean),
  );
  const merged = new Map<string, JoinedCommunity>();

  for (const entry of [...pinnedGroups, ...allGroups, ...fallbackGroups]) {
    const candidate = normalizeJoinedCommunityEntry(entry, pinnedIds, merged.get(normalizeText(asRecord(entry).name)));
    if (candidate) {
      merged.set(candidate.slug, candidate);
    }
  }

  return [...merged.values()].sort((left, right) => {
    if (left.pinned !== right.pinned) {
      return left.pinned ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
  });
}

export async function listJoinedCommunities(browserFallback: BrowserFallback): Promise<JoinedCommunityList> {
  const pageProps = asRecord(await browserFallback.readPageProps("https://www.skool.com/"));
  return {
    source: "browser-fallback",
    fetchedAt: new Date().toISOString(),
    communities: normalizeJoinedCommunities(pageProps),
  };
}

export async function getCommunityFeed(transport: SkoolTransport, {
  community,
  limit = 25,
  includeMedia = false,
}: {
  community: string;
  limit?: number;
  includeMedia?: boolean;
}): Promise<CommunityFeed> {
  const result = await transport.readNextData(`/${community}`, { group: community });
  const pageProps = getPageProps(result);
  const items = normalizeCommunityFeed(pageProps, community).slice(0, limit);
  const enrichedItems = includeMedia
    ? await Promise.all(items.map((item) => enrichFeedItemMedia(transport, item, community)))
    : items;
  return {
    community,
    source: result.source,
    fetchedAt: result.fetchedAt,
    items: enrichedItems,
  };
}

async function enrichFeedItemMedia(transport: SkoolTransport, item: CommunityFeedItem, community: string): Promise<CommunityFeedItem> {
  if (!item.url) {
    return item;
  }
  const slug = item.url.split("/").filter(Boolean).pop();
  if (!slug) {
    return item;
  }
  try {
    const result = await transport.readNextData(`/${community}/${slug}`, { group: community });
    const pageProps = getPageProps(result);
    const postTree = asRecord(pageProps.postTree || pageProps.post || pageProps.postTrees);
    const post = asRecord(postTree.post || postTree);
    const metadata = asRecord(post.metadata);
    const detailedAttachments = normalizePostAttachments(metadata, "post-detail");
    const detailedAttachmentIds = splitIds(metadata.attachments);
    const resolvedAttachments = await enrichSkoolVideoAttachments(transport, detailedAttachments.length ? detailedAttachments : item.attachments);
    return {
      ...item,
      attachmentIds: detailedAttachmentIds.length ? detailedAttachmentIds : item.attachmentIds,
      attachments: resolvedAttachments,
    };
  } catch {
    return item;
  }
}

async function enrichSkoolVideoAttachments(transport: SkoolTransport, attachments: PostAttachment[]): Promise<PostAttachment[]> {
  if (!transport.resolveVideoPlayback) {
    return attachments;
  }
  return Promise.all(attachments.map(async (attachment) => {
    if (attachment.type !== "video" || attachment.provider !== "skool" || !attachment.videoId) {
      return attachment;
    }
    try {
      const playback = await transport.resolveVideoPlayback?.(attachment.videoId);
      if (!playback?.playbackId || !playback.playbackToken) {
        return attachment;
      }
      return {
        ...attachment,
        playbackId: playback.playbackId,
        url: `https://stream.video.skool.com/${playback.playbackId}.m3u8?token=${playback.playbackToken}`,
        streamUrl: `https://stream.video.skool.com/${playback.playbackId}.m3u8?token=${playback.playbackToken}`,
        streamHeaders: {
          Referer: "https://www.skool.com/",
          Origin: "https://www.skool.com",
        },
        expiresAt: playback.expiresAt,
        durationMs: playback.durationMs,
        aspectRatio: playback.aspectRatio,
      };
    } catch {
      return attachment;
    }
  }));
}

export async function getCommunityInfo(transport: SkoolTransport, community: string): Promise<CommunityInfo> {
  const result = await transport.readNextData(`/${community}`, { group: community });
  const pageProps = getPageProps(result);
  const group = (pageProps.currentGroup || pageProps.group || {}) as Record<string, unknown>;
  const metadata = asRecord(group.metadata);
  const owner = normalizeOwner(metadata);
  return {
    community,
    source: result.source,
    fetchedAt: result.fetchedAt,
    name: normalizeText(metadata.displayName || group.name || group.label || community),
    memberCount: Number.isFinite(Number(metadata.totalMembers || group.numMembers || group.memberCount))
      ? Number(metadata.totalMembers || group.numMembers || group.memberCount)
      : null,
    ownerId: owner.ownerId,
    ownerUsername: owner.ownerUsername,
    ownerName: owner.ownerName,
    ownerProfileUrl: owner.ownerProfileUrl,
  };
}
