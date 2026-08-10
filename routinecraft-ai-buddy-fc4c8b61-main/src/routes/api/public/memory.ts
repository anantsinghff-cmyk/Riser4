import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const BodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("store"),
    url: z.string().url(),
    apiKey: z.string().min(1),
    userId: z.string().min(1).max(64),
    kind: z.string().min(1).max(40),
    text: z.string().min(1).max(4000),
  }),
  z.object({
    action: z.literal("search"),
    url: z.string().url(),
    apiKey: z.string().min(1),
    userId: z.string().min(1).max(64),
    query: z.string().min(1).max(2000),
    limit: z.number().int().min(1).max(10).default(5),
  }),
]);

export const Route = createFileRoute("/api/public/memory")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let parsed: z.infer<typeof BodySchema>;
        try {
          parsed = BodySchema.parse(await request.json());
        } catch (error) {
          return Response.json({ error: "Invalid request", detail: String(error) }, { status: 400 });
        }

        const { storeMemory, searchMemory } = await import("@/lib/qdrant.server");
        const config = { url: parsed.url, apiKey: parsed.apiKey };

        try {
          if (parsed.action === "store") {
            await storeMemory(config, {
              text: parsed.text,
              kind: parsed.kind,
              userId: parsed.userId,
            });
            return Response.json({ ok: true });
          }
          const hits = await searchMemory(config, parsed.query, parsed.userId, parsed.limit);
          return Response.json({ ok: true, hits });
        } catch (error) {
          return Response.json({ error: "Qdrant error", detail: String(error) }, { status: 502 });
        }
      },
    },
  },
});
