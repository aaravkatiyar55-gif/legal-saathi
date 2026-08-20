import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { appLanguageFromSearch, publicLanguageHref } from "./appCopy";

let assertions = 0;
const equal = <T>(actual: T, expected: T, message?: string) => {
  assert.equal(actual, expected, message);
  assertions += 1;
};
const matches = (source: string, expression: RegExp, message: string) => {
  assert.match(source, expression, message);
  assertions += 1;
};

equal(appLanguageFromSearch("?lang=hinglish"), "hinglish");
equal(appLanguageFromSearch("?lang=hi"), "hi");
equal(appLanguageFromSearch("?lang=en"), "en");
equal(appLanguageFromSearch("?lang=untrusted"), null, "only the allowlisted application locales may be restored from a public URL");
equal(publicLanguageHref("/privacy?source=help#details", "hinglish"), "/privacy?source=help&lang=hinglish#details");

const roleSelection = readFileSync(new URL("../../components/RoleSelection.tsx", import.meta.url), "utf8");
const policyPage = readFileSync(new URL("../../components/PublicPolicyPage.tsx", import.meta.url), "utf8");
const homePage = readFileSync(new URL("../../app/page.tsx", import.meta.url), "utf8");

matches(roleSelection, /publicLanguageHref\("\/terms", language\)/, "the public role journey must carry its language into Terms");
matches(roleSelection, /publicLanguageHref\("\/privacy", language\)/, "the public role journey must carry its language into Privacy");
const publicWorkspace = readFileSync(new URL("../../components/LegalAiWorkspace.tsx", import.meta.url), "utf8");
matches(publicWorkspace, /appCopy\(language, "help\.terms"\)/, "the public workspace must render its Terms label from typed copy");
matches(publicWorkspace, /appCopy\(language, "help\.privacy"\)/, "the public workspace must render its Privacy label from typed copy");
matches(policyPage, /appLanguageFromSearch\(window\.location\.search\)/, "a directly opened policy page must restore an allowlisted language from its URL");
matches(policyPage, /window\.history\.replaceState/, "changing language on a policy page must keep its public URL shareable");
matches(policyPage, /publicLanguageHref\("\/", language\)/, "policy return links must preserve the selected language");
matches(homePage, /appLanguageFromSearch\(window\.location\.search\)/, "returning to the public landing page must restore the selected language");

for (const component of ["HelpModal.tsx", "LegalAiWorkspace.tsx", "SettingsModal.tsx"]) {
  const source = readFileSync(new URL(`../../components/${component}`, import.meta.url), "utf8");
  matches(source, /publicLanguageHref/, `${component} policy links must preserve the active language`);
}

console.info(`Public language navigation: PASS ${assertions}/${assertions}`);
