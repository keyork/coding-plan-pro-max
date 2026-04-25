import * as p from "@clack/prompts";
import pc from "picocolors";
import { clearCredentials, credentialsExist } from "../credentials.js";

export async function authLogoutAction(): Promise<void> {
  if (!credentialsExist()) {
    p.outro(pc.yellow("No credentials found. Already logged out."));
    return;
  }

  const confirm = await p.confirm({
    message: "Remove saved credentials?",
  });

  if (p.isCancel(confirm) || !confirm) {
    p.outro("Cancelled.");
    return;
  }

  clearCredentials();
  p.outro(pc.green("Credentials removed."));
}
