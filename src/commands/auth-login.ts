import * as p from "@clack/prompts";
import pc from "picocolors";
import { saveCredentials } from "../credentials.js";

export async function authLoginAction(): Promise<void> {
  p.intro(pc.bgCyan(pc.black(" coding-plan-pro-max auth ")));

  const upstreamBaseURL = await p.text({
    message: "Enter your upstream API base URL",
    placeholder: "https://api.example.com/v4",
    validate: (v) => {
      if (!v) return "URL is required";
      try {
        new URL(v);
      } catch {
        return "Invalid URL format";
      }
    },
  });

  if (p.isCancel(upstreamBaseURL)) {
    p.cancel("Cancelled");
    process.exit(0);
  }

  const rawKeys = await p.text({
    message: "Enter API keys (comma-separated for multiple)",
    placeholder: "key1,key2,key3",
    validate: (v) => {
      if (!v || v.trim().length === 0) return "At least one API key is required";
      const keys = v.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
      if (keys.length === 0) return "No valid keys found";
    },
  });

  if (p.isCancel(rawKeys)) {
    p.cancel("Cancelled");
    process.exit(0);
  }

  const apiKeys = rawKeys.split(",").map((s) => s.trim()).filter((s) => s.length > 0);

  const s = p.spinner();
  s.start("Verifying connection...");

  try {
    const url = (upstreamBaseURL as string).replace(/\/+$/, "");
    const res = await fetch(`${url}/models`, {
      headers: { Authorization: `Bearer ${apiKeys[0]}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      s.stop("Connection failed");
      p.outro(pc.red(`Upstream returned HTTP ${res.status}`));
      process.exit(1);
    }

    const body = (await res.json()) as { data?: Array<{ id: string }> };
    const modelCount = body.data?.length ?? 0;
    s.stop(`Connected! ${modelCount} model(s) available.`);
  } catch (err) {
    s.stop("Connection failed");
    p.outro(pc.red(`Could not reach upstream: ${String(err)}`));
    process.exit(1);
  }

  saveCredentials({
    upstreamBaseURL: (upstreamBaseURL as string).replace(/\/+$/, ""),
    apiKeys,
  });

  p.outro(pc.green(`Saved ${apiKeys.length} key(s). Run ${pc.bold("coding-plan-pro-max start")} to begin.`));
}
