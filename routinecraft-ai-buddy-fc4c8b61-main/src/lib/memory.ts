import type { MemoryHit } from "@/types/routine";

export function getUserId(): string {
  if (typeof window === "undefined") return "anon";
  const key = "routinecraft.userId";
  let id = window.localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(key, id);
  }
  return id;
}

interface MemoryConfig {
  url: string;
  apiKey: string;
}

export async function searchMemories(
  config: MemoryConfig,
  query: string,
): Promise<{ hits: MemoryHit[]; latencyMs: number }> {
  const started = performance.now();
  if (!config.url || !config.apiKey) return { hits: [], latencyMs: 0 };
  try {
    const res = await fetch("/api/public/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "search",
        url: config.url,
        apiKey: config.apiKey,
        userId: getUserId(),
        query,
        limit: 5,
      }),
    });
    if (!res.ok) return { hits: [], latencyMs: Math.round(performance.now() - started) };
    const json = (await res.json()) as { hits?: MemoryHit[] };
    return { hits: json.hits ?? [], latencyMs: Math.round(performance.now() - started) };
  } catch {
    return { hits: [], latencyMs: Math.round(performance.now() - started) };
  }
}

export async function storeMemory(config: MemoryConfig, kind: string, text: string) {
  if (!config.url || !config.apiKey) return;
  try {
    await fetch("/api/public/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "store",
        url: config.url,
        apiKey: config.apiKey,
        userId: getUserId(),
        kind,
        text,
      }),
    });
  } catch {
    /* memory is best-effort and never blocks the agent */
  }
}
