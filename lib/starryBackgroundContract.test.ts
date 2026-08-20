import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");

assert.match(source, /\.app-layout\s*\{[\s\S]*?isolation:\s*isolate;/);
assert.match(source, /\.app-layout\s*\{[\s\S]*?background-image:[\s\S]*?radial-gradient/);
assert.match(source, /html\[data-theme="light"\]\s+\.app-layout\s*\{[\s\S]*?background-image:\s*none;/);
console.log("Lightweight starry background contract: PASS");
