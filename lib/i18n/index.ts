import { hinglish } from "./hinglish";
import { hi } from "./hi";
import type { AppLanguage } from "./types";

const dictionaries: Record<Exclude<AppLanguage, "en">, Record<string, string>> = { hinglish, hi };

export { appLanguages, isAppLanguage } from "./types";
export type { AppLanguage } from "./types";

export function translateUiText(text: string, language: AppLanguage) {
  if (language === "en") return text;
  const trimmed = text.trim();
  const translated = dictionaries[language][trimmed];
  if (!translated) return text;
  const leading = text.slice(0, text.length - text.trimStart().length);
  const trailing = text.slice(text.trimEnd().length);
  return `${leading}${translated}${trailing}`;
}

export function languageLabel(language: AppLanguage) {
  return language === "en" ? "English" : language === "hinglish" ? "Hinglish" : "हिन्दी";
}

export function languageTag(language: AppLanguage) {
  return language === "hi" ? "hi" : language === "hinglish" ? "hi-Latn" : "en";
}
