export type LegalSathiProxyRule = {
  pattern: RegExp;
  methods: string[];
  maxBodyBytes?: number;
  forwardAuthorization?: boolean;
};

const id = "[A-Za-z0-9_-]{8,120}";

export const legalSathiProxyRules: LegalSathiProxyRule[] = [
  { pattern: /^\/health$/, methods: ["GET"] },
  { pattern: /^\/plans\/catalog$/, methods: ["GET"] },
  { pattern: /^\/auth\/config$/, methods: ["GET"] },
  { pattern: /^\/auth\/pending$/, methods: ["GET"] },
  { pattern: /^\/auth\/(?:email\/(?:start|verify)|google|password\/(?:login|create|reset|recovery\/verify)|mfa\/challenge)$/, methods: ["POST"] },
  { pattern: /^\/usage$/, methods: ["GET"] },
  { pattern: /^\/profile\/(?:config|status|plan-state|export)$/, methods: ["GET"] },
  { pattern: /^\/profile\/consent\/(?:document|history)$/, methods: ["GET"] },
  { pattern: /^\/profile\/security\/2fa\/status$/, methods: ["GET"] },
  { pattern: /^\/profile\/security\/2fa\/(?:enroll|disable|reauth\/(?:start|verify))$/, methods: ["POST"] },
  { pattern: /^\/profile\/session$/, methods: ["GET", "DELETE"] },
  { pattern: /^\/profile\/(?:dev-session|consent|language|deletion-request)$/, methods: ["POST"] },
  { pattern: /^\/ai\/(?:legal-chat|web-status)$/, methods: ["GET", "POST"], maxBodyBytes: 768 * 1024 },
  { pattern: new RegExp(`^/ai/legal-chat/${id}/result$`), methods: ["GET"] },
  { pattern: new RegExp(`^/ai/legal-chat/${id}/cancel$`), methods: ["POST"] },
  { pattern: /^\/ai\/admin\/provider-status$/, methods: ["GET"], forwardAuthorization: true },
  { pattern: /^\/cases$/, methods: ["GET"] },
  { pattern: /^\/cases\/from-intake$/, methods: ["POST"] },
  { pattern: new RegExp(`^/cases/${id}$`), methods: ["GET", "DELETE"] },
  { pattern: new RegExp(`^/cases/${id}/prepare$`), methods: ["POST"] },
  { pattern: new RegExp(`^/cases/${id}/restore$`), methods: ["POST"] },
  { pattern: /^\/chats$/, methods: ["GET", "POST", "DELETE"], maxBodyBytes: 768 * 1024 },
  { pattern: new RegExp(`^/chats/${id}$`), methods: ["PATCH", "DELETE"], maxBodyBytes: 768 * 1024 },
  { pattern: new RegExp(`^/chats/${id}/restore$`), methods: ["POST"] },
  { pattern: /^\/case-questions$/, methods: ["POST"], maxBodyBytes: 768 * 1024 },
  { pattern: /^\/documents\/process$/, methods: ["POST"], maxBodyBytes: 27 * 1024 * 1024 },
  { pattern: /^\/documents$/, methods: ["GET"] },
  { pattern: new RegExp(`^/documents/${id}$`), methods: ["DELETE"] },
  { pattern: new RegExp(`^/documents/${id}/category$`), methods: ["PATCH"], maxBodyBytes: 32 * 1024 },
  { pattern: new RegExp(`^/documents/${id}/annotations$`), methods: ["PATCH"], maxBodyBytes: 32 * 1024 },
  { pattern: new RegExp(`^/documents/${id}/case$`), methods: ["PATCH"], maxBodyBytes: 32 * 1024 },
  { pattern: new RegExp(`^/documents/${id}/content$`), methods: ["GET"] },
  { pattern: /^\/payments\/razorpay\/(?:coupon-preview|topup-quote|order|verify)$/, methods: ["POST"] },
  { pattern: /^\/payments\/razorpay\/transactions$/, methods: ["GET"] },
  { pattern: /^\/incidents\/report$/, methods: ["POST"], maxBodyBytes: 32 * 1024 },
  { pattern: /^\/incidents\/public-report$/, methods: ["POST"], maxBodyBytes: 32 * 1024 },
  { pattern: /^\/admin\/session\/readiness$/, methods: ["GET"] },
  { pattern: /^\/admin\/credential\/setup$/, methods: ["POST"] },
  { pattern: /^\/admin\/session$/, methods: ["POST"] },
  { pattern: /^\/admin\/session\/status$/, methods: ["GET"], forwardAuthorization: true },
  { pattern: /^\/admin\/users$/, methods: ["GET"], forwardAuthorization: true },
  { pattern: /^\/admin\/consents(?:\/export)?$/, methods: ["GET"], forwardAuthorization: true },
  { pattern: /^\/admin\/incidents$/, methods: ["GET"], forwardAuthorization: true },
  { pattern: /^\/admin\/incidents\/inc_[a-f0-9]{20}\/status$/, methods: ["PATCH"], forwardAuthorization: true },
  { pattern: /^\/admin\/coupons$/, methods: ["GET", "POST"], forwardAuthorization: true },
  { pattern: /^\/admin\/coupons\/[A-Z0-9_-]{2,40}(?:\/disable)?$/, methods: ["POST", "DELETE"], forwardAuthorization: true },
  { pattern: /^\/admin\/pricing$/, methods: ["GET", "PATCH"], forwardAuthorization: true },
  { pattern: /^\/admin\/users\/[^/]{3,254}\/(?:tier|ban|unban|hide|restore|usage\/reset)$/, methods: ["POST"], forwardAuthorization: true },
];

export function matchLegalSathiProxyRule(path: string, method: string) {
  const upperMethod = method.toUpperCase();
  return legalSathiProxyRules.find(
    (rule) => rule.pattern.test(path) && rule.methods.includes(upperMethod),
  );
}
