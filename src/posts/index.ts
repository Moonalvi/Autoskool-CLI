import type { CommunityFeedItem } from "../community/index.js";
import type { QueueItem, QueueStore } from "../queue/index.js";

export interface PostOpportunity {
  postId: string;
  title: string;
  authorName: string;
  score: number;
  reason: string;
  sourceUrl: string | null;
  evidence: Record<string, unknown>;
}

export function scorePostOpportunities(items: CommunityFeedItem[], {
  queuedSourceUrls = new Set<string>(),
}: {
  queuedSourceUrls?: Set<string>;
} = {}): PostOpportunity[] {
  return items
    .filter((item) => !item.url || !queuedSourceUrls.has(item.url))
    .map((item) => {
      let score = 0;
      const reasons: string[] = [];
      if (item.commentCount === 0) {
        score += 40;
        reasons.push("zero comments");
      }
      if (/\?|help|how|stuck|advice|feedback|recommend|issue|problem/i.test(`${item.title} ${item.body}`)) {
        score += 35;
        reasons.push("asks for help or feedback");
      }
      if (item.body.length > 80) {
        score += 15;
        reasons.push("has useful context");
      }
      if (item.title.length > 0) {
        score += 10;
      }
      return {
        postId: item.id,
        title: item.title,
        authorName: item.authorName,
        score,
        reason: reasons.join(", ") || "recent post",
        sourceUrl: item.url,
        evidence: {
          title: item.title,
          body: item.body,
          authorName: item.authorName,
          commentCount: item.commentCount,
          createdAt: item.createdAt,
        },
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function draftComment(opportunity: PostOpportunity): string {
  if (/help|how|stuck|issue|problem/i.test(`${opportunity.title} ${opportunity.evidence.body || ""}`)) {
    return "This is a solid question. The useful next step is to isolate the exact bottleneck, then test one small change so you can see what actually moved.";
  }
  return "This is a useful share. The part that stands out is the practical signal behind it, especially because it gives people something concrete to compare against.";
}

export function queuePostDraft(store: QueueStore, opportunity: PostOpportunity, draft = draftComment(opportunity)): QueueItem {
  return store.add({
    type: "post_comment",
    title: `Comment draft: ${opportunity.title}`,
    draft,
    sourceUrl: opportunity.sourceUrl,
    evidence: {
      kind: "post_opportunity",
      postId: opportunity.postId,
      score: opportunity.score,
      reason: opportunity.reason,
      ...opportunity.evidence,
    },
  });
}
