export const authorizedAdminEmails = [
  "aaravkatiyar55@gmail.com",
  "inceptionaistudios@gmail.com",
] as const;

export function normalizeAdminEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isAuthorizedAdminEmail(value: unknown) {
  const normalized = normalizeAdminEmail(value);
  return authorizedAdminEmails.some((email) => email === normalized);
}
