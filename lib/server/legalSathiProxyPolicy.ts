export const legalChatWarmupTimeoutMs = 8_000;
export const legalChatUpstreamTimeoutMs = 34_000;

export function shouldWakeBackendForAuth(method: string, backendPath: string) {
  return method.toUpperCase() === "POST" && backendPath.startsWith("/auth/");
}

export function shouldWakeBackendForLegalChat(method: string, backendPath: string) {
  return method.toUpperCase() === "POST" && backendPath === "/ai/legal-chat";
}
