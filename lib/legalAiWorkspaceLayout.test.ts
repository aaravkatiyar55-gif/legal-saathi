import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync("app/globals.css", "utf8");
const workspaceLayout = css.match(/\.legal-ai-start\s*\{[\s\S]*?\}/)?.[0] ?? "";

assert.match(workspaceLayout, /justify-content:\s*flex-start;/);

process.stdout.write("Legal AI workspace layout contract passed: 1/1\n");
