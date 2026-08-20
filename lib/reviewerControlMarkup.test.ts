import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as ts from "typescript";

// Reviewer-facing controls must not inherit HTML's implicit submit behaviour.
// Explicit types make a button safe if its surrounding layout later becomes a
// form, while preserving the deliberate submit controls already in the app.
const reviewerFacingComponents = [
  "components/RoleSelection.tsx",
  "components/LegalAiWorkspace.tsx",
  "components/AnalysisPage.tsx",
  "components/AttachmentMenu.tsx",
  "components/RequestControls.tsx",
  "components/Sidebar.tsx",
  "components/CaseHub.tsx",
  "components/CaseWorkspace.tsx",
  "components/ProductPricingModal.tsx",
  "components/HelpModal.tsx",
  "components/AppErrorProvider.tsx",
  "components/DictationControl.tsx",
  "components/CreateCaseModal.tsx",
  "components/SettingsModal.tsx",
  "components/AuthModal.tsx",
] as const;

const missingTypes: string[] = [];
let buttonCount = 0;

for (const component of reviewerFacingComponents) {
  const source = readFileSync(resolve(process.cwd(), component), "utf8");
  const sourceFile = ts.createSourceFile(component, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(sourceFile) === "button") {
      buttonCount += 1;
      const hasExplicitType = node.attributes.properties.some((attribute) => (
        ts.isJsxAttribute(attribute) && ts.isIdentifier(attribute.name) && attribute.name.text === "type"
      ));

      if (!hasExplicitType) {
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
        missingTypes.push(`${component}:${line}`);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
}

assert.deepEqual(
  missingTypes,
  [],
  `Every reviewer-facing <button> needs an explicit type attribute. Missing: ${missingTypes.join(", ")}`,
);

console.info(`Reviewer control markup: PASS ${buttonCount}/${buttonCount}`);
