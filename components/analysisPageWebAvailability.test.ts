import assert from "node:assert/strict";
import { getAnalysisPageWebPresentation } from "./AnalysisPage";
import {
  WEB_RESEARCH_ENVIRONMENT_UNAVAILABLE,
  WEB_RESEARCH_PLAN_STATUS_UNKNOWN,
  WEB_RESEARCH_PLAN_UNAVAILABLE,
} from "../lib/webResearchAvailability";

const unknownEnvironment = getAnalysisPageWebPresentation(null, true);
assert.equal(unknownEnvironment.availability, "environment_unavailable");
assert.equal(unknownEnvironment.available, false);
assert.equal(unknownEnvironment.unavailableMessage, WEB_RESEARCH_ENVIRONMENT_UNAVAILABLE);

const unavailableEnvironment = getAnalysisPageWebPresentation(false, true);
assert.equal(unavailableEnvironment.availability, "environment_unavailable");
assert.equal(unavailableEnvironment.available, false);
assert.equal(unavailableEnvironment.unavailableMessage, WEB_RESEARCH_ENVIRONMENT_UNAVAILABLE);

const loadingPlan = getAnalysisPageWebPresentation(true, undefined);
assert.equal(loadingPlan.availability, "plan_status_unknown");
assert.equal(loadingPlan.available, false);
assert.equal(loadingPlan.unavailableMessage, WEB_RESEARCH_PLAN_STATUS_UNKNOWN);

const unavailablePlan = getAnalysisPageWebPresentation(true, false);
assert.equal(unavailablePlan.availability, "plan_unavailable");
assert.equal(unavailablePlan.available, false);
assert.equal(unavailablePlan.unavailableMessage, WEB_RESEARCH_PLAN_UNAVAILABLE);

const available = getAnalysisPageWebPresentation(true, true);
assert.equal(available.availability, "available");
assert.equal(available.available, true);
assert.equal(available.unavailableMessage, undefined);

process.stdout.write("AnalysisPage Web availability tests passed: 15/15\n");
