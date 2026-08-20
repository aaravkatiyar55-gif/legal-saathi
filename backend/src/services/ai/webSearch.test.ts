import { strict as assert } from "node:assert";
import { env } from "../../config/env";
import { AiSafetyBlockError } from "./aiSafety.service";
import {
  createLegalWebSourceOnlyFallback,
  OFFICIAL_INDIAN_LEGAL_DOMAINS,
  prepareWebQuery,
  searchLegalWebWithStatus,
} from "./webSearch.service";

let passed = 0;

async function test(name: string, run: () => void | Promise<void>) {
  await run();
  passed += 1;
  console.log(`PASS ${passed}: ${name}`);
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function main() {
  const originalProvider = env.webSearchProvider;
  const originalTavilyKey = env.tavilyApiKey;

  try {
    await test("query preparation emits a bounded legal topic rather than the raw narrative", () => {
      const prepared = prepareWebQuery("I need the current consumer refund portal for a defective phone purchased yesterday.");
      assert.match(prepared, /^India consumer complaint/);
      assert.match(prepared, /current effective official guidance official sources$/);
      assert.ok(prepared.length <= 320);
      assert.doesNotMatch(prepared, /phone|yesterday/i);
    });

    await test("sensitive identifiers and private details never reach the prepared query", () => {
      const prepared = prepareWebQuery(
        "Consumer refund for Aarav. Aadhaar 1234 5678 9012, PAN ABCDE1234F, email private@example.com, address: 12 Private Road Delhi.",
      );
      assert.doesNotMatch(prepared, /1234|5678|9012|ABCDE1234F|private@example|Private Road|Aarav/i);
      assert.doesNotMatch(prepared, /REDACTED_/i);
      assert.match(prepared, /consumer complaint/i);
    });

    await test("confidential and illegal requests are blocked before provider invocation", () => {
      assert.throws(
        () => prepareWebQuery("Search this sealed court record"),
        (error: unknown) => error instanceof AiSafetyBlockError && error.code === "CONFIDENTIAL_DATA_BLOCKED",
      );
      assert.throws(
        () => prepareWebQuery("How can I fabricate evidence for a police complaint?"),
        (error: unknown) => error instanceof AiSafetyBlockError && error.code === "ILLEGAL_CONDUCT_BLOCKED",
      );
    });

    await test("missing Tavily configuration returns a non-chargeable setup state", async () => {
      env.webSearchProvider = "tavily";
      env.tavilyApiKey = "";
      const result = await searchLegalWebWithStatus("consumer refund");
      assert.deepEqual(result, {
        sources: [],
        attempted: false,
        performed: false,
        succeeded: false,
        chargeable: false,
        reason: "not_configured",
      });
    });

    await test("Tavily receives only the minimized query and official-domain constraints", async () => {
      env.webSearchProvider = "tavily";
      env.tavilyApiKey = "synthetic-test-value";
      let capturedUrl = "";
      let capturedBody: Record<string, unknown> = {};
      const fetchImpl: typeof fetch = async (input, init) => {
        capturedUrl = String(input);
        capturedBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        return jsonResponse({ results: [] });
      };
      await searchLegalWebWithStatus(
        "Consumer complaint from My Name. Aadhaar 1234 5678 9012 and address: 5 Private Lane Mumbai.",
        undefined,
        { fetchImpl },
      );
      assert.equal(capturedUrl, "https://api.tavily.com/search");
      assert.match(String(capturedBody.query), /^India consumer complaint/);
      assert.doesNotMatch(JSON.stringify(capturedBody), /My Name|1234|5678|9012|Private Lane/i);
      assert.equal(capturedBody.search_depth, "basic");
      assert.equal(capturedBody.include_answer, false);
      assert.equal(capturedBody.include_raw_content, false);
      assert.equal(capturedBody.include_images, false);
      assert.deepEqual(capturedBody.include_domains, [...OFFICIAL_INDIAN_LEGAL_DOMAINS]);
    });

    await test("official sources are filtered, deduplicated, sanitized, and trust-ranked", async () => {
      env.webSearchProvider = "tavily";
      env.tavilyApiKey = "synthetic-test-value";
      const retrievedAt = new Date("2026-07-14T00:00:00.000Z");
      const fetchImpl: typeof fetch = async () => jsonResponse({
        results: [
          { title: "Unofficial blog", url: "https://example.com/legal", content: "Not authoritative", score: 1 },
          { title: "Consumer Helpline", url: "https://consumerhelpline.gov.in/guide", content: "Official consumer procedure", score: 0.99 },
          { title: "<script>alert(1)</script>India Code Act", url: "https://indiacode.nic.in/act?utm_source=test", content: "<b>Act text</b>", score: 0.2 },
          { title: "Duplicate Act", url: "https://indiacode.nic.in/act", content: "Duplicate", score: 0.1 },
          { title: "Duplicate display variant", url: "https://www.indiacode.nic.in/act?locale=en&view_type=browse", content: "Same official page", score: 0.15 },
          { title: "Supreme Court", url: "https://www.sci.gov.in/judgment#fragment", content: "Judgment information", score: 0.5 },
          { title: "Internal", url: "https://127.0.0.1/private", content: "Blocked", score: 1 },
        ],
      });
      const result = await searchLegalWebWithStatus("current consumer complaint law", undefined, {
        fetchImpl,
        now: () => retrievedAt,
      });

      assert.equal(result.attempted, true);
      assert.equal(result.performed, true);
      assert.equal(result.succeeded, true);
      assert.equal(result.chargeable, true);
      assert.equal(result.sources.length, 3);
      assert.equal(result.sources[0].authority, "India Code");
      assert.equal(result.sources[1].authority, "Supreme Court of India");
      assert.equal(result.sources[2].authority, "Government of India");
      assert.equal(result.sources[0].retrievedAt, retrievedAt.toISOString());
      assert.doesNotMatch(result.sources[0].title, /script|alert/i);
      assert.doesNotMatch(result.sources[0].excerpt, /<b>|<\/b>/i);
      assert.doesNotMatch(result.sources[0].url, /utm_source|#fragment/i);
      for (const source of result.sources) assert.match(source.url, /^https:\/\//);
    });

    await test("India Code handle variants collapse to one bounded readable source card", async () => {
      env.webSearchProvider = "tavily";
      env.tavilyApiKey = "synthetic-test-value";
      const longMetadata = `The Consumer Protection Act, 2019 | Short Title: | The Consumer Protection Act, 2019 | Long Title: | ${"Official consumer protection material ".repeat(20)}`;
      const fetchImpl: typeof fetch = async () => jsonResponse({
        results: [
          { title: "Consumer Protection Act, 2019", url: "https://www.indiacode.nic.in/handle/123456789/15256?sam_handle=123456789%2F1362", content: longMetadata, score: 0.9 },
          { title: "Consumer Protection Act display variant", url: "https://indiacode.nic.in/handle/123456789/15256?view_type=browse&amp%3Bsam_handle=123456789%2F1362", content: "Duplicate display route", score: 0.8 },
          { title: "Consumer Protection Act malformed display variant", url: "https://indiacode.nic.in/handle/123456789/15256?view_=", content: "Duplicate malformed display route", score: 0.7 },
          { title: "Consumer Protection Act, 1986", url: "https://indiacode.nic.in/handle/123456789/13342?view_type=browse", content: "Earlier official Act page", score: 0.6 },
        ],
      });

      const result = await searchLegalWebWithStatus("current consumer complaint law", undefined, { fetchImpl });

      assert.equal(result.sources.length, 2);
      assert.equal(result.sources.filter((source) => source.url.includes("/15256")).length, 1);
      assert.ok(result.sources.every((source) => source.excerpt.length <= 220));
      assert.doesNotMatch(result.sources[0].excerpt, /\|/);
      assert.doesNotMatch(result.sources[0].excerpt, /short title|long title/i);
      assert.match(result.sources[0].excerpt, /…$/);
    });

    await test("a timeout is safe, bounded, and never chargeable", async () => {
      env.webSearchProvider = "tavily";
      env.tavilyApiKey = "synthetic-test-value";
      const fetchImpl: typeof fetch = async () => {
        throw new DOMException("Synthetic timeout", "TimeoutError");
      };
      const result = await searchLegalWebWithStatus("current consumer law", undefined, { fetchImpl, timeoutMs: 5 });
      assert.equal(result.reason, "timeout");
      assert.equal(result.attempted, true);
      assert.equal(result.performed, false);
      assert.equal(result.succeeded, false);
      assert.equal(result.chargeable, false);
      assert.deepEqual(result.sources, []);
    });

    await test("provider HTTP failure is sanitized and never chargeable", async () => {
      env.webSearchProvider = "tavily";
      env.tavilyApiKey = "synthetic-test-value";
      const fetchImpl: typeof fetch = async () => jsonResponse({ ignored: "synthetic provider detail" }, 503);
      const result = await searchLegalWebWithStatus("consumer law", undefined, { fetchImpl });
      assert.equal(result.reason, "provider_unavailable");
      assert.equal(result.performed, false);
      assert.equal(result.chargeable, false);
      assert.deepEqual(result.sources, []);
      assert.equal("summary" in result, false);
    });

    await test("a response without reliable official sources is non-chargeable", async () => {
      env.webSearchProvider = "tavily";
      env.tavilyApiKey = "synthetic-test-value";
      const fetchImpl: typeof fetch = async () => jsonResponse({
        results: [{ title: "Unofficial", url: "https://example.com/post", content: "No official evidence" }],
      });
      const result = await searchLegalWebWithStatus("consumer law", undefined, { fetchImpl });
      assert.equal(result.reason, "no_reliable_result");
      assert.equal(result.performed, true);
      assert.equal(result.succeeded, false);
      assert.equal(result.chargeable, false);
      assert.deepEqual(result.sources, []);
    });

    await test("source-only fallback is emitted only for successful chargeable retrieval", async () => {
      env.webSearchProvider = "tavily";
      env.tavilyApiKey = "synthetic-test-value";
      const fetchImpl: typeof fetch = async () => jsonResponse({
        results: [{ title: "India Code", url: "https://indiacode.nic.in/consumer", content: "Official source" }],
      });
      const result = await searchLegalWebWithStatus("consumer law", undefined, { fetchImpl });
      const fallback = createLegalWebSourceOnlyFallback(result);
      assert.ok(fallback);
      assert.equal(fallback.message, "Live sources were found, but AI synthesis is temporarily unavailable.");
      assert.equal(fallback.sources.length, 1);
      assert.ok(fallback.retrievedAt);
      assert.equal(createLegalWebSourceOnlyFallback({ ...result, chargeable: false }), null);
    });

    console.log(`Web search safety and fallback contract: PASS ${passed}/${passed}`);
  } finally {
    env.webSearchProvider = originalProvider;
    env.tavilyApiKey = originalTavilyKey;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Web search test failed");
  process.exitCode = 1;
});
