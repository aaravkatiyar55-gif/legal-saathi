import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), "utf8");
const translator = source("components/InterfaceTranslator.tsx");
const analysis = source("components/AnalysisPage.tsx");
const caseWorkspace = source("components/CaseWorkspace.tsx");
const caseHub = source("components/CaseHub.tsx");
const sidebar = source("components/Sidebar.tsx");

assert.match(translator, /\[data-no-i18n\]/, "the translator must honor an explicit user-content boundary");
assert.match(analysis, /<h1 data-no-i18n>\{document\.name\}<\/h1>/, "chat/document titles must stay verbatim");
assert.match(analysis, /<p data-no-i18n>\{message\.text\}<\/p>/, "user messages must stay verbatim");
assert.match(analysis, /className="legal-source-card-title" data-no-i18n/, "citation titles must stay verbatim");
assert.match(analysis, /<span data-no-i18n>\{attachedFile\.name\}<\/span>/, "attachment names must stay verbatim");
assert.match(caseWorkspace, /className="case-annotation-text"\s+data-no-i18n/, "document annotation text must stay verbatim");
assert.match(caseWorkspace, /className="case-document-text-preview" data-no-i18n/, "document preview text must stay verbatim");
assert.match(caseWorkspace, /<h1 data-no-i18n>\{caseData\.name\}<\/h1>/, "case names must stay verbatim");
assert.match(caseWorkspace, /<span data-no-i18n>\{selectedDocument\.name\}<\/span>/, "selected document names must stay verbatim");
assert.match(caseWorkspace, /\{t\("plus conversation memory in"\)\} <span data-no-i18n>\{caseData\.name\}<\/span>/, "case names in the question summary must stay verbatim");
assert.match(caseWorkspace, /selectedDocument \? <span data-no-i18n>\{selectedDocument\.name\}<\/span> : t\("Choose a document from the case tree"\)/, "selected-document names in the question summary must stay verbatim");
assert.match(caseWorkspace, /<p data-no-i18n>\{message\.text\}<\/p>/, "stored case conversation text must stay verbatim");
assert.match(caseWorkspace, /<h3 data-no-i18n>\{block\.heading\}<\/h3>/, "agent result headings must stay verbatim");
assert.match(caseWorkspace, /<li data-no-i18n key=\{`\$\{block\.heading\}-\$\{index\}`\}>\{line\}<\/li>/, "agent result text must stay verbatim");
assert.match(caseWorkspace, /<p data-no-i18n>\{documentQuestion\.text\}<\/p>/, "saved case questions must stay verbatim");
assert.match(caseWorkspace, /className="case-question-answer" data-no-i18n>\{documentQuestion\.response\}/, "case answers must stay verbatim");
assert.match(caseWorkspace, /className="case-question-answer error" data-no-i18n>\{documentQuestion\.errorMessage\}/, "case failure details must stay verbatim");
assert.match(caseHub, /<h2 data-no-i18n>\{caseItem\.name\}<\/h2>/, "case hub names must stay verbatim");
assert.match(caseHub, /className="case-hub-client" data-no-i18n>\{caseItem\.clientName\}/, "case client names must stay verbatim");
assert.match(caseHub, /<span data-no-i18n>\{lastDeletedCase\.name\}<\/span>/, "deleted-case names must stay verbatim");
assert.match(sidebar, /<span data-no-i18n>\{document\.name\}<\/span>/, "sidebar chat names must stay verbatim");

console.info("User-content localization protection: PASS 21/21");
