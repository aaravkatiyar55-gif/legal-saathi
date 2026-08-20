import { spawn } from "node:child_process";

const children = [];
let stopping = false;

function start(label, args) {
  const command = process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : "npm";
  const commandArgs = process.platform === "win32"
    ? ["/d", "/s", "/c", ["npm.cmd", ...args].join(" ")]
    : args;
  const child = spawn(command, commandArgs, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  children.push(child);
  child.on("exit", (code) => {
    if (stopping) return;
    if (code !== 0) console.error(`${label} exited with code ${code}.`);
    stop(code ?? 0);
  });
}

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.killed || !child.pid) continue;
    if (process.platform === "win32") {
      const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
      });
      killer.unref();
    } else {
      child.kill("SIGTERM");
    }
  }
  setTimeout(() => process.exit(exitCode), 700).unref();
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

start("Legal Saathi backend", ["--prefix", "backend", "run", "dev"]);
start("Legal Saathi website", ["run", "dev:web"]);
