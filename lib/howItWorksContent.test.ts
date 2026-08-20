import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { appLanguages } from "@/lib/i18n";
import { getHowItWorksContent } from "@/lib/howItWorksContent";

let assertions = 0;
const truthy = (value: unknown, message: string) => {
  assert.ok(value, message);
  assertions += 1;
};
const different = (actual: string, expected: string, message: string) => {
  assert.notEqual(actual, expected, message);
  assertions += 1;
};

const english = getHowItWorksContent("en");
for (const language of appLanguages) {
  const content = getHowItWorksContent(language);
  truthy(content.kicker, `${language} guide needs a kicker`);
  truthy(content.title, `${language} guide needs a title`);
  truthy(content.summary, `${language} guide needs a summary`);
  truthy(content.stepsHeading, `${language} guide needs a step heading`);
  assert.equal(content.steps.length, 4, `${language} guide must keep a four-step first-use journey`);
  assertions += 1;
  for (const step of content.steps) {
    truthy(step.title, `${language} guide step needs a title`);
    truthy(step.description, `${language} guide step needs a description`);
  }
  assert.ok(content.publicItems.length >= 3, `${language} guide must identify public exploration honestly`);
  assertions += 1;
  assert.ok(content.accountItems.length >= 3, `${language} guide must distinguish account/configuration features`);
  assertions += 1;
  truthy(content.example, `${language} guide needs a fictional example`);
  truthy(content.urgentNotice, `${language} guide needs urgent escalation guidance`);
}

different(getHowItWorksContent("hi").title, english.title, "Hindi guide title must not silently fall back to English");
different(getHowItWorksContent("hinglish").title, english.title, "Hinglish guide title must not silently fall back to English");

const guideComponent = readFileSync(new URL("../components/PublicDemoGuide.tsx", import.meta.url), "utf8");
const roleSelection = readFileSync(new URL("../components/RoleSelection.tsx", import.meta.url), "utf8");
const guidePage = readFileSync(new URL("../app/how-it-works/page.tsx", import.meta.url), "utf8");

assert.match(guideComponent, /appLanguageFromSearch\(window\.location\.search\)/, "direct guide URLs must restore only an allowlisted locale");
assertions += 1;
assert.match(guideComponent, /syncDocumentLanguage\(language\)/, "guide language must be announced semantically");
assertions += 1;
assert.match(guideComponent, /publicLanguageHref\("\/terms", language\)/, "guide policy links must preserve locale");
assertions += 1;
assert.match(roleSelection, /publicLanguageHref\("\/how-it-works", language\)/, "landing page must expose the guide without losing locale");
assertions += 1;
assert.match(guidePage, /PublicDemoGuide/, "the public how-it-works route must render the guide");
assertions += 1;
assert.match(guidePage, /searchParams/, "direct guide URLs must supply their locale during server rendering");
assertions += 1;
assert.match(guidePage, /isAppLanguage\(requestedLanguage\)/, "server-rendered guide locales must remain allowlisted");
assertions += 1;

console.info(`How-it-works guide contract: PASS ${assertions}/${assertions}`);
