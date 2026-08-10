import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const BodySchema = z.object({
  apiKey: z.string().min(1),
  model: z.string().default("llama-3.1-8b-instant"),
  system: z.string().min(1),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(8000),
      }),
    )
    .max(40),
});

export const Route = createFileRoute("/api/public/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let parsed: z.infer<typeof BodySchema>;
        try {
          parsed = BodySchema.parse(await request.json());
        } catch (error) {
          return new Response(
            JSON.stringify({ error: "Invalid request", detail: String(error) }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }

        const upstream = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${parsed.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: parsed.model,
            stream: true,
            temperature: 0.5,
            max_tokens: 2048,
            messages: [{ role: "system", content: parsed.system }, ...parsed.messages],
          }),
        });

        if (!upstream.ok || !upstream.body) {
          const detail = await upstream.text().catch(() => "");
          return new Response(JSON.stringify({ error: "Groq request failed", detail }), {
            status: upstream.status || 502,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(upstream.body, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
