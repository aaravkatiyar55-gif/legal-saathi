import { strict as assert } from "node:assert";
import {
  classifyLegalRequest,
  resolveLegalResponseLanguage,
  type LegalRequestIntent,
} from "./legalIntent.service";

const cases: Array<[string, LegalRequestIntent]> = [
  ["hello", "greeting"], ["helllo", "greeting"], ["hiii", "greeting"], ["hey", "greeting"],
  ["good morning", "greeting"], ["thank you", "greeting"], ["thanks yaar", "greeting"],
  ["namaste", "greeting"], ["namste", "greeting"], ["bhai kya haal chal?", "greeting"],
  ["kya haal hai", "greeting"], ["kya hal h", "greeting"], ["kaise ho", "greeting"],
  ["how are you?", "greeting"], ["kya scene hai?", "greeting"],
  ["hello bhai", "greeting"], ["नमस्ते", "greeting"], ["कैसे हो", "greeting"], ["आप कैसे हैं?", "greeting"],
  ["क्या हाल है", "greeting"], ["धन्यवाद", "greeting"],
  ["what can you do?", "capability_question"], ["how can you help me?", "capability_question"],
  ["kya kar sakte ho", "capability_question"], ["आप क्या कर सकते हैं", "capability_question"],
  ["tell me a joke bhai", "casual_conversation"], ["how is your day bro", "casual_conversation"],
  ["hello, what is Section 420?", "stable_legal_information"],
  ["how are you, and what are my bail options?", "case_assistance"],
  ["difference between civil and criminal law", "stable_legal_information"],
  ["consumer rights in India", "stable_legal_information"], ["bail ka basic process", "stable_legal_information"],
  ["भारत में जमानत क्या होती है", "stable_legal_information"], ["धारा 420 क्या है", "stable_legal_information"],
  ["My employer has not paid my salary, what can I do?", "stable_legal_information"],
  ["online fraud ki report kaise karun?", "stable_legal_information"],
  ["मकान मालिक security deposit वापस नहीं दे रहा है", "stable_legal_information"],
  ["I paid a seller for a service but they stopped replying. What can I do?", "stable_legal_information"],
  ["Maine ek online order ke paise diye lekin samaan nahi mila, ab kya karun?", "stable_legal_information"],
  ["मैंने किसी को काम के लिए पैसे दिए, लेकिन वह जवाब नहीं दे रहा है, मैं क्या करूँ?", "stable_legal_information"],
  ["hi, search the latest Supreme Court judgment", "current_legal_research"],
  ["latest amendment to consumer law", "current_legal_research"],
  ["check current government notification", "current_legal_research"], ["verify online the current rule", "current_legal_research"],
  ["2026 labour law amendment", "current_legal_research"], ["नवीनतम सुप्रीम कोर्ट निर्णय", "current_legal_research"],
  ["naya kanoon online check karo", "current_legal_research"],
  ["namaste, summarize this uploaded notice", "document_analysis"],
  ["namaste, is document ko summarize karo", "document_analysis"],
  ["According to the uploaded records, which month and amount are marked disputed?", "document_analysis"],
  ["review this contract", "document_analysis"], ["compare these clauses", "document_analysis"],
  ["इस दस्तावेज़ का सार बताइए", "document_analysis"],
  ["draft a legal notice", "drafting"], ["complaint draft banao", "drafting"],
  ["hi, consumer complaint ka draft banao", "drafting"],
  ["कानूनी नोटिस तैयार करें", "drafting"],
  ["create a timeline for my case", "timeline"], ["what evidence is missing in my matter", "case_assistance"],
  ["mere case ki timeline banao", "timeline"], ["prepare a document checklist", "checklist"],
  ["case ki checklist banao", "checklist"], ["what did I say earlier?", "chat_memory_question"],
  ["my arrest may happen tonight", "urgent_safety"], ["police aa gayi turant kya karu", "urgent_safety"],
  ["आज रात गिरफ्तारी हो सकती है", "urgent_safety"], ["the limitation deadline is today", "urgent_safety"],
  ["I am in police custody", "urgent_safety"],
  ["what about the next step", "follow_up"], ["aur uske baad?", "follow_up"], ["और फिर क्या", "follow_up"],
  ["purple bicycle mathematics", "unsupported_or_sensitive"], ["", "unsupported_or_sensitive"],
];

for (const [prompt, expected] of cases) {
  const actual = classifyLegalRequest(prompt, { hasPriorConversation: expected === "follow_up" || expected === "chat_memory_question" });
  assert.equal(actual.intent, expected, `Unexpected intent for ${JSON.stringify(prompt)}`);
  if (["greeting", "casual_conversation", "capability_question"].includes(expected)) {
    assert.equal(actual.automaticWeb, false);
    assert.equal(actual.manualWebAllowed, false);
    assert.equal(actual.retrieveGlobalKnowledge, false);
    assert.equal(actual.retrieveCaseContext, false);
    assert.equal(actual.retrieveDocumentContext, false);
  }
}

