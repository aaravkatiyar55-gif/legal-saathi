import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

async function main() {
  const migrationPath = path.resolve(
    process.cwd(),
    "..",
    "database",
    "review-only",
    "009_auth_session_store.sql",
  );
  const sql = (await readFile(migrationPath, "utf8")).toLowerCase();

  const requiredColumns = [
    "token_hash",
    "email",
    "display_name",
    "avatar_url",
    "provider",
    "google_subject",
    "csrf_token",
    "created_at",
    "last_seen_at",
    "expires_at",
    "revoked_at",
    "consent_version",
    "consented_at",
    "language",
    "provider_session_sealed",
    "reauthenticated_at",
  ];

  assert.match(sql, /create table if not exists public\.legal_sathi_sessions/);
  for (const column of requiredColumns) {
    assert.match(sql, new RegExp(`\\b${column}\\b`), `missing session column: ${column}`);
  }
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on table public\.legal_sathi_sessions from anon, authenticated/);
  assert.match(sql, /grant all on table public\.legal_sathi_sessions to service_role/);
  assert.match(sql, /where revoked_at is null/);

  console.log("Production auth session schema contract: PASS");
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Session schema test failed");
  process.exitCode = 1;
});
