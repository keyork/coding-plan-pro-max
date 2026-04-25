#!/usr/bin/env node
import { Command } from "commander";
import { authLoginAction } from "./commands/auth-login.js";
import { authLogoutAction } from "./commands/auth-logout.js";
import { authStatusAction } from "./commands/auth-status.js";
import { startAction } from "./commands/start.js";

const program = new Command()
  .name("coding-plan-pro-max")
  .description("OpenAI-compatible reverse proxy with multi-key rotation")
  .version("0.1.0");

const auth = program.command("auth").description("Manage authentication");

auth
  .command("login")
  .description("Configure upstream URL and API keys interactively")
  .action(authLoginAction);

auth
  .command("logout")
  .description("Remove saved credentials")
  .action(authLogoutAction);

auth
  .command("status")
  .description("Show current authentication status and test connection")
  .action(authStatusAction);

program
  .command("start")
  .description("Start the proxy server")
  .option("-p, --port <port>", "Override server port")
  .action(startAction);

program.parse();
