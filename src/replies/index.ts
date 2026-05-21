import type { QueueItem, QueueStore } from "../queue/index.js";

export interface ReplySignal {
  replyId: string;
  postId: string;
  postTitle: string;
  replyAuthorName: string;
  replyText: string;
  needsAttention: boolean;
  reason: string;
  sourceUrl: string | null;
}

const LOW_SIGNAL_PATTERNS = [
  /^(nice|thanks|thank you|you are right|agreed|cool|great|awesome|love it)[!. ]*$/i,
  /^.{0,12}$/u,
];

export function classifyReplySignal(input: {
  replyId: string;
  postId: string;
  postTitle: string;
  replyAuthorName: string;
  replyText: string;
  sourceUrl?: string | null;
}): ReplySignal {
  const text = input.replyText.trim();
  const lowSignal = LOW_SIGNAL_PATTERNS.some((pattern) => pattern.test(text));
  const asksQuestion = /\?|how|why|what|can you|could you|help|explain/i.test(text);
  return {
    ...input,
    sourceUrl: input.sourceUrl || null,
    needsAttention: !lowSignal || asksQuestion,
    reason: lowSignal && !asksQuestion ? "low_signal_ack" : asksQuestion ? "question_or_help_request" : "conversation_continuation",
  };
}

export function draftReply(signal: ReplySignal): string {
  if (signal.reason === "question_or_help_request") {
    return "Good question. The cleanest way to approach it is to test the smallest version first, then use that result to decide the next step.";
  }
  return "That makes sense. The key thing is keeping the next step concrete enough that it can be tested quickly.";
}

export function queueReplyDraft(
  store: QueueStore,
  signal: ReplySignal,
  draft = draftReply(signal),
  extraEvidence: Record<string, unknown> = {},
): QueueItem | null {
  if (!signal.needsAttention) {
    return null;
  }
  return store.add({
    type: "reply_follow_up",
    title: `Reply draft: ${signal.postTitle}`,
    draft,
    sourceUrl: signal.sourceUrl,
    evidence: {
      kind: "reply_signal",
      replyId: signal.replyId,
      postId: signal.postId,
      postTitle: signal.postTitle,
      replyAuthorName: signal.replyAuthorName,
      replyText: signal.replyText,
      reason: signal.reason,
      ...extraEvidence,
    },
  });
}
