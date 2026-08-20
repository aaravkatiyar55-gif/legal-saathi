import assert from "node:assert/strict";
import {
  getWebResearchAvailability,
  getWebResearchAvailabilityMessage,
  WEB_RESEARCH_ENVIRONMENT_UNAVAILABLE,
  WEB_RESEARCH_PLAN_STATUS_UNKNOWN,
  WEB_RESEARCH_PLAN_UNAVAILABLE,
} from "./webResearchAvailability";

assert.equal(getWebResearchAvailability(null, true), "environment_unavailable");
assert.equal(getWebResearchAvailability(false, true), "environment_unavailable");
assert.equal(getWebResearchAvailability(true, undefined), "plan_status_unknown");
assert.equal(getWebResearchAvailability(true, null), "plan_status_unknown");
assert.equal(getWebResearchAvailability(true, false), "plan_unavailable");
assert.equal(getWebResearchAvailability(true, true), "available");
assert.equal(getWebResearchAvailabilityMessage("environment_unavailable"), WEB_RESEARCH_ENVIRONMENT_UNAVAILABLE);
assert.equal(getWebResearchAvailabilityMessage("plan_status_unknown"), WEB_RESEARCH_PLAN_STATUS_UNKNOWN);
assert.equal(getWebResearchAvailabilityMessage("plan_unavailable"), WEB_RESEARCH_PLAN_UNAVAILABLE);

process.stdout.write("Web research availability tests passed: 9/9\n");