const multilingualLegalTopicMatrix: Array<{
  topic: string;
  language: "en" | "hinglish" | "hi";
  prompt: string;
  expected: LegalRequestIntent;
}> = [
  { topic: "landlord", language: "en", prompt: "My landlord is refusing to return my security deposit.", expected: "stable_legal_information" },
  { topic: "landlord", language: "hinglish", prompt: "Mera makaan malik security deposit wapas nahi de raha hai.", expected: "stable_legal_information" },
  { topic: "landlord", language: "hi", prompt: "मकान मालिक जमा राशि वापस नहीं दे रहा है।", expected: "stable_legal_information" },
  { topic: "consumer", language: "en", prompt: "How do I complain about a defective product to the consumer commission?", expected: "stable_legal_information" },
  { topic: "consumer", language: "hinglish", prompt: "Consumer complaint kaise file karun agar product kharab nikla?", expected: "stable_legal_information" },
  { topic: "consumer", language: "hi", prompt: "खराब उत्पाद के लिए उपभोक्ता शिकायत कैसे दर्ज करूं?", expected: "stable_legal_information" },
  { topic: "salary", language: "en", prompt: "My employer has not paid my salary.", expected: "stable_legal_information" },
  { topic: "salary", language: "hinglish", prompt: "Mujhe do mahine se tankhwa nahi mili hai.", expected: "stable_legal_information" },
  { topic: "salary", language: "hi", prompt: "मुझे दो महीने से वेतन नहीं मिला है।", expected: "stable_legal_information" },
  { topic: "police/FIR", language: "en", prompt: "The police station refuses to register my FIR.", expected: "stable_legal_information" },
  { topic: "police/FIR", language: "hinglish", prompt: "Police meri FIR register nahi kar rahi hai.", expected: "stable_legal_information" },
  { topic: "police/FIR", language: "hi", prompt: "पुलिस मेरी एफआईआर दर्ज नहीं कर रही है।", expected: "stable_legal_information" },
  { topic: "property", language: "en", prompt: "What documents should I check before buying property?", expected: "stable_legal_information" },
  { topic: "property", language: "hinglish", prompt: "Zameen kharidne se pehle kya documents check karun?", expected: "stable_legal_information" },
  { topic: "property", language: "hi", prompt: "संपत्ति खरीदने से पहले कौन से दस्तावेज़ जांचूं?", expected: "stable_legal_information" },
  { topic: "property", language: "hi", prompt: "जमीन के कागज जांचने से पहले क्या देखें?", expected: "stable_legal_information" },
  { topic: "family", language: "en", prompt: "How does child custody work after divorce?", expected: "stable_legal_information" },
  { topic: "family", language: "hinglish", prompt: "Talak ke baad child custody ka process kya hai?", expected: "stable_legal_information" },
  { topic: "family", language: "hi", prompt: "तलाक के बाद बच्चे की अभिरक्षा का नियम क्या है?", expected: "stable_legal_information" },
  { topic: "family", language: "hi", prompt: "मुझे अपने बच्चे की कस्टडी के बारे में जानकारी चाहिए।", expected: "stable_legal_information" },
  { topic: "cybercrime", language: "en", prompt: "I was scammed through UPI. How do I report cybercrime?", expected: "stable_legal_information" },
  { topic: "cybercrime", language: "hinglish", prompt: "UPI fraud hone par cyber complaint kaise karun?", expected: "stable_legal_information" },
  { topic: "cybercrime", language: "hi", prompt: "UPI धोखाधड़ी की साइबर शिकायत कैसे करूं?", expected: "stable_legal_information" },
  { topic: "contract", language: "en", prompt: "Can you explain the risk in my employment contract?", expected: "stable_legal_information" },
  { topic: "contract", language: "hinglish", prompt: "Mere contract ki payment clause ka matlab kya hai?", expected: "stable_legal_information" },
  { topic: "contract", language: "hi", prompt: "अनुबंध की भुगतान शर्त का क्या मतलब है?", expected: "stable_legal_information" },
  { topic: "notice", language: "en", prompt: "Can I send a legal notice before asking for a refund?", expected: "stable_legal_information" },
  { topic: "notice", language: "hinglish", prompt: "Legal notice bhejne se pehle kya details chahiye?", expected: "stable_legal_information" },
  { topic: "notice", language: "hi", prompt: "कानूनी नोटिस भेजने से पहले क्या जानकारी चाहिए?", expected: "stable_legal_information" },
  { topic: "notice", language: "hi", prompt: "मुझे अदालत का नोटिस मिला है, अब क्या करूं?", expected: "stable_legal_information" },
  { topic: "document", language: "en", prompt: "Can you explain this uploaded agreement?", expected: "document_analysis" },
  { topic: "document", language: "hinglish", prompt: "Yeh attached agreement samjha do.", expected: "document_analysis" },
  { topic: "document", language: "hi", prompt: "इस दस्तावेज़ का सार बताइए।", expected: "document_analysis" },
];

