import { execFileSync, spawnSync } from "node:child_process";
import { access, copyFile, lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generatedManifestName = "PUBLIC_SOURCE_MANIFEST.json";

const allowlist = [
  [".gitignore", ".gitignore"],
  ["LICENSE", "LICENSE"],
  ["README.md", "README.md"],
  ["eslint.config.mjs", "eslint.config.mjs"],
  ["next.config.ts", "next.config.ts"],
  ["package.json", "package.json"],
  ["package-lock.json", "package-lock.json"],
  ["tsconfig.json", "tsconfig.json"],
  ["app", "app"],
  ["components", "components"],
  ["lib", "lib"],
  ["backend/package.json", "backend/package.json"],
  ["backend/package-lock.json", "backend/package-lock.json"],
  ["backend/tsconfig.json", "backend/tsconfig.json"],
  ["backend/src", "backend/src"],
  ["backend/legal-knowledge", "backend/legal-knowledge"],
  ["scripts/dev.mjs", "scripts/dev.mjs"],
  ["scripts/start-production.mjs", "scripts/start-production.mjs"],
  ["scripts/verify-public-source-package.mjs", "scripts/verify-public-source-package.mjs"],
  ["docs/ARCHITECTURE.md", "docs/ARCHITECTURE.md"],
  ["docs/PUBLIC_SOURCE_AUDIT.md", "docs/PUBLIC_SOURCE_AUDIT.md"],
  ["docs/PUBLIC_SOURCE_PACKAGE.md", "docs/PUBLIC_SOURCE_PACKAGE.md"],
  ["docs/THIRD_PARTY_ATTRIBUTION.md", "docs/THIRD_PARTY_ATTRIBUTION.md"],
];

const forbiddenSegments = new Set([
  ".env",
  ".git",
  ".next",
  ".vercel",
  "database",
  "node_modules",
  "qa",
  "release-evidence",
  "security-audit",
  ".local",
  ".rag",
  ".runtime",
]);

const forbiddenExactNames = new Set(["render.yaml", "dockerfile"]);
const secretMarkers = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
  /\bAIza[A-Za-z0-9_-]{20,}\b/,
  /\brzp_live_[A-Za-z0-9_-]{12,}\b/,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
];

function usage() {
  return "Usage: node scripts/verify-public-source-package.mjs --check | --prepare <empty-output-directory> | --verify <package-directory>";
}

function relativePath(absolutePath, root) {
  return path.relative(root, absolutePath).split(path.sep).join("/");
}

function assertSafeRelativePath(value) {
  const parts = value.split("/").filter(Boolean);
  if (parts.some((part) => forbiddenSegments.has(part) || part.startsWith(".env"))) {
    throw new Error(`Forbidden path segment in public source candidate: ${value}`);
  }
  if (parts.some((part) => forbiddenExactNames.has(part.toLowerCase()))) {
    throw new Error(`Forbidden deployment file in public source candidate: ${value}`);
  }
}

