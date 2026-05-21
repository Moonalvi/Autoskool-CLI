import type { AppConfig } from "./config.js";
import { getStatePaths } from "./paths.js";
import { VERSION } from "./version.js";

export interface DoctorCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface DoctorReport {
  version: string;
  checks: DoctorCheck[];
  ok: boolean;
}

export function createDoctorReport(config: AppConfig): DoctorReport {
  const statePaths = getStatePaths(config);
  const checks: DoctorCheck[] = [
    {
      name: "node",
      ok: Number(process.versions.node.split(".")[0]) >= 20,
      detail: process.version,
    },
    {
      name: "platform",
      ok: true,
      detail: `${process.platform}/${process.arch}`,
    },
    {
      name: "approval_default",
      ok: config.requireApproval,
      detail: String(config.requireApproval),
    },
    {
      name: "state_root",
      ok: statePaths.root.length > 0,
      detail: statePaths.root,
    },
  ];

  return {
    version: VERSION,
    checks,
    ok: checks.every((check) => check.ok),
  };
}

export function formatDoctorReport(report: DoctorReport): string {
  return report.checks
    .map((check) => `${check.ok ? "ok" : "fail"} ${check.name}: ${check.detail}`)
    .join("\n");
}
