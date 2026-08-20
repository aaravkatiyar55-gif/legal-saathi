import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as ts from "typescript";

import { LEGAL_DOCUMENT_CATEGORIES, getCategorySourceLabel } from "../documentCategories";
import { hi } from "./hi";
import { hinglish } from "./hinglish";

// These components contain the public/legal-workspace paths a reviewer can
// reach. Any literal passed through the legacy t() helper must stay covered
// until that caller moves to a typed app-copy key.
const reviewerVisibleComponents = [
  "components/RoleSelection.tsx",
  "components/LegalAiWorkspace.tsx",
  "components/AnalysisPage.tsx",
  "components/AttachmentMenu.tsx",
  "components/RequestControls.tsx",
  "components/Sidebar.tsx",
  "components/CaseHub.tsx",
  "components/CaseWorkspace.tsx",
] as const;

const literalTranslatorCall = /\bt\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g;
const entries = new Map<string, string[]>();
const deliberatelyVerbatimHindiTerms = new Set(["Legal Saathi"]);
const allowedStaticReviewerText = new Set([
  "Legal Saathi",
  "by inceptionaistudios",
  "inceptionaistudios@gmail.com",
]);
const translatedAttributeNames = new Set(["aria-label", "aria-description", "title", "placeholder", "alt"]);
const caseTypeLabels = ["Litigation", "Corporate", "Real Estate", "Intellectual Property", "Other"] as const;
const categorySourceLabels = ["manual", "rule", "ai", undefined] as const;
const hindiCatalog = hi as Record<string, string>;
const untranslatedStaticUi: string[] = [];

for (const component of reviewerVisibleComponents) {
  const source = readFileSync(resolve(process.cwd(), component), "utf8");
  for (const match of source.matchAll(literalTranslatorCall)) {
    const text = JSON.parse(`"${match[1]}"`) as string;
    const current = entries.get(text) ?? [];
    current.push(component);
    entries.set(text, current);
  }

  const sourceFile = ts.createSourceFile(component, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      const text = node.getText(sourceFile).replace(/\s+/g, " ").trim();
      const isHtmlEntity = /^&[a-z]+;$/i.test(text);
      if (/[A-Za-z\u0900-\u097F]/.test(text) && !isHtmlEntity && !allowedStaticReviewerText.has(text)) {
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
        untranslatedStaticUi.push(`${component}:${line} text=${JSON.stringify(text)}`);
      }
    }

    if (
      ts.isJsxAttribute(node)
      && ts.isIdentifier(node.name)
      && translatedAttributeNames.has(node.name.text)
      && node.initializer
      && ts.isStringLiteral(node.initializer)
      && /[A-Za-z\u0900-\u097F]/.test(node.initializer.text)
      && !allowedStaticReviewerText.has(node.initializer.text)
    ) {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
      untranslatedStaticUi.push(`${component}:${line} ${node.name.text}=${JSON.stringify(node.initializer.text)}`);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
}

assert.ok(entries.size > 0, "reviewer-visible components must keep localization coverage");
assert.deepEqual(
  untranslatedStaticUi,
  [],
  `Reviewer-facing static UI must use translated copy rather than raw text. Found: ${untranslatedStaticUi.join(", ")}`,
);

let assertions = 2;
for (const [text, components] of entries) {
  const origin = components.join(", ");
  assert.equal(Object.hasOwn(hi, text), true, `Hindi catalog is missing reviewer-visible copy from ${origin}: ${text}`);
  assert.equal(Object.hasOwn(hinglish, text), true, `Hinglish catalog is missing reviewer-visible copy from ${origin}: ${text}`);
  assertions += 2;
  if (!deliberatelyVerbatimHindiTerms.has(text)) {
    assert.notEqual(hindiCatalog[text], text, `Hindi must not silently retain reviewer-visible English copy from ${origin}: ${text}`);
    assertions += 1;
  }
}

for (const text of new Set([...caseTypeLabels, ...LEGAL_DOCUMENT_CATEGORIES, ...categorySourceLabels.map(getCategorySourceLabel)])) {
  assert.equal(Object.hasOwn(hi, text), true, `Hindi catalog is missing a dynamic case-system label: ${text}`);
  assert.equal(Object.hasOwn(hinglish, text), true, `Hinglish catalog is missing a dynamic case-system label: ${text}`);
  assert.notEqual(hindiCatalog[text], text, `Hindi must not silently retain a dynamic case-system label: ${text}`);
  assertions += 3;
}

const caseHub = readFileSync(resolve(process.cwd(), "components/CaseHub.tsx"), "utf8");
const caseWorkspace = readFileSync(resolve(process.cwd(), "components/CaseWorkspace.tsx"), "utf8");
assert.match(caseHub, /t\(caseItem\.typeTag \?\? "Case"\)/, "CaseHub must localize dynamic case types");
assert.match(caseWorkspace, /t\(caseData\.typeTag \?\? "Case workspace"\)/, "CaseWorkspace must localize dynamic case types");
assert.match(caseWorkspace, /t\(folder\.category\)/, "CaseWorkspace must localize folder labels");
assert.match(caseWorkspace, /\{t\(category\)\}/, "CaseWorkspace must localize category options");
assert.match(caseWorkspace, /t\(getCategorySourceLabel\(selectedDocument\.categorySource\)\)/, "CaseWorkspace must localize category-source labels");
assert.match(caseWorkspace, /<small>\{t\(selectedDocument\.caseCategory \?\? "Other"\)\} \| \{getPreviewLabel\(selectedDocument\.previewKind\)\}<\/small>/, "CaseWorkspace must localize the selected-document category summary");
assertions += 6;

console.info(`Reviewer-visible t() localization: PASS ${assertions}/${assertions}`);
