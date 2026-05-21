export interface OutputOptions {
  json?: boolean;
}

export function writeOutput(value: unknown, options: OutputOptions = {}): void {
  if (options.json) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }

  if (typeof value === "string") {
    console.log(value);
    return;
  }

  console.log(JSON.stringify(value, null, 2));
}
