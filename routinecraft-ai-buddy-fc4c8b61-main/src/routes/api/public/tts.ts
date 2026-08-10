import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const BodySchema = z.object({
  text: z.string().min(1).max(600),
  apiKey: z.string().min(1),
  voice: z.string().min(1).max(40).default("abbie"),
});

export const Route = createFileRoute("/api/public/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let parsed: z.infer<typeof BodySchema>;
        try {
          parsed = BodySchema.parse(await request.json());
        } catch {
          return new Response("Invalid TTS request", { status: 400 });
        }

        const upstream = await fetch("https://users.rime.ai/v1/rime-tts", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${parsed.apiKey}`,
            "Content-Type": "application/json",
            Accept: "audio/mp3",
          },
          body: JSON.stringify({
            text: parsed.text,
            speaker: parsed.voice,
            modelId: "mistv2",
            audioFormat: "mp3",
            samplingRate: 24000,
            speedAlpha: 1.0,
            reduceLatency: true,
          }),
        });

        if (!upstream.ok || !upstream.body) {
          const detail = await upstream.text().catch(() => "");
          return new Response(`Rime TTS failed: ${detail}`, { status: upstream.status || 502 });
        }

        return new Response(upstream.body, {
          headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
        });
      },
    },
  },
});
