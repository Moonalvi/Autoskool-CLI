import os from "node:os";
import path from "node:path";

export interface AppConfig {
  homeDir: string;
  profile: string;
  requireApproval: boolean;
  minDelayMinutes: number;
  maxDelayMinutes: number;
  defaultCommunity: string;
  browserChannel: string;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value.trim() === "") {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getDefaultHomeDir(platform = process.platform, env = process.env): string {
  if (env.AUTOSKOOL_HOME?.trim()) {
    return path.resolve(env.AUTOSKOOL_HOME.trim());
  }
  if (platform === "win32") {
    return path.join(env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "Autoskool CLI");
  }
  return path.join(env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state"), "autoskool-cli");
}

export function loadConfig(env = process.env): AppConfig {
  return {
    homeDir: getDefaultHomeDir(process.platform, env),
    profile: env.AUTOSKOOL_PROFILE?.trim() || "default",
    requireApproval: parseBoolean(env.AUTOSKOOL_REQUIRE_APPROVAL, true),
    minDelayMinutes: parseNumber(env.AUTOSKOOL_MIN_DELAY_MINUTES, 3),
    maxDelayMinutes: parseNumber(env.AUTOSKOOL_MAX_DELAY_MINUTES, 8),
    defaultCommunity: env.AUTOSKOOL_DEFAULT_COMMUNITY?.trim() || "",
    browserChannel: env.AUTOSKOOL_BROWSER_CHANNEL?.trim() || "msedge",
  };
}
