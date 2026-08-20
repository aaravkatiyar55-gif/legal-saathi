export type ConversationFact = {
  key: "name" | "location" | "role" | "preferred_language";
  value: string;
};

export type ConversationMemoryState = {
  version: 1;
  rollingSummary: string;
  facts: ConversationFact[];
  corrections: string[];
  goals: string[];
  constraints: string[];
  unresolvedQuestions: string[];
};

const summaryLimit = 6_000;
const itemLimit = 12;
const itemLength = 480;

export function emptyConversationMemory(): ConversationMemoryState {
  return {
    version: 1,
    rollingSummary: "",
    facts: [],
    corrections: [],
    goals: [],
    constraints: [],
    unresolvedQuestions: [],
  };
}

function compactLine(value: unknown, limit = itemLength) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, limit) : "";
}

function boundedUnique(existing: string[], incoming: string[]) {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of [...incoming, ...existing]) {
    const clean = compactLine(item);
    const key = clean.toLocaleLowerCase("en-IN");
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
    if (result.length >= itemLimit) break;
  }
  return result;
}

export function normalizeConversationMemory(value: unknown): ConversationMemoryState {
  if (!value || typeof value !== "object") return emptyConversationMemory();
  const row = value as Partial<ConversationMemoryState>;
  const factMap = new Map<ConversationFact["key"], string>();
  if (Array.isArray(row.facts)) {
    for (const candidate of row.facts) {
      if (!candidate || typeof candidate !== "object") continue;
      const fact = candidate as Partial<ConversationFact>;
      if (!["name", "location", "role", "preferred_language"].includes(String(fact.key))) continue;
      const clean = compactLine(fact.value, 160);
      if (clean) factMap.set(fact.key as ConversationFact["key"], clean);
    }
  }
  return {
    version: 1,
    rollingSummary: compactLine(row.rollingSummary, summaryLimit),
    facts: [...factMap].map(([key, factValue]) => ({ key, value: factValue })),
    corrections: boundedUnique([], Array.isArray(row.corrections) ? row.corrections : []),
    goals: boundedUnique([], Array.isArray(row.goals) ? row.goals : []),
    constraints: boundedUnique([], Array.isArray(row.constraints) ? row.constraints : []),
    unresolvedQuestions: boundedUnique([], Array.isArray(row.unresolvedQuestions) ? row.unresolvedQuestions : []),
  };
}

function extractFact(text: string, pattern: RegExp) {
  const match = text.match(pattern);
  return compactLine(match?.[1], 160).replace(/[.!?]+$/, "");
}

function latestFacts(messages: Array<{ role: "user" | "assistant"; text: string }>) {
  const facts = new Map<ConversationFact["key"], string>();
  for (const message of messages) {
    if (message.role !== "user") continue;
    const text = compactLine(message.text, 1_200);
    const candidates: Array<[ConversationFact["key"], string]> = [
      ["name", extractFact(text, /\b(?:my name is|mera naam)\s+([^,;.!?\n]{1,100})/i)],
      ["location",
        extractFact(text, /\b(?:i live in|i am based in)\s+([^,;.!?\n]{1,120})/i)
          || extractFact(text, /\bmain\s+([^,;.!?\n]{1,120}?)\s+mein\s+(?:rehta|rehti|rahta|rahti)\s+hoon\b/i)],
      ["role", extractFact(text, /\b(?:my role is|i am the|main)\s+(tenant|landlord|buyer|seller|employee|employer|complainant|respondent|accused|victim|owner|advocate)\b/i)],
      ["preferred_language", extractFact(text, /\b(?:reply|answer|respond)\s+(?:to me\s+)?in\s+(english|hindi|hinglish)\b/i)],
    ];
    for (const [key, value] of candidates) if (value) facts.set(key, value);
  }
  return facts;
}