for (const testCase of multilingualLegalTopicMatrix) {
  const actual = classifyLegalRequest(testCase.prompt);
  assert.equal(
    actual.intent,
    testCase.expected,
    `${testCase.topic} ${testCase.language} must reach the correct legal workflow instead of a generic clarification`,
  );
}

const naturalLanguageLegalSituationMatrix: Array<{
  topic: string;
  language: "en" | "hinglish" | "hi";
  prompt: string;
}> = [
  { topic: "advance refund", language: "en", prompt: "I gave an advance and now they refuse to return it." },
  { topic: "unpaid dues", language: "en", prompt: "My boss keeps delaying the dues owed to me." },
  { topic: "child contact", language: "en", prompt: "Someone is stopping me from meeting my child." },
  { topic: "identity misuse", language: "en", prompt: "A person has used my identity without permission." },
  { topic: "advance refund", language: "hinglish", prompt: "Maine advance diya tha, ab woh wapas nahi de raha." },
  { topic: "unpaid dues", language: "hinglish", prompt: "Mere boss mere dues rok rahe hain." },
  { topic: "child contact", language: "hinglish", prompt: "Mujhe apne bacche se milne nahi diya ja raha hai." },
  { topic: "identity misuse", language: "hinglish", prompt: "Kisi ne meri pehchan ka galat use kiya hai." },
  { topic: "advance refund", language: "hi", prompt: "मैंने एडवांस दिया था, अब वह वापस नहीं कर रहा है।" },
  { topic: "unpaid dues", language: "hi", prompt: "मेरा बॉस मेरा बकाया रोक रहा है।" },
  { topic: "child contact", language: "hi", prompt: "मुझे अपने बच्चे से मिलने नहीं दिया जा रहा है।" },
  { topic: "identity misuse", language: "hi", prompt: "किसी ने मेरी पहचान का गलत इस्तेमाल किया है।" },
];

for (const testCase of naturalLanguageLegalSituationMatrix) {
  const actual = classifyLegalRequest(testCase.prompt);
  assert.equal(
    actual.intent,
    "stable_legal_information",
    `${testCase.topic} ${testCase.language} must reach safe legal assistance instead of a generic clarification`,
  );
}

assert.equal(classifyLegalRequest("hello, what is Section 420?").intent, "stable_legal_information");
assert.equal(classifyLegalRequest("hi, search the latest Supreme Court judgment").automaticWeb, true);
assert.equal(classifyLegalRequest("namaste, summarize this uploaded notice").retrieveDocumentContext, true);
assert.equal(
  classifyLegalRequest("According to the uploaded records, which month and amount are marked disputed?").retrieveDocumentContext,
  true,
);
assert.equal(classifyLegalRequest("bhai kya haal chal?").manualWebAllowed, false);
assert.equal(classifyLegalRequest("what did I say earlier?", { hasPriorConversation: true }).automaticWeb, false);
assert.equal(classifyLegalRequest("prepare a checklist for my case").retrieveCaseContext, true);
assert.equal(
  classifyLegalRequest("Confirm the disputed status in one sentence.", {
    hasPriorConversation: true,
    hasCaseContext: true,
  }).intent,
  "case_assistance",
);
assert.equal(
  classifyLegalRequest("Confirm the disputed status in one sentence.", {
    hasPriorConversation: true,
    hasCaseContext: true,
  }).retrieveCaseContext,
  true,
);
assert.equal(
  classifyLegalRequest("Confirm the disputed status in one sentence.", {
    hasPriorConversation: true,
  }).intent,
  "unsupported_or_sensitive",
);
assert.equal(resolveLegalResponseLanguage("hello", "en"), "en");
assert.equal(resolveLegalResponseLanguage("नमस्ते", "en"), "en");
assert.equal(resolveLegalResponseLanguage("आप क्या कर सकते हैं?", "en"), "en");
assert.equal(resolveLegalResponseLanguage("bhai kya haal chal?", "en"), "en");
assert.equal(resolveLegalResponseLanguage("Anticipatory bail kya hoti hai?", "en"), "en");
assert.equal(resolveLegalResponseLanguage("helllo bhai", "en"), "en");
assert.equal(resolveLegalResponseLanguage("What can you do?", "hinglish"), "hinglish");
console.log(`Legal intent and tool-decision matrix: PASS (${cases.length + multilingualLegalTopicMatrix.length + naturalLanguageLegalSituationMatrix.length} prompts)`);
