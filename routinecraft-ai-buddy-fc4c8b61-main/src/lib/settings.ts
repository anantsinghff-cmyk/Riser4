import type { ApiKeys } from "@/types/routine";

const STORAGE_KEY = "routinecraft.keys.v1";

export const EMPTY_KEYS: ApiKeys = {
  groq: "",
  rime: "",
  qdrant: "",
  qdrantUrl: "",
  deepgram: "",
  rimeVoice: "abbie",
};

export function loadKeys(): ApiKeys {
  if (typeof window === "undefined") return EMPTY_KEYS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_KEYS;
    return { ...EMPTY_KEYS, ...(JSON.parse(raw) as Partial<ApiKeys>) };
  } catch {
    return EMPTY_KEYS;
  }
}

export function saveKeys(keys: ApiKeys) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
}

const PLAN_KEY = "routinecraft.plan.v1";

export function loadStored<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function storeValue(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export { PLAN_KEY };
