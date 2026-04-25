import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const APP_DIR = "coding-plan-pro-max";
const CREDENTIALS_FILE = "credentials";

export interface StoredCredentials {
  upstreamBaseURL: string;
  apiKeys: string[];
}

function configDir(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg ? xdg : join(homedir(), ".config");
  return join(base, APP_DIR);
}

function credentialsPath(): string {
  return join(configDir(), CREDENTIALS_FILE);
}

export function loadCredentials(): StoredCredentials | null {
  const filePath = credentialsPath();
  if (!existsSync(filePath)) return null;

  try {
    const raw = readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw) as StoredCredentials;

    if (!data.upstreamBaseURL || !Array.isArray(data.apiKeys) || data.apiKeys.length === 0) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

export function saveCredentials(creds: StoredCredentials): void {
  const dir = configDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  const filePath = credentialsPath();
  writeFileSync(filePath, JSON.stringify(creds, null, 2) + "\n", {
    mode: 0o600,
    encoding: "utf-8",
  });
}

export function clearCredentials(): boolean {
  const filePath = credentialsPath();
  if (!existsSync(filePath)) return false;

  unlinkSync(filePath);
  return true;
}

export function credentialsExist(): boolean {
  return existsSync(credentialsPath());
}
