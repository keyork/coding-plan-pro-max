import { startServer } from "../server.js";

export async function startAction(opts: { port?: string; mode?: string }): Promise<void> {
  if (opts.port) {
    process.env.PORT = opts.port;
  }

  if (opts.mode) {
    const mode = opts.mode.toLowerCase();
    if (mode !== "round-robin" && mode !== "squeeze") {
      console.error(`Invalid mode: "${opts.mode}". Must be "round-robin" or "squeeze".`);
      process.exit(1);
    }
    process.env.KEY_MODE = mode;
  }

  startServer();
}
