import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import path from "node:path";

async function main() {
  Object.assign(process.env, {
    NODE_ENV: "production",
    ADMIN_SESSION_SECRET: "synthetic-admin-session-secret-32-characters-minimum",
    GOOGLE_CLIENT_ID: "synthetic.apps.googleusercontent.com",
  });

  const {
    authorizedAdminEmails,
    isAuthorizedAdminEmail,
    normalizeAdminEmail,
  } = await import("../../security/adminIdentity");
  const { validateAdminPassword } = await import("./adminCredentials.service");
  const { createAdminSessionForIdentity } = await import("../../middleware/adminAccess.middleware");

  assert.deepEqual([...authorizedAdminEmails], [
    "aaravkatiyar55@gmail.com",
    "inceptionaistudios@gmail.com",
  ]);
  assert.equal(normalizeAdminEmail("  AARAVKATIYAR55@GMAIL.COM "), "aaravkatiyar55@gmail.com");
  assert.equal(isAuthorizedAdminEmail("aaravkatiyar55@gmail.com"), true);
  assert.equal(isAuthorizedAdminEmail("INCEPTIONAISTUDIOS@GMAIL.COM"), true);
  assert.equal(isAuthorizedAdminEmail("admin@example.com"), false);
  assert.equal(isAuthorizedAdminEmail("aaravkatiyar55+admin@gmail.com"), false);

  assert.equal(validateAdminPassword("Short1!"), false);
  assert.equal(validateAdminPassword("longbutnouppercase1!"), false);
  assert.equal(validateAdminPassword("LongButNoNumber!"), false);
  assert.equal(validateAdminPassword("LongEnoughPassword1!"), true);

  const baseIdentity = {
    id: "synthetic-session-id",
    csrfToken: "synthetic-csrf",
    createdAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    revokedAt: null,
    consentVersion: "synthetic",
    consentedAt: new Date().toISOString(),
    language: "en" as const,
    displayName: "Synthetic Admin",
    avatarUrl: "",
    provider: "google" as const,
  };
  assert.ok(createAdminSessionForIdentity({
    ...baseIdentity,
    email: "aaravkatiyar55@gmail.com",
  }).token);
  assert.throws(
    () => createAdminSessionForIdentity({
      ...baseIdentity,
      email: "paid-max-plan-user@example.test",
    }),
    /ADMIN_ACCESS_DENIED/,
  );
  assert.throws(
    () => createAdminSessionForIdentity({
      ...baseIdentity,
      email: "inceptionaistudios@gmail.com",
      provider: "supabase",
    }),
    /ADMIN_ACCESS_DENIED/,
  );

  const frontendRoot = path.resolve(process.cwd(), "..");
  const pageSource = await readFile(path.join(frontendRoot, "app/page.tsx"), "utf8");
  const profileSource = await readFile(path.join(frontendRoot, "components/UserProfileButton.tsx"), "utf8");
  assert.equal(pageSource.includes("keyBuffer"), false, "the hidden admin keyboard shortcut must not return");
  assert.match(pageSource, /isAdminEligible=\{isAdminEligible\}/);
  assert.match(profileSource, /isAdminEligible &&/);

  console.log("Admin authorization tests passed.");
}

void main();
