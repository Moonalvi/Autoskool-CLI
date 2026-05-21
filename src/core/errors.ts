export type AutoskoolErrorCode =
  | "USAGE_ERROR"
  | "RUNTIME_ERROR"
  | "AUTH_REQUIRED"
  | "APPROVAL_REQUIRED"
  | "SAFETY_PAUSED";

const EXIT_CODES: Record<AutoskoolErrorCode, number> = {
  RUNTIME_ERROR: 1,
  USAGE_ERROR: 2,
  AUTH_REQUIRED: 3,
  APPROVAL_REQUIRED: 4,
  SAFETY_PAUSED: 5,
};

export class AutoskoolError extends Error {
  readonly code: AutoskoolErrorCode;
  readonly exitCode: number;

  constructor(code: AutoskoolErrorCode, message: string) {
    super(message);
    this.name = "AutoskoolError";
    this.code = code;
    this.exitCode = EXIT_CODES[code];
  }
}

export function getExitCode(error: unknown): number {
  if (error instanceof AutoskoolError) {
    return error.exitCode;
  }
  return 1;
}
