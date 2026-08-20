import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const migrationPath = path.resolve(
  __dirname,
  "../../../../database/migrations/20260728_consent_evidence_production.sql",
);
const migration = readFileSync(migrationPath, "utf8");

assert.match(migration, /normalized_email text/i);
assert.match(migration, /accepted boolean not null default true/i);
assert.match(migration, /terms_content_hash_sha256 text/i);
assert.match(migration, /privacy_content_hash_sha256 text/i);
assert.match(migration, /request_id text/i);
assert.match(migration, /before update or delete/i);
assert.match(migration, /consent events are immutable/i);
assert.doesNotMatch(migration, /\bdrop table\b/i);
assert.doesNotMatch(migration, /\btruncate\b/i);

process.stdout.write("Consent evidence migration contract passed: 9/9\n");