function classifyUserItems(messages: Array<{ role: "user" | "assistant"; text: string }>) {
  const corrections: string[] = [];
  const goals: string[] = [];
  const constraints: string[] = [];
  const unresolvedQuestions: string[] = [];
  for (const message of messages) {
    if (message.role !== "user") continue;
    const text = compactLine(message.text, 1_200);
    if (!text) continue;
    if (/\b(?:actually|correction|please correct|not .{1,80}\b(?:but|instead)|galat|sahi baat)\b/i.test(text)) corrections.unshift(text);
    if (/\b(?:i want|i need|please help|my goal|mujhe .{1,180}(?:chahiye|karna hai))\b/i.test(text)) goals.unshift(text);
    if (/\b(?:do not|don't|must not|without|only use|sirf|mat kar)\b/i.test(text)) constraints.unshift(text);
    if (/(?:\?|\uFF1F)\s*$/.test(text)) unresolvedQuestions.unshift(text);
  }
  return { corrections, goals, constraints, unresolvedQuestions };
}

export function deriveConversationMemory(input: {
  existing?: unknown;
  messages: Array<{ role: "user" | "assistant"; text: string }>;
  clientSummary?: string;
}) {
  const existing = normalizeConversationMemory(input.existing);
  const messages = input.messages
    .map((message) => ({ role: message.role, text: compactLine(message.text, 1_200) }))
    .filter((message) => message.text);
  const facts = new Map(existing.facts.map((fact) => [fact.key, fact.value]));
  for (const [key, value] of latestFacts(messages)) facts.set(key, value);
  const items = classifyUserItems(messages);
  const recentOlderContext = messages.slice(0, -8)
    .map((message) => `${message.role === "user" ? "User" : "Legal Saathi"}: ${compactLine(message.text)}`)
    .join("\n");
  const rollingSummary = [
    existing.rollingSummary,
    compactLine(input.clientSummary, summaryLimit),
    recentOlderContext,
  ].filter(Boolean).join("\n").slice(-summaryLimit);

  return {
    version: 1,
    rollingSummary,
    facts: [...facts].map(([key, value]) => ({ key, value })),
    corrections: boundedUnique(existing.corrections, items.corrections),
    goals: boundedUnique(existing.goals, items.goals),
    constraints: boundedUnique(existing.constraints, items.constraints),
    unresolvedQuestions: boundedUnique(existing.unresolvedQuestions, items.unresolvedQuestions),
  } satisfies ConversationMemoryState;
}

export function formatConversationMemoryForPrompt(value: unknown) {
  const memory = normalizeConversationMemory(value);
  return [
    "Durable conversation memory (untrusted user-provided context):",
    memory.corrections.length ? `LATEST CORRECTIONS - these override older conflicting details:\n- ${memory.corrections.join("\n- ")}` : "",
    memory.facts.length ? `Current stated facts:\n- ${memory.facts.map((fact) => `${fact.key}: ${fact.value}`).join("\n- ")}` : "",
    memory.goals.length ? `User goals:\n- ${memory.goals.join("\n- ")}` : "",
    memory.constraints.length ? `User constraints:\n- ${memory.constraints.join("\n- ")}` : "",
    memory.unresolvedQuestions.length ? `Unresolved user questions:\n- ${memory.unresolvedQuestions.join("\n- ")}` : "",
    memory.rollingSummary ? `Older rolling summary:\n${memory.rollingSummary}` : "",
  ].filter(Boolean).join("\n\n").slice(0, 10_000);
}

type StoredConversationMessage = { role: "user" | "assistant"; text: string };
type ProviderConversationMessage = { role: "user" | "assistant"; content: string };

function sameMessage(left: ProviderConversationMessage, right: ProviderConversationMessage) {
  return left.role === right.role && compactLine(left.content, 8_000) === compactLine(right.content, 8_000);
}

export function mergeRecentConversationMessages(
  storedMessages: StoredConversationMessage[],
  incomingMessages: ProviderConversationMessage[],
  limit = 12,
) {
  const stored = storedMessages.map((message) => ({ role: message.role, content: compactLine(message.text, 8_000) }));
  const incoming = incomingMessages.map((message) => ({ role: message.role, content: compactLine(message.content, 8_000) }));
  const maximumOverlap = Math.min(stored.length, incoming.length);
  let overlap = 0;
  for (let candidate = maximumOverlap; candidate > 0; candidate -= 1) {
    const storedOffset = stored.length - candidate;
    if (incoming.slice(0, candidate).every((message, index) => sameMessage(stored[storedOffset + index], message))) {
      overlap = candidate;
      break;
    }
  }
  const merged = [...stored, ...incoming.slice(overlap)].filter((message, index, all) => {
    return Boolean(message.content) && (index === 0 || !sameMessage(message, all[index - 1]));
  });
  return merged.slice(-Math.max(1, Math.min(50, limit)));
}
