import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import { loadConfig } from "./config.js";
import { initPool, getPoolStatus } from "./key-pool.js";
import { initSemaphore, semaphore } from "./semaphore.js";
import { handleChatCompletions, handleModels } from "./proxy.js";

export function startServer(): void {
  const config = loadConfig();
  initPool();
  initSemaphore(config.maxParallel);

  console.log(
    `[proxy] concurrency: max ${config.maxParallel} parallel requests`,
  );

  const app = new Hono();

  app.use("*", cors());
  app.use("*", logger());

  app.get("/v1/models", handleModels);
  app.post("/v1/chat/completions", handleChatCompletions);

  app.get("/", (c) =>
    c.json({
      status: "ok",
      upstream: config.upstreamBaseURL,
      concurrency: semaphore().status,
      pool: getPoolStatus(),
    }),
  );

  const server = serve({ fetch: app.fetch, port: config.port });

  console.log(
    `[proxy] listening :${config.port} → ${config.upstreamBaseURL} | ${config.apiKeys.length} key(s) loaded`,
  );

  function shutdown() {
    console.log("\n[proxy] shutting down...");
    const raw = server as unknown as { closeAllConnections?: () => void };
    raw.closeAllConnections?.();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
