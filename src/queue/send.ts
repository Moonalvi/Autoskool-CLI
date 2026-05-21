import { AutoskoolError } from "../core/errors.js";
import type { QueueItem, QueueStore } from "./index.js";
import type { SkoolTransport } from "../skool-transport/index.js";

export interface SendQueueItemOptions {
  id: string;
  confirm: boolean;
  store: QueueStore;
  transport: SkoolTransport;
}

function readEvidenceString(item: QueueItem, key: string): string {
  return String(item.evidence[key] ?? "").trim();
}

export async function sendQueueItem({
  id,
  confirm,
  store,
  transport,
}: SendQueueItemOptions): Promise<QueueItem> {
  const activePause = store.getActiveSafetyPause();
  if (activePause) {
    throw new AutoskoolError("SAFETY_PAUSED", `Safety pause active: ${activePause.reason}`);
  }
  if (!confirm) {
    throw new AutoskoolError("APPROVAL_REQUIRED", "Final send confirmation is required. Re-run with --confirm.");
  }
  const item = store.get(id);
  if (item.status !== "approved") {
    throw new AutoskoolError("APPROVAL_REQUIRED", "Queue item must be approved before sending.");
  }
  if (item.type !== "post_comment" && item.type !== "reply_follow_up") {
    throw new AutoskoolError("USAGE_ERROR", `Unsupported queue item type: ${item.type}`);
  }

  const postId = readEvidenceString(item, "postId");
  const groupId = readEvidenceString(item, "groupId");
  if (!postId || !groupId) {
    const failed = store.markSendFailed(id, "Missing postId or groupId evidence required for live send.");
    throw new AutoskoolError("USAGE_ERROR", `Cannot send item ${failed.id}: missing postId or groupId evidence.`);
  }

  try {
    const result = await transport.postComment({
      postId,
      groupId,
      content: item.draft,
      parentId: item.type === "reply_follow_up" ? readEvidenceString(item, "replyId") : null,
    });
    return store.markSent(id, String((result.response as { id?: unknown })?.id ?? ""));
  } catch (error) {
    store.markSendFailed(id, String(error instanceof Error ? error.message : error));
    throw error;
  }
}
