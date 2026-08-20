import assert from "node:assert/strict";

import { runVerifiedLogout } from "./authLifecycle";

async function runTests() {
  let committed = false;
  await runVerifiedLogout({
    destroySession: async () => undefined,
    commitSignedOut: () => { committed = true; },
  });
  assert.equal(committed, true);

  committed = false;
  await assert.rejects(
    runVerifiedLogout({
      destroySession: async () => { throw new Error("SERVER_LOGOUT_FAILED"); },
      commitSignedOut: () => { committed = true; },
    }),
    /SERVER_LOGOUT_FAILED/,
  );
  assert.equal(committed, false);
}

void runTests().then(() => {
  console.log("Legal Saathi verified-logout lifecycle tests passed.");
});
