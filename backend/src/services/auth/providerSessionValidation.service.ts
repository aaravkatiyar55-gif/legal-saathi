import { env } from "../../config/env";

export type ProviderSessionTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

export type ProviderSessionValidation =
  | { status: "valid"; tokens: ProviderSessionTokens }
  | { status: "invalid" }
  | { status: "unavailable" };

type RefreshPayload = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_at?: unknown;
  expires_in?: unknown;
  user?: { id?: unknown; email?: unknown; email_confirmed_at?: unknown };
};

export function createProviderSessionValidator(options: {
  supabaseUrl: string;
  publishableKey: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  return async function validateProviderSession(
    tokens: ProviderSessionTokens,
    expected: { subject?: string; email: string },
  ): Promise<ProviderSessionValidation> {
    const baseUrl = options.supabaseUrl.trim().replace(/\/$/, "");
    const publishableKey = options.publishableKey.trim();
    if (!baseUrl || !publishableKey || !tokens.refreshToken) return { status: "unavailable" };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 4_000);
    try {
      // Refresh-token exchange verifies that the hosted provider session still
      // exists. A standalone JWT user lookup can remain valid until JWT expiry
      // even after the provider session has been revoked.
      const response = await fetchImpl(`${baseUrl}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers: {
          apikey: publishableKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refresh_token: tokens.refreshToken }),
        signal: controller.signal,
      });
      if ([400, 401, 403, 422].includes(response.status)) return { status: "invalid" };
      if (!response.ok) return { status: "unavailable" };

      const payload = await response.json() as RefreshPayload;
      const accessToken = typeof payload.access_token === "string" ? payload.access_token : "";
      const refreshToken = typeof payload.refresh_token === "string" ? payload.refresh_token : "";
      const userId = typeof payload.user?.id === "string" ? payload.user.id : "";
      const email = typeof payload.user?.email === "string" ? payload.user.email.trim().toLowerCase() : "";
      const emailConfirmed = Boolean(payload.user?.email_confirmed_at);
      if (!accessToken || !refreshToken || accessToken.length > 16_384 || refreshToken.length > 16_384) {
        return { status: "invalid" };
      }
      if (!expected.subject || userId !== expected.subject || email !== expected.email.trim().toLowerCase() || !emailConfirmed) {
        return { status: "invalid" };
      }
      const expiresAt = Number(payload.expires_at)
        || Math.floor(Date.now() / 1_000) + Math.max(60, Number(payload.expires_in) || 600);
      return { status: "valid", tokens: { accessToken, refreshToken, expiresAt } };
    } catch {
      return { status: "unavailable" };
    } finally {
      clearTimeout(timeout);
    }
  };
}

export const validateProviderSession = createProviderSessionValidator({
  supabaseUrl: env.supabaseUrl,
  publishableKey: env.supabasePublishableKey,
});
