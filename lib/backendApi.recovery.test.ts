import { submitLegalChat } from "./backendApi";

const assertions: Array<[boolean, string]> = [];
const check = (value: boolean, message: string) => assertions.push([value, message]);

async function run() {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

  try {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { setTimeout, clearTimeout },
    });
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.endsWith("/ai/legal-chat")) {
        throw new DOMException("Local browser deadline elapsed", "AbortError");
      }
      if (url.includes("/ai/legal-chat/timeout-request-123/result")) {
        return new Response(JSON.stringify({
          ok: true,
          requestId: "timeout-request-123",
          status: "completed",
          result: {
            ok: true,
            requestId: "timeout-request-123",
            reply: "Recovered answer",
          },
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ ok: false, error: "UNEXPECTED_TEST_REQUEST" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    };

    const result = await submitLegalChat({
      requestId: "timeout-request-123",
      messages: [{ role: "user", text: "How do I file a consumer complaint?" }],
    });

    check(result.reply === "Recovered answer", "a completed receipt is returned after the browser-side request deadline");
    check(calls.length === 2, "a deadline timeout performs one recovery lookup instead of re-sending the legal question");
    check(calls[0]?.url.endsWith("/ai/legal-chat"), "the first call is the original chat request");
    check(calls[1]?.url.includes("/ai/legal-chat/timeout-request-123/result"), "the recovery lookup uses the original request reference");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else delete (globalThis as Record<string, unknown>).window;
  }

  const failures = assertions.filter(([passed]) => !passed).map(([, message]) => message);
  if (failures.length > 0) throw new Error(failures.join("\n"));
  console.info(`Backend API recovery: PASS ${assertions.length}/${assertions.length}`);
}

void run();
