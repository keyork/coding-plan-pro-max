import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import { loadConfig } from "./config.js";
import { initPool, getPoolStatus, healthCheck } from "./key-pool.js";
import { initSemaphore, semaphore } from "./semaphore.js";
import { handleChatCompletions, handleModels } from "./proxy.js";
import { log, banner, fmtMs } from "./log.js";
import pc from "picocolors";

export function startServer(): void {
  const config = loadConfig();
  initPool();
  initSemaphore(config.maxParallel);

  log.info("proxy", `Running health check against ${config.upstreamBaseURL}...`);
  healthCheck(config.upstreamBaseURL).then(() => {
    log.info("proxy", "Health check complete");
  });

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

  banner([
    pc.bold(pc.cyan("  coding-plan-pro-max")),
    "",
    `  ${pc.green("➜")}  ${pc.bold("Local:")}   http://localhost:${config.port}`,
    `  ${pc.green("➜")}  ${pc.bold("Upstream:")} ${config.upstreamBaseURL}`,
    `  ${pc.green("➜")}  ${pc.bold("Keys:")}     ${pc.yellow(config.apiKeys.length)} key(s) loaded`,
    `  ${pc.green("➜")}  ${pc.bold("Mode:")}     ${config.keyMode === "squeeze" ? pc.red("squeeze (drain one before next)") : pc.blue("round-robin")}`,
    `  ${pc.green("➜")}  ${pc.bold("Workers:")}  ${config.maxParallel} parallel max`,
    `  ${pc.green("➜")}  ${pc.bold("Cooldown:")} ${fmtMs(config.cooldownMs)}`,
  ]);

  function shutdown() {
    log.info("proxy", "Shutting down...");
    const raw = server as unknown as { closeAllConnections?: () => void };
    raw.closeAllConnections?.();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
