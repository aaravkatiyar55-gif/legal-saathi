import { cpSync, existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import nextEnv from "@next/env";

const projectRoot = path.resolve(import.meta.dirname, "..");
nextEnv.loadEnvConfig(projectRoot, false, { info: () => undefined, error: () => undefined });
const standaloneRoot = path.join(projectRoot, ".next", "standalone");
const serverPath = path.join(standaloneRoot, "server.js");

if (!existsSync(serverPath)) {
  console.error("Production build output is missing. Run npm run build:web first.");
  process.exit(1);
}

if (existsSync(path.join(projectRoot, "public"))) {
  cpSync(path.join(projectRoot, "public"), path.join(standaloneRoot, "public"), { recursive: true });
}
if (existsSync(path.join(projectRoot, ".next", "static"))) {
  cpSync(path.join(projectRoot, ".next", "static"), path.join(standaloneRoot, ".next", "static"), { recursive: true });
}

const child = spawn(process.execPath, [serverPath], {
  cwd: standaloneRoot,
  env: {
    ...process.env,
    NODE_ENV: "production",
    HOSTNAME: process.env.HOSTNAME || "0.0.0.0",
    PORT: process.env.PORT || "3001",
  },
  stdio: "inherit",
});

const forwardSignal = (signal) => {
  if (!child.killed) child.kill(signal);
};
process.once("SIGINT", () => forwardSignal("SIGINT"));
process.once("SIGTERM", () => forwardSignal("SIGTERM"));
child.once("exit", (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1);
});
