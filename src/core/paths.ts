import path from "node:path";
import fs from "node:fs";

import type { AppConfig } from "./config.js";

export interface StatePaths {
  root: string;
  profiles: string;
  profile: string;
  db: string;
  logs: string;
  browserProfile: string;
  authFile: string;
}

export function getStatePaths(config: AppConfig): StatePaths {
  const profileRoot = path.join(config.homeDir, "profiles", config.profile);
  return {
    root: config.homeDir,
    profiles: path.join(config.homeDir, "profiles"),
    profile: profileRoot,
    db: path.join(profileRoot, "db"),
    logs: path.join(profileRoot, "logs"),
    browserProfile: path.join(profileRoot, "browser-profile"),
    authFile: path.join(profileRoot, "auth", "session.json"),
  };
}

export function ensureStatePaths(paths: StatePaths): void {
  for (const directory of [
    paths.root,
    paths.profiles,
    paths.profile,
    paths.db,
    paths.logs,
    paths.browserProfile,
    path.dirname(paths.authFile),
  ]) {
    fs.mkdirSync(directory, { recursive: true });
  }
}
