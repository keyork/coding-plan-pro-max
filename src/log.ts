import pc from "picocolors";

function timestamp(): string {
  return pc.dim(new Date().toLocaleTimeString("en-US", { hour12: false }));
}

function tag(scope: string, color: (s: string) => string): string {
  return color(pc.bold(`[${scope}]`));
}

export const log = {
  info(scope: string, msg: string, ...args: unknown[]): void {
    console.log(`${timestamp()} ${tag(scope, pc.blue)} ${msg}`, ...args);
  },

  success(scope: string, msg: string, ...args: unknown[]): void {
    console.log(`${timestamp()} ${tag(scope, pc.green)} ${msg}`, ...args);
  },

  warn(scope: string, msg: string, ...args: unknown[]): void {
    console.warn(`${timestamp()} ${tag(scope, pc.yellow)} ${pc.yellow(msg)}`, ...args);
  },

  error(scope: string, msg: string, ...args: unknown[]): void {
    console.error(`${timestamp()} ${tag(scope, pc.red)} ${pc.red(msg)}`, ...args);
  },

  debug(scope: string, msg: string, ...args: unknown[]): void {
    console.log(`${timestamp()} ${tag(scope, pc.dim)} ${pc.dim(msg)}`, ...args);
  },
};

export function banner(lines: string[]): void {
  const width = Math.max(...lines.map((l) => l.length)) + 4;
  const border = pc.dim("─".repeat(width));
  console.log();
  console.log(border);
  for (const line of lines) {
    console.log(`${pc.dim("│")} ${line}`);
  }
  console.log(border);
  console.log();
}

export function fmtKey(key: string, index: number): string {
  return pc.cyan(`key#${index}`) + pc.dim(`(${key.slice(0, 8)}...)`);
}

export function fmtStatus(code: number): string {
  if (code >= 200 && code < 300) return pc.green(`${code}`);
  if (code >= 400 && code < 500) return pc.yellow(`${code}`);
  return pc.red(`${code}`);
}

export function fmtModel(name: string): string {
  return pc.magenta(name);
}

export function fmtMs(ms: number): string {
  return pc.dim(`${ms}ms`);
}
