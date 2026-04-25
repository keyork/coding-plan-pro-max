import { startServer } from "../server.js";

export async function startAction(opts: { port?: string }): Promise<void> {
  if (opts.port) {
    process.env.PORT = opts.port;
  }

  startServer();
}
