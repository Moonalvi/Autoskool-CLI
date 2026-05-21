import Database from "better-sqlite3";
import crypto from "node:crypto";
import path from "node:path";

import type { AppConfig } from "../core/config.js";
import { ensureStatePaths, getStatePaths } from "../core/paths.js";

export type QueueStatus = "needs-action" | "approved" | "ignored" | "sent" | "send-failed";
export type QueueItemType = "post_comment" | "reply_follow_up";

export interface QueueItem {
  id: string;
  type: QueueItemType;
  status: QueueStatus;
  title: string;
  draft: string;
  sourceUrl: string | null;
  evidence: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEvent {
  id: string;
  queueItemId: string | null;
  action: string;
  message: string;
  createdAt: string;
}

export interface QueueStore {
  list(status?: QueueStatus): QueueItem[];
  get(id: string): QueueItem;
  add(input: AddQueueItemInput, now?: Date): QueueItem;
  addDemo(now?: Date): QueueItem;
  approve(id: string, now?: Date): QueueItem;
  ignore(id: string, now?: Date): QueueItem;
  markSent(id: string, outboundId: string | null, now?: Date): QueueItem;
  markSendFailed(id: string, message: string, now?: Date): QueueItem;
  auditEvents(id?: string): AuditEvent[];
  createSafetyPause(reason: string, detail: string, now?: Date): void;
  getActiveSafetyPause(): SafetyPause | null;
  resumeSafetyPause(now?: Date): void;
  close(): void;
}

export interface AddQueueItemInput {
  type: QueueItemType;
  title: string;
  draft: string;
  sourceUrl?: string | null;
  evidence?: Record<string, unknown>;
}

export interface SafetyPause {
  id: string;
  reason: string;
  detail: string;
  active: boolean;
  createdAt: string;
  resolvedAt: string | null;
}

interface QueueRow {
  id: string;
  type: QueueItemType;
  status: QueueStatus;
  title: string;
  draft: string;
  source_url: string | null;
  evidence_json: string;
  created_at: string;
  updated_at: string;
}

interface AuditRow {
  id: string;
  queue_item_id: string | null;
  action: string;
  message: string;
  created_at: string;
}

interface SafetyPauseRow {
  id: string;
  reason: string;
  detail: string;
  active: number;
  created_at: string;
  resolved_at: string | null;
}

export function getQueueDatabasePath(config: AppConfig): string {
  return path.join(getStatePaths(config).db, "autoskool.sqlite");
}

export function openQueueDatabase(config: AppConfig): Database.Database {
  const paths = getStatePaths(config);
  ensureStatePaths(paths);
  const db = new Database(getQueueDatabasePath(config));
  initializeQueueDatabase(db);
  return db;
}

export function initializeQueueDatabase(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS queue_items (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      title TEXT NOT NULL,
      draft TEXT NOT NULL,
      source_url TEXT,
      evidence_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      approved_at TEXT,
      ignored_at TEXT,
      sent_at TEXT,
      send_error TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      queue_item_id TEXT,
      action TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(queue_item_id) REFERENCES queue_items(id)
    );

    CREATE TABLE IF NOT EXISTS safety_pauses (
      id TEXT PRIMARY KEY,
      reason TEXT NOT NULL,
      detail TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_queue_items_status_created
      ON queue_items(status, created_at);

    CREATE INDEX IF NOT EXISTS idx_audit_events_queue_item
      ON audit_events(queue_item_id, created_at);
  `);
}

function toIso(now = new Date()): string {
  return now.toISOString();
}

function parseEvidence(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function hydrateQueueItem(row: QueueRow): QueueItem {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    title: row.title,
    draft: row.draft,
    sourceUrl: row.source_url,
    evidence: parseEvidence(row.evidence_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function hydrateAuditEvent(row: AuditRow): AuditEvent {
  return {
    id: row.id,
    queueItemId: row.queue_item_id,
    action: row.action,
    message: row.message,
    createdAt: row.created_at,
  };
}

function recordAudit(db: Database.Database, {
  queueItemId,
  action,
  message,
  now = new Date(),
}: {
  queueItemId: string | null;
  action: string;
  message: string;
  now?: Date;
}): void {
  db.prepare(`
    INSERT INTO audit_events (id, queue_item_id, action, message, created_at)
    VALUES (@id, @queueItemId, @action, @message, @createdAt)
  `).run({
    id: crypto.randomUUID(),
    queueItemId,
    action,
    message,
    createdAt: toIso(now),
  });
}

function requireQueueItem(db: Database.Database, id: string): QueueItem {
  const row = db.prepare("SELECT * FROM queue_items WHERE id = ?").get(id) as QueueRow | undefined;
  if (!row) {
    throw new Error(`Queue item not found: ${id}`);
  }
  return hydrateQueueItem(row);
}

function hydrateSafetyPause(row: SafetyPauseRow): SafetyPause {
  return {
    id: row.id,
    reason: row.reason,
    detail: row.detail,
    active: Boolean(row.active),
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

export function createQueueStore(db: Database.Database): QueueStore {
  return {
    get(id: string) {
      return requireQueueItem(db, id);
    },

    list(status = "needs-action") {
      const rows = db.prepare(`
        SELECT * FROM queue_items
        WHERE status = ?
        ORDER BY created_at DESC
      `).all(status) as QueueRow[];
      return rows.map(hydrateQueueItem);
    },

    add(input: AddQueueItemInput, now = new Date()) {
      const createdAt = toIso(now);
      const item: QueueItem = {
        id: crypto.randomUUID(),
        type: input.type,
        status: "needs-action",
        title: input.title,
        draft: input.draft,
        sourceUrl: input.sourceUrl || null,
        evidence: input.evidence || {},
        createdAt,
        updatedAt: createdAt,
      };

      db.prepare(`
        INSERT INTO queue_items (
          id, type, status, title, draft, source_url, evidence_json, created_at, updated_at
        )
        VALUES (
          @id, @type, @status, @title, @draft, @sourceUrl, @evidenceJson, @createdAt, @updatedAt
        )
      `).run({
        ...item,
        evidenceJson: JSON.stringify(item.evidence),
      });
      recordAudit(db, {
        queueItemId: item.id,
        action: "queue.item_added",
        message: "Queue item added locally.",
        now,
      });
      return item;
    },

    addDemo(now = new Date()) {
      const item = this.add({
        type: "post_comment",
        title: "Demo Skool comment draft",
        draft: "This is a local demo draft. It does not touch Skool.",
        sourceUrl: "https://www.skool.com/demo/example-post",
        evidence: {
          demo: true,
          safety: "local-only",
        },
      }, now);
      recordAudit(db, {
        queueItemId: item.id,
        action: "queue.demo_added",
        message: "Demo queue item added locally.",
        now,
      });
      return item;
    },

    approve(id: string, now = new Date()) {
      const updatedAt = toIso(now);
      db.prepare(`
        UPDATE queue_items
        SET status = 'approved', approved_at = @updatedAt, updated_at = @updatedAt
        WHERE id = @id AND status != 'sent'
      `).run({ id, updatedAt });
      const item = requireQueueItem(db, id);
      recordAudit(db, {
        queueItemId: id,
        action: "queue.approved",
        message: "Queue item approved. Final send confirmation is still required.",
        now,
      });
      return item;
    },

    markSent(id: string, outboundId: string | null, now = new Date()) {
      const updatedAt = toIso(now);
      db.prepare(`
        UPDATE queue_items
        SET status = 'sent', sent_at = @updatedAt, updated_at = @updatedAt, send_error = NULL
        WHERE id = @id
      `).run({ id, updatedAt });
      const item = requireQueueItem(db, id);
      recordAudit(db, {
        queueItemId: id,
        action: "queue.sent",
        message: outboundId ? `Queue item sent. Outbound id: ${outboundId}` : "Queue item sent.",
        now,
      });
      return item;
    },

    markSendFailed(id: string, message: string, now = new Date()) {
      const updatedAt = toIso(now);
      db.prepare(`
        UPDATE queue_items
        SET status = 'send-failed', send_error = @message, updated_at = @updatedAt
        WHERE id = @id
      `).run({ id, message, updatedAt });
      const item = requireQueueItem(db, id);
      recordAudit(db, {
        queueItemId: id,
        action: "queue.send_failed",
        message,
        now,
      });
      return item;
    },

    ignore(id: string, now = new Date()) {
      const updatedAt = toIso(now);
      db.prepare(`
        UPDATE queue_items
        SET status = 'ignored', ignored_at = @updatedAt, updated_at = @updatedAt
        WHERE id = @id AND status != 'sent'
      `).run({ id, updatedAt });
      const item = requireQueueItem(db, id);
      recordAudit(db, {
        queueItemId: id,
        action: "queue.ignored",
        message: "Queue item ignored locally.",
        now,
      });
      return item;
    },

    auditEvents(id?: string) {
      const rows = id
        ? db.prepare("SELECT * FROM audit_events WHERE queue_item_id = ? ORDER BY created_at ASC").all(id) as AuditRow[]
        : db.prepare("SELECT * FROM audit_events ORDER BY created_at ASC").all() as AuditRow[];
      return rows.map(hydrateAuditEvent);
    },

    createSafetyPause(reason: string, detail: string, now = new Date()) {
      db.prepare("UPDATE safety_pauses SET active = 0, resolved_at = @resolvedAt WHERE active = 1")
        .run({ resolvedAt: toIso(now) });
      db.prepare(`
        INSERT INTO safety_pauses (id, reason, detail, active, created_at)
        VALUES (@id, @reason, @detail, 1, @createdAt)
      `).run({
        id: crypto.randomUUID(),
        reason,
        detail,
        createdAt: toIso(now),
      });
      recordAudit(db, {
        queueItemId: null,
        action: "safety.paused",
        message: `${reason}: ${detail}`,
        now,
      });
    },

    getActiveSafetyPause() {
      const row = db.prepare("SELECT * FROM safety_pauses WHERE active = 1 ORDER BY created_at DESC LIMIT 1")
        .get() as SafetyPauseRow | undefined;
      return row ? hydrateSafetyPause(row) : null;
    },

    resumeSafetyPause(now = new Date()) {
      db.prepare("UPDATE safety_pauses SET active = 0, resolved_at = @resolvedAt WHERE active = 1")
        .run({ resolvedAt: toIso(now) });
      recordAudit(db, {
        queueItemId: null,
        action: "safety.resumed",
        message: "Safety pause resumed by operator.",
        now,
      });
    },

    close() {
      db.close();
    },
  };
}
