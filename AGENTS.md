# AGENTS.md

OpenAI-compatible reverse proxy with CLI authentication. Users call `/v1/chat/completions`; the proxy injects the API key and forwards to `UPSTREAM_BASE_URL`.

## Commands

```bash
npm run dev          # dev server with hot reload (tsx watch)
npm run build        # compile TypeScript → dist/
npm start            # run compiled CLI (node dist/index.js start)
npm run typecheck    # type-check only
./test.sh            # integration tests (needs running server)
```

## CLI

```
coding-plan-pro-max auth login    interactive setup (URL + API keys)
coding-plan-pro-max auth logout   clear credentials
coding-plan-pro-max auth status   show auth state + test connection
coding-plan-pro-max start [-p PORT]   start proxy server
```

## Config

Config resolution (highest priority first): env vars → `~/.config/coding-plan-pro-max/credentials` → `.env` → defaults.

Credentials stored at `~/.config/coding-plan-pro-max/credentials` (JSON, mode 0600). Optional: `PORT` (default 3000), `COOLDOWN_MS` (default 18000000 = 5h).

## Architecture

Source files:

- `src/index.ts` — CLI entry (commander), routes to subcommands
- `src/credentials.ts` — read/write credential file (XDG path, chmod 600)
- `src/config.ts` — config loading with fallback chain
- `src/server.ts` — Hono app, CORS, routes, graceful shutdown
- `src/key-pool.ts` — round-robin key selection, cooldown tracking
- `src/proxy.ts` — request handlers with validation, retry, SSE pipe
- `src/commands/auth-login.ts` — interactive auth with @clack/prompts
- `src/commands/auth-logout.ts` — clear credentials
- `src/commands/auth-status.ts` — show pool status + test connection
- `src/commands/start.ts` — start server command

## Key Pool

`API_KEY=key1,key2,key3` — comma-separated. On quota error (429 or 403 with quota keywords), the current key is cooled down for `COOLDOWN_MS` and the next key is tried. Health endpoint (`GET /`) shows pool status.

## Model names

Provider prefix is auto-stripped: `provider/model-name` → `model-name`. Available models are fetched live from `/v1/models` (proxied from upstream).

## Error format

All errors use OpenAI-style `{ "error": { "message", "type" } }`. Input validation → 400 + `invalid_request_error`. Upstream failures → 502 + `proxy_error`. All keys exhausted → 503 + `proxy_error`.
