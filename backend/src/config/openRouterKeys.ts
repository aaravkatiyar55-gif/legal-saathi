import { createHash } from "node:crypto";

type EnvironmentLike = Record<string, string | undefined>;

function usableKey(value: string | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized.length >= 20
    && normalized.length <= 512
    && !/\s/.test(normalized)
    && /^[A-Za-z0-9._~+/=-]+$/.test(normalized)
    && normalized.toLowerCase() !== "replace_later"
    && !/paste_|your_|server_only|api_key_here/i.test(normalized);
}

function keyFingerprint(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function parseOpenRouterApiKeys(source: EnvironmentLike) {
  const candidates: string[] = [];
  if (source.OPENROUTER_API_KEYS) {
    candidates.push(...source.OPENROUTER_API_KEYS.split(/[,\r\n]+/));
  }

  const numbered = Object.entries(source)
    .flatMap(([name, value]) => {
      const match = /^OPENROUTER_API_KEY_(\d+)$/.exec(name);
      return match ? [{ index: Number(match[1]), value: value ?? "" }] : [];
    })
    .filter((entry) => Number.isSafeInteger(entry.index) && entry.index >= 1)
    .sort((left, right) => left.index - right.index);

  const numberedPrimary = numbered.find((entry) => entry.index === 1);
  if (numberedPrimary) {
    candidates.push(numberedPrimary.value);
  } else {
    // OPENROUTER_API_KEY is the established primary slot when _1 is absent.
    candidates.push(source.OPENROUTER_API_KEY ?? "");
  }
  candidates.push(...numbered.filter((entry) => entry.index !== 1).map((entry) => entry.value));
  if (numberedPrimary) candidates.push(source.OPENROUTER_API_KEY ?? "");

  const fingerprints = new Set<string>();
  const keys: string[] = [];
  for (const candidate of candidates) {
    const key = candidate.trim();
    if (!usableKey(key)) continue;
    const fingerprint = keyFingerprint(key);
    if (fingerprints.has(fingerprint)) continue;
    fingerprints.add(fingerprint);
    keys.push(key);
  }
  return keys;
}

export function openRouterKeyConfigurationFingerprint(keys: string[]) {
  return createHash("sha256")
    .update(keys.map((key) => keyFingerprint(key)).sort().join(":"), "utf8")
    .digest("hex");
}