async function pathExists(target) {
  try {
    await access(target, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function filesUnder(root) {
  const entry = await lstat(root);
  if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not allowed in a public source package: ${root}`);
  if (entry.isFile()) return [root];

  const children = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const child of children) {
    const childPath = path.join(root, child.name);
    if (child.isSymbolicLink()) throw new Error(`Symbolic links are not allowed in a public source package: ${childPath}`);
    if (child.isDirectory()) files.push(...await filesUnder(childPath));
    else if (child.isFile()) files.push(childPath);
  }
  return files;
}

async function expectedPackageFiles() {
  const expected = new Map();
  for (const [source, destination] of allowlist) {
    const sourcePath = path.join(repositoryRoot, source);
    if (!(await pathExists(sourcePath))) throw new Error(`Allowlisted source is missing: ${source}`);

    const sourceInfo = await lstat(sourcePath);
    const sourceFiles = await filesUnder(sourcePath);
    for (const file of sourceFiles) {
      const relativeToSource = sourceInfo.isFile() ? "" : relativePath(file, sourcePath);
      const destinationFile = relativeToSource ? `${destination}/${relativeToSource}` : destination;
      assertSafeRelativePath(destinationFile);
      expected.set(destinationFile, file);
    }
  }
  return expected;
}

async function inspectFiles(files, root) {
  for (const file of files) {
    const relative = relativePath(file, root);
    assertSafeRelativePath(relative);
    const content = await readFile(file, "utf8").catch(() => null);
    if (content === null) continue;
    if (secretMarkers.some((marker) => marker.test(content))) {
      throw new Error(`A likely credential marker was found in ${relative}. The value is intentionally not displayed.`);
    }
  }
}

function workingTreeIsClean() {
  const unstaged = spawnSync("git", ["diff", "--quiet"], { cwd: repositoryRoot, stdio: "ignore" });
  const staged = spawnSync("git", ["diff", "--cached", "--quiet"], { cwd: repositoryRoot, stdio: "ignore" });
  return unstaged.status === 0 && staged.status === 0;
}

function currentRevision() {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).trim();
}

async function checkSource() {
  const expected = await expectedPackageFiles();
  await inspectFiles([...expected.values()], repositoryRoot);
  process.stdout.write(`Public-source allowlist check passed: ${expected.size} files are eligible for a clean candidate.\n`);
}

async function prepare(outputArgument) {
  if (!outputArgument) throw new Error(usage());
  if (!workingTreeIsClean()) {
    throw new Error("Refusing to assemble from an uncommitted working tree. Commit a reviewed release first so the public package has a truthful source revision.");
  }

  const outputRoot = path.resolve(repositoryRoot, outputArgument);
  if (await pathExists(outputRoot)) throw new Error(`Refusing to overwrite existing package directory: ${outputRoot}`);

  const expected = await expectedPackageFiles();
  await inspectFiles([...expected.values()], repositoryRoot);
  for (const [destination, source] of expected) {
    const outputFile = path.join(outputRoot, destination);
    await mkdir(path.dirname(outputFile), { recursive: true });
    await copyFile(source, outputFile);
  }

  const manifest = {
    format: 1,
    sourceRevision: currentRevision(),
    sourceTree: "clean",
    files: [...expected.keys()].sort(),
    generatedAt: new Date().toISOString(),
  };
  await writeFile(path.join(outputRoot, generatedManifestName), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await verify(outputRoot);
  process.stdout.write(`Prepared clean public-source candidate at ${outputRoot}. It has not been published.\n`);
}

async function verify(candidateRoot) {
  if (!(await pathExists(candidateRoot))) throw new Error(`Public source candidate directory does not exist: ${candidateRoot}`);
  const expected = await expectedPackageFiles();
  const candidateFiles = await filesUnder(candidateRoot);
  const candidateRelative = new Set(candidateFiles.map((file) => relativePath(file, candidateRoot)));
  const expectedRelative = new Set([...expected.keys(), generatedManifestName]);

  for (const file of candidateRelative) {
    if (!expectedRelative.has(file)) throw new Error(`Unexpected file in public source candidate: ${file}`);
  }
  for (const file of expectedRelative) {
    if (!candidateRelative.has(file)) throw new Error(`Expected file is missing from public source candidate: ${file}`);
  }

  const manifestPath = path.join(candidateRoot, generatedManifestName);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (typeof manifest.sourceRevision !== "string" || manifest.sourceRevision.length < 7) {
    throw new Error("Public source manifest is missing its source revision.");
  }
  await inspectFiles(candidateFiles, candidateRoot);
  process.stdout.write(`Public-source candidate verification passed: ${candidateFiles.length} allowlisted files, source ${manifest.sourceRevision.slice(0, 12)}.\n`);
}

const [command, argument] = process.argv.slice(2);

try {
  if (command === "--check") await checkSource();
  else if (command === "--prepare") await prepare(argument);
  else if (command === "--verify") await verify(path.resolve(repositoryRoot, argument ?? ""));
  else throw new Error(usage());
} catch (error) {
  process.stderr.write(`Public-source package check failed: ${error instanceof Error ? error.message : "Unknown error"}\n`);
  process.exitCode = 1;
}
