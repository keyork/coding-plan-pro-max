import * as p from "@clack/prompts";
import pc from "picocolors";
import { loadCredentials, credentialsExist } from "../credentials.js";

export async function authStatusAction(): Promise<void> {
  p.intro(pc.bgCyan(pc.black(" coding-plan-pro-max status ")));

  if (!credentialsExist()) {
    p.outro(pc.yellow("Not authenticated. Run `coding-plan-pro-max auth login` to begin."));
    return;
  }

  const creds = loadCredentials();
  if (!creds) {
    p.outro(pc.red("Credentials file is corrupted. Run `coding-plan-pro-max auth login` to re-authenticate."));
    return;
  }

  p.log.info(`Upstream: ${pc.cyan(creds.upstreamBaseURL)}`);
  p.log.info(`API keys: ${pc.green(String(creds.apiKeys.length))} key(s) configured`);

  for (let i = 0; i < creds.apiKeys.length; i++) {
    const key = creds.apiKeys[i];
    const masked = key.length > 12
      ? key.slice(0, 6) + "..." + key.slice(-4)
      : "****";
    p.log.message(`  key ${i}: ${pc.dim(masked)}`);
  }

  const s = p.spinner();
  s.start("Checking connection...");

  try {
    const res = await fetch(`${creds.upstreamBaseURL}/models`, {
      headers: { Authorization: `Bearer ${creds.apiKeys[0]}` },
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      const body = (await res.json()) as { data?: Array<{ id: string }> };
      const models = body.data?.map((m) => m.id) ?? [];
      s.stop(`Connection OK — ${models.length} model(s) available`);
      p.log.message(`  Models: ${pc.dim(models.slice(0, 5).join(", "))}${models.length > 5 ? " ..." : ""}`);
    } else {
      s.stop(`Connection returned HTTP ${res.status}`);
    }
  } catch (err) {
    s.stop(`Connection failed: ${String(err)}`);
  }

  p.outro("Done.");
}
