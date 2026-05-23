import pc from "picocolors";

function timestamp(): string {
  const d = new Date();
  const date = d.toISOString().slice(0, 10);
  const time = d.toTimeString().slice(0, 8);
  return pc.dim(`${date} ${time}`);
}

function caller(): string {
  const stack = new Error().stack?.split("\n") ?? [];
  for (let i = 3; i < stack.length; i++) {
    const line = stack[i].trim();
    if (!line.includes("/log.ts")) {
      const match = line.match(/(?:at\s+)?(?:.*\s+\()?(.+):(\d+):(\d+)\)?/);
      if (match) {
        const file = match[1].split("/").pop() ?? match[1];
        return pc.dim(`<${file}:${match[2]}>`);
      }
    }
  }
  return "";
}

function tag(scope: string, color: (s: string) => string): string {
  return color(pc.bold(`[${scope}]`));
}

export const log = {
  info(scope: string, msg: string, ...args: unknown[]): void {
    console.log(`${timestamp()} ${tag(scope, pc.blue)} ${caller()} ${msg}`, ...args);
  },

  success(scope: string, msg: string, ...args: unknown[]): void {
    console.log(`${timestamp()} ${tag(scope, pc.green)} ${caller()} ${msg}`, ...args);
  },

  warn(scope: string, msg: string, ...args: unknown[]): void {
    console.warn(`${timestamp()} ${tag(scope, pc.yellow)} ${caller()} ${pc.yellow(msg)}`, ...args);
  },

  error(scope: string, msg: string, ...args: unknown[]): void {
    console.error(`${timestamp()} ${tag(scope, pc.red)} ${caller()} ${pc.red(msg)}`, ...args);
  },

  debug(scope: string, msg: string, ...args: unknown[]): void {
    console.log(`${timestamp()} ${tag(scope, pc.dim)} ${caller()} ${pc.dim(msg)}`, ...args);
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
