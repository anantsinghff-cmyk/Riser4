/**
 * Qdrant memory helpers.
 *
 * Embeddings use a deterministic hashed bag-of-words projection so the vector
 * store works without a second embedding provider. Same text always maps to
 * the same vector, and cosine similarity still surfaces routines/goals that
 * share vocabulary.
 */
export const VECTOR_SIZE = 384;
export const COLLECTION = "routinecraft_memory";

export function embed(text: string): number[] {
  const vector = new Array<number>(VECTOR_SIZE).fill(0);
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);

  for (const token of tokens) {
    let hash = 2166136261;
    for (let i = 0; i < token.length; i++) {
      hash ^= token.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const index = Math.abs(hash) % VECTOR_SIZE;
    vector[index] = (vector[index] ?? 0) + 1;
  }

  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vector.map((v) => v / norm);
}

interface QdrantConfig {
  url: string;
  apiKey: string;
}

async function qdrant(
  config: QdrantConfig,
  path: string,
  init: { method: string; body?: unknown },
): Promise<Response> {
  return fetch(`${config.url.replace(/\/$/, "")}${path}`, {
    method: init.method,
    headers: {
      "Content-Type": "application/json",
      "api-key": config.apiKey,
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
}

export async function ensureCollection(config: QdrantConfig) {
  const existing = await qdrant(config, `/collections/${COLLECTION}`, { method: "GET" });
  if (existing.ok) return;
  await qdrant(config, `/collections/${COLLECTION}`, {
    method: "PUT",
    body: { vectors: { size: VECTOR_SIZE, distance: "Cosine" } },
  });
}

export async function storeMemory(
  config: QdrantConfig,
  payload: { text: string; kind: string; userId: string },
) {
  await ensureCollection(config);
  const res = await qdrant(config, `/collections/${COLLECTION}/points?wait=true`, {
    method: "PUT",
    body: {
      points: [
        {
          id: crypto.randomUUID(),
          vector: embed(payload.text),
          payload: { ...payload, createdAt: new Date().toISOString() },
        },
      ],
    },
  });
  if (!res.ok) throw new Error(await res.text().catch(() => "Qdrant upsert failed"));
}

export async function searchMemory(
  config: QdrantConfig,
  query: string,
  userId: string,
  limit = 5,
) {
  await ensureCollection(config);
  const res = await qdrant(config, `/collections/${COLLECTION}/points/search`, {
    method: "POST",
    body: {
      vector: embed(query),
      limit,
      with_payload: true,
      filter: { must: [{ key: "userId", match: { value: userId } }] },
    },
  });
  if (!res.ok) throw new Error(await res.text().catch(() => "Qdrant search failed"));
  const json = (await res.json()) as {
    result?: Array<{ score: number; payload?: Record<string, unknown> }>;
  };
  return (json.result ?? []).map((hit) => ({
    text: String(hit.payload?.["text"] ?? ""),
    score: hit.score,
    createdAt: hit.payload?.["createdAt"] as string | undefined,
  }));
}
