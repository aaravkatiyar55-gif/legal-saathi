import assert from "node:assert/strict";
import { buildLegalAgentPlan } from "./legalAgent.service";
import { classifyLegalRequest } from "./legalIntent.service";

const scenarios = [
  ["Greeting", "hello", {}, true, "responding"],
  ["Simple legal concept", "What is bail under Indian law?", {}, true, "responding"],
  ["Latest legal amendment", "What is the latest consumer law amendment?", {}, true, "searching_official_sources"],
  ["Uploaded contract summary", "Summarize this attached contract", { selectedDocumentId: "synthetic" }, true, "reviewing_document"],
  ["Compare two clauses", "Compare these attached contract clauses", { documents: [{ id: "a" }, { id: "b" }] }, true, "reviewing_document"],
  ["Question over uploaded records", "According to the uploaded records, which month and amount are marked disputed?", { documents: [{ id: "sheet" }] }, true, "reviewing_document"],
  ["Contextual case follow-up", "Confirm the disputed status in one sentence.", { caseId: "synthetic" }, true, "retrieving_case_context"],
  ["Create a legal timeline", "Create a timeline for my case", { caseId: "synthetic" }, true, "planning"],
  ["Create a case checklist", "Create a checklist for my case", { caseId: "synthetic" }, true, "planning"],
  ["Draft a notice", "Draft a legal notice", {}, false, "requesting_clarification"],
  ["Ask missing facts before drafting", "Prepare a complaint", {}, false, "requesting_clarification"],
  ["Urgent arrest query", "Police may arrest me tonight, what should I do?", {}, true, "requesting_clarification"],
  ["Web unavailable planning", "What is the latest bail notification?", {}, true, "searching_official_sources"],
  ["AI unavailable still plans", "What are consumer rights?", {}, true, "responding"],
    ["Document unavailable", "Review this uploaded agreement", {}, false, "requesting_clarification"],
    ["Chat workspace is not a document", "Review this uploaded agreement", { documentId: "chat-workspace" }, false, "requesting_clarification"],
  ["Case context missing", "What should I do in my case?", {}, false, "requesting_clarification"],
  ["Conflicting sources", "What is the latest consumer rule?", { sourcesConflict: true }, true, "validating_citations"],
] as const;

for (const [name, message, context, canProceed, state] of scenarios) {
  const decision = classifyLegalRequest(message, {
    hasPriorConversation: false,
    hasCaseContext: "caseId" in context,
  });
  const plan = buildLegalAgentPlan({ message, decision, context });
  assert.equal(plan.canProceed, canProceed, `${name}: canProceed`);
  assert.equal(plan.state, state, `${name}: state`);
  assert.ok(plan.publicStatus.length > 0, `${name}: public status`);
}

const externalAction = buildLegalAgentPlan({
  message: "Submit this complaint to the court",
  decision: classifyLegalRequest("Submit this complaint to the court"),
});
assert.equal(externalAction.requiresConfirmation, false);
assert.equal(externalAction.state, "responding");
assert.equal(externalAction.canProceed, true);

for (const [message, language] of [
  ["How do I file a consumer complaint?", "en"],
  ["Kya main legal notice bhej sakta hoon?", "hinglish"],
  ["उपभोक्ता शिकायत कैसे दर्ज करूं?", "hi"],
] as const) {
  const plan = buildLegalAgentPlan({
    message,
    decision: classifyLegalRequest(message),
    context: { language },
  });
  assert.equal(plan.canProceed, true, `${language} procedural question should reach legal preparation`);
  assert.equal(plan.requiresConfirmation, false, `${language} procedural question must not look like an executable action`);
}

for (const message of [
  "I paid a seller for a service but they stopped replying. What can I do?",
  "Maine ek online order ke paise diye lekin samaan nahi mila, ab kya karun?",
  "मैंने किसी को काम के लिए पैसे दिए, लेकिन वह जवाब नहीं दे रहा है, मैं क्या करूँ?",
]) {
  const plan = buildLegalAgentPlan({ message, decision: classifyLegalRequest(message) });
  assert.equal(plan.canProceed, true, `plausible legal situation must reach safe legal assistance: ${message}`);
  assert.notEqual(plan.state, "requesting_clarification", `plausible legal situation must not receive a generic clarification: ${message}`);
}

for (const message of [
  "I gave an advance and now they refuse to return it.",
  "My boss keeps delaying the dues owed to me.",
  "Someone is stopping me from meeting my child.",
  "A person has used my identity without permission.",
  "Maine advance diya tha, ab woh wapas nahi de raha.",
  "Mere boss mere dues rok rahe hain.",
  "Mujhe apne bacche se milne nahi diya ja raha hai.",
  "Kisi ne meri pehchan ka galat use kiya hai.",
  "मैंने एडवांस दिया था, अब वह वापस नहीं कर रहा है।",
  "मेरा बॉस मेरा बकाया रोक रहा है।",
  "मुझे अपने बच्चे से मिलने नहीं दिया जा रहा है।",
  "किसी ने मेरी पहचान का गलत इस्तेमाल किया है।",
]) {
  const plan = buildLegalAgentPlan({ message, decision: classifyLegalRequest(message) });
  assert.equal(plan.canProceed, true, `natural-language legal situation must reach safe legal assistance: ${message}`);
  assert.notEqual(plan.state, "requesting_clarification", `natural-language legal situation must not receive a generic clarification: ${message}`);
}

const timeline = buildLegalAgentPlan({
  message: "Create a timeline for my case",
  decision: classifyLegalRequest("Create a timeline for my case"),
  context: { caseId: "synthetic" },
});
assert.deepEqual(timeline.toolSummaries, ["case_context", "timeline_creation"]);

const memory = buildLegalAgentPlan({
  message: "What did I say earlier?",
  decision: classifyLegalRequest("What did I say earlier?", { hasPriorConversation: true }),
});
assert.deepEqual(memory.toolSummaries, ["chat_context"]);

const completedHinglish = buildLegalAgentPlan({
  message: "POCSO Act kya hota hai?",
  decision: classifyLegalRequest("POCSO Act kya hota hai?"),
  context: { language: "hinglish" },
});
assert.equal(completedHinglish.publicStatus, "Legal information taiyar hai");
assert.doesNotMatch(completedHinglish.publicStatus, /raha hoon|kar raha/i);

const completedResearch = buildLegalAgentPlan({
  message: "Latest Supreme Court bail judgment check karo",
  decision: classifyLegalRequest("Latest Supreme Court bail judgment check karo"),
  context: { language: "hinglish" },
});
assert.equal(completedResearch.publicStatus, "Official sources check ho gaye");

console.log(`Legal agent scenarios: PASS (${scenarios.length} scenarios + procedural legal-question coverage)`);
