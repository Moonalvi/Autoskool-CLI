import type { CommunityFeed, CommunityFeedItem, CommunityInfo, JoinedCommunityList, PostAttachment } from "./index.js";

function truncate(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function normalizeMultiline(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

function indentMultiline(value: string, indent = "     "): string {
  return normalizeMultiline(value)
    .split("\n")
    .map((line) => `${indent}${line}`)
    .join("\n");
}

function formatDate(value: string | null): string {
  if (!value) {
    return "unknown time";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function plural(count: number, singular: string, pluralValue = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralValue}`;
}

function formatAttachmentSummary(attachments: PostAttachment[]): string {
  if (!attachments.length) {
    return "none";
  }
  const counts = new Map<string, number>();
  for (const attachment of attachments) {
    const key = attachment.provider === "skool" && attachment.streamUrl
      ? "skool video stream"
      : attachment.provider
        ? `${attachment.provider} ${attachment.type}`
        : attachment.type;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([type, count]) => plural(count, type))
    .join(", ");
}

function formatStreamHeaders(headers: Record<string, string>): string {
  return Object.entries(headers)
    .map(([key, value]) => `${key}: ${value}`)
    .join("; ");
}

function formatAttachmentDetails(attachments: PostAttachment[]): string[] {
  return attachments.map((attachment, index) => {
    const label = attachment.fileName || attachment.provider || attachment.type;
    const meta = [
      attachment.durationMs ? `${Math.round(attachment.durationMs / 1000)}s` : "",
      attachment.aspectRatio || "",
      attachment.expiresAt ? `expires ${formatDate(attachment.expiresAt)}` : "",
    ].filter(Boolean).join(", ");

    const lines = [
      `    ${index + 1}. ${attachment.type}${attachment.provider ? ` (${attachment.provider})` : ""}: ${label}`,
      attachment.url ? `       URL: ${attachment.url}` : "",
      attachment.thumbnailUrl ? `       Thumbnail: ${attachment.thumbnailUrl}` : "",
      attachment.streamUrl ? `       Stream URL: ${attachment.streamUrl}` : "",
      meta ? `       ${meta}` : "",
      attachment.streamHeaders ? `       Stream headers: ${formatStreamHeaders(attachment.streamHeaders)}` : "",
    ].filter(Boolean);

    return lines.join("\n");
  });
}

function formatFeedItem(item: CommunityFeedItem, index: number): string {
  const section = item.sectionName || "Uncategorized";
  const stats = [
    plural(item.likeCount, "like"),
    plural(item.commentCount, "comment"),
    `media: ${formatAttachmentSummary(item.attachments)}`,
  ].join(" | ");
  const lines = [
    `${index + 1}. ${item.title}`,
    `   Author: ${item.authorName}`,
    `   Section: ${section}`,
    `   Posted: ${formatDate(item.createdAt)}`,
    `   Stats: ${stats}`,
    item.url ? `   URL: ${item.url}` : "",
  ].filter(Boolean);

  if (item.body) {
    lines.push("   Body:");
    lines.push(indentMultiline(item.body));
  }

  if (item.attachments.length) {
    lines.push("   Attachments:");
    lines.push(...formatAttachmentDetails(item.attachments));
  }

  return lines.join("\n");
}

export function formatCommunityFeed(feed: CommunityFeed): string {
  const lines = [
    `Community Feed: ${feed.community}`,
    `Source: ${feed.source}`,
    `Fetched: ${formatDate(feed.fetchedAt)}`,
    `Items: ${feed.items.length}`,
    "",
  ];

  if (!feed.items.length) {
    lines.push("No posts found.");
    return lines.join("\n");
  }

  lines.push(...feed.items.map((item, index) => formatFeedItem(item, index)).flatMap((value, index) => index === 0 ? [value] : ["", value]));
  return lines.join("\n");
}

export function formatJoinedCommunityList(list: JoinedCommunityList): string {
  const lines = [
    "Joined Communities",
    `Source: ${list.source}`,
    `Fetched: ${formatDate(list.fetchedAt)}`,
    `Total: ${list.communities.length}`,
    "",
  ];

  if (!list.communities.length) {
    lines.push("No joined communities found.");
    return lines.join("\n");
  }

  const nameWidth = Math.min(34, Math.max(4, ...list.communities.map((community) => community.name.length)));
  const ownerWidth = Math.min(26, Math.max(5, ...list.communities.map((community) => (community.ownerName || "unknown").length)));
  lines.push(`${"Name".padEnd(nameWidth)}  ${"Owner".padEnd(ownerWidth)}  Slug`);
  lines.push(`${"-".repeat(nameWidth)}  ${"-".repeat(ownerWidth)}  ----`);
  for (const community of list.communities) {
    const name = truncate(community.name, nameWidth).padEnd(nameWidth);
    const owner = truncate(community.ownerName || "unknown", ownerWidth).padEnd(ownerWidth);
    const pinned = community.pinned ? " [pinned]" : "";
    lines.push(`${name}  ${owner}  ${community.slug}${pinned}`);
  }

  return lines.join("\n");
}

export function formatCommunityInfo(info: CommunityInfo): string {
  return [
    `Community: ${info.name}`,
    `Slug: ${info.community}`,
    `Source: ${info.source}`,
    `Fetched: ${formatDate(info.fetchedAt)}`,
    `Members: ${info.memberCount == null ? "unknown" : info.memberCount.toLocaleString()}`,
    `Owner: ${info.ownerName || "unknown"}`,
    `Owner username: ${info.ownerUsername || "unknown"}`,
    `Owner profile: ${info.ownerProfileUrl || "unknown"}`,
  ].join("\n");
}
