export const appLanguages = ["en", "hinglish", "hi"] as const;

export type AppLanguage = (typeof appLanguages)[number];

export const isAppLanguage = (value: unknown): value is AppLanguage =>
  typeof value === "string" && (appLanguages as readonly string[]).includes(value);
