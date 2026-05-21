import { createAgentContext } from "../core/agent-context.js";
import type { QueueStore } from "../queue/index.js";

export interface McpTool {
  name: string;
  description: string;
  safe: boolean;
}

export interface McpStatus {
  ready: boolean;
  tools: McpTool[];
}

export function listMcpTools(): McpTool[] {
  return [
    { name: "autoskool_agent_context", description: "Return Autoskool CLI agent context.", safe: true },
    { name: "autoskool_queue_list", description: "List local queue items.", safe: true },
    { name: "autoskool_safety_status", description: "Return active safety pause status.", safe: true },
  ];
}

export function getMcpStatus(): McpStatus {
  return {
    ready: true,
    tools: listMcpTools(),
  };
}

export async function handleMcpTool(name: string, {
  queueStore,
}: {
  queueStore?: QueueStore;
} = {}): Promise<unknown> {
  if (name === "autoskool_agent_context") {
    return createAgentContext();
  }
  if (name === "autoskool_queue_list") {
    if (!queueStore) {
      throw new Error("queueStore is required for autoskool_queue_list.");
    }
    return queueStore.list();
  }
  if (name === "autoskool_safety_status") {
    if (!queueStore) {
      throw new Error("queueStore is required for autoskool_safety_status.");
    }
    const pause = queueStore.getActiveSafetyPause();
    return { paused: Boolean(pause), pause };
  }
  throw new Error(`Unknown MCP tool: ${name}`);
}
