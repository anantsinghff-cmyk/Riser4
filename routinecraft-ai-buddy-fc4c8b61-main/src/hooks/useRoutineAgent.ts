import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AudioEngine } from "@/lib/audio-engine";
import { ClauseBuffer, readSSE } from "@/lib/stream";
import { computeScores, localRecommendations } from "@/lib/analysis";
import { searchMemories, storeMemory } from "@/lib/memory";
import { loadStored, PLAN_KEY, storeValue } from "@/lib/settings";
import type {
  AgentState,
  ApiKeys,
  ChatMessage,
  LatencyMetrics,
  MemoryHit,
  RoutinePlan,
  TimeBlock,
} from "@/types/routine";

export const SYSTEM_PROMPT = `You are RoutineCraft, an empathetic and highly structured AI academic coach powered by Rime and Qdrant. Speak in a concise, natural tone. When giving voice feedback, keep audio responses under 2 short sentences (under 25 words total) focusing on key timetable changes and tips. Never output raw code, markdown formatting, bullet points, or digits in speech output—spell out numbers. Concurrently, generate structured JSON for the interactive timetable UI.

Output format, exactly:
First the spoken reply as plain prose (no markdown, no digits, under twenty five words).
Then on its own line the delimiter ###JSON###
Then a single JSON object, no code fences:
{
  "blocks": [{"time":"08:00 - 09:30","activity":"Deep Study: Physics","category":"study","energyLevel":"high","day":"Monday"}],
  "recommendations": [{"title":"...","detail":"...","severity":"critical|warning|tip","kind":"sleep|cognitive-load|deep-work|balance|spaced-repetition"}],
  "scores": {"academic":0,"rest":0,"burnoutRisk":0},
  "profile": {"peakFocus":"...","sleepWindow":"...","goals":["..."]},
  "summary": "one line written summary"
}
category is one of study, class, rest, exercise, meal, leisure, commute, work. energyLevel is high, medium or low. day is a full weekday name.
Always return the COMPLETE updated timetable, merging the student's new information with what already exists.`;

const EMPTY_PLAN: RoutinePlan = {
  blocks: [],
  recommendations: [],
  scores: { academic: 0, rest: 0, burnoutRisk: 0 },
  profile: {},
  summary: "",
};

function normalisePlan(raw: any): RoutinePlan {
  const blocks: TimeBlock[] = Array.isArray(raw?.blocks)
    ? raw.blocks
        .filter((b: any) => b && typeof b.time === "string" && typeof b.activity === "string")
        .map((b: any, index: number) => ({
          id: `${b.day ?? "Monday"}-${b.time}-${index}`,
          time: String(b.time),
          activity: String(b.activity),
          category: String(b.category ?? "study") as TimeBlock["category"],
          energyLevel: (["high", "medium", "low"].includes(b.energyLevel)
            ? b.energyLevel
            : "medium") as TimeBlock["energyLevel"],
          day: (b.day ?? "Monday") as TimeBlock["day"],
        }))
    : [];

  const modelRecs = Array.isArray(raw?.recommendations)
    ? raw.recommendations.map((r: any, i: number) => ({
        id: `model-${i}`,
        title: String(r?.title ?? "Recommendation"),
        detail: String(r?.detail ?? ""),
        severity: (["critical", "warning", "tip"].includes(r?.severity)
          ? r.severity
          : "tip") as RoutinePlan["recommendations"][number]["severity"],
        kind: (["sleep", "cognitive-load", "deep-work", "balance", "spaced-repetition"].includes(
          r?.kind,
        )
          ? r.kind
          : "balance") as RoutinePlan["recommendations"][number]["kind"],
      }))
    : [];

  const localRecs = localRecommendations(blocks).filter(
    (local) =>
      !modelRecs.some((m: any) => m.title.toLowerCase().trim() === local.title.toLowerCase().trim()),
  );

  const fallbackScores = computeScores(blocks);
  const scores = {
    academic: Number(raw?.scores?.academic) || fallbackScores.academic,
    rest: Number(raw?.scores?.rest) || fallbackScores.rest,
    burnoutRisk: Number(raw?.scores?.burnoutRisk) || fallbackScores.burnoutRisk,
  };

  return {
    blocks,
    recommendations: [...modelRecs, ...localRecs],
    scores,
    profile: raw?.profile ?? {},
    summary: String(raw?.summary ?? ""),
  };
}

export function useRoutineAgent(keys: ApiKeys) {
  const [state, setState] = useState<AgentState>("idle");
  const [plan, setPlan] = useState<RoutinePlan>(EMPTY_PLAN);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [metrics, setMetrics] = useState<LatencyMetrics>({
    stt: null,
    ttfa: null,
    qdrant: null,
    llmFirstToken: null,
  });
  const [memories, setMemories] = useState<MemoryHit[]>([]);
  const [error, setError] = useState<string | null>(null);

  const engineRef = useRef<AudioEngine | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const planRef = useRef<RoutinePlan>(EMPTY_PLAN);
  const speakingRef = useRef(false);

  useEffect(() => {
    const stored = loadStored<RoutinePlan>(PLAN_KEY);
    if (stored) {
      planRef.current = stored;
      setPlan(stored);
    }
  }, []);

  const commitPlan = useCallback((next: RoutinePlan) => {
    planRef.current = next;
    setPlan(next);
    storeValue(PLAN_KEY, next);
  }, []);

  const engine = useMemo(() => {
    engineRef.current?.dispose();
    const created = new AudioEngine({
      rimeKey: keys.rime,
      voice: keys.rimeVoice || "abbie",
      onFirstAudio: (ms) => setMetrics((m) => ({ ...m, ttfa: ms })),
      onDone: () => {
        speakingRef.current = false;
        setState((current) => (current === "speaking" ? "idle" : current));
      },
    });
    engineRef.current = created;
    return created;
  }, [keys.rime, keys.rimeVoice]);

  useEffect(() => () => engineRef.current?.dispose(), []);

  /** Barge-in: kill playback + in-flight generation the moment the user speaks. */
  const interrupt = useCallback(() => {
    if (!speakingRef.current && state !== "analyzing") return;
    engine.cancel();
    abortRef.current?.abort();
    abortRef.current = null;
    speakingRef.current = false;
    setState("interrupted");
    window.setTimeout(() => setState((c) => (c === "interrupted" ? "listening" : c)), 400);
  }, [engine, state]);

  const send = useCallback(
    async (text: string, via: "voice" | "text", sttLatency?: number) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setError(null);

      if (!keys.groq) {
        setError("Add your Groq API key in Settings to start planning your routine.");
        setState("error");
        return;
      }

      engine.cancel();
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
        via,
      };
      setMessages((prev) => [...prev, userMessage]);
      setState("analyzing");
      setMetrics((m) => ({ ...m, stt: sttLatency ?? m.stt, ttfa: null, llmFirstToken: null }));

      // Qdrant lookup runs async and never blocks first token generation.
      const memoryPromise = searchMemories(
        { url: keys.qdrantUrl, apiKey: keys.qdrant },
        trimmed,
      ).then((result) => {
        setMemories(result.hits);
        setMetrics((m) => ({ ...m, qdrant: result.latencyMs || null }));
        return result.hits;
      });

      const history = messages.slice(-8).map((m) => ({ role: m.role, content: m.content }));
      const context = planRef.current.blocks.length
        ? `Current timetable JSON: ${JSON.stringify(planRef.current.blocks)}`
        : "The student has no timetable yet.";

      const started = performance.now();
      engine.begin();

      const clauses = new ClauseBuffer();
      let spoken = "";
      let jsonPart = "";
      let inJson = false;
      let firstToken = false;

      try {
        const res = await fetch("/api/public/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            apiKey: keys.groq,
            model: "llama-3.1-8b-instant",
            system: SYSTEM_PROMPT,
            messages: [
              ...history,
              { role: "user", content: `${context}\n\nStudent says: ${trimmed}` },
            ],
          }),
        });

        if (!res.ok || !res.body) {
          const detail = await res.text().catch(() => "");
          throw new Error(detail || `Chat request failed (${res.status})`);
        }

        speakingRef.current = true;
        setState("speaking");

        for await (const data of readSSE(res.body)) {
          if (data === "[DONE]") break;
          let token = "";
          try {
            token = JSON.parse(data)?.choices?.[0]?.delta?.content ?? "";
          } catch {
            continue;
          }
          if (!token) continue;
          if (!firstToken) {
            firstToken = true;
            setMetrics((m) => ({ ...m, llmFirstToken: Math.round(performance.now() - started) }));
          }

          if (inJson) {
            jsonPart += token;
            continue;
          }

          spoken += token;
          const marker = spoken.indexOf("###JSON###");
          if (marker !== -1) {
            const tail = spoken.slice(0, marker);
            jsonPart = spoken.slice(marker + "###JSON###".length);
            spoken = tail;
            inJson = true;
            const remainder = clauses.flush();
            const pendingTail = tail.slice(tail.length - (remainder?.length ?? 0));
            if (remainder) engine.enqueue(remainder + pendingTail.slice(remainder.length));
            continue;
          }

          for (const clause of clauses.push(token)) engine.enqueue(clause);
        }

        if (!inJson) {
          const rest = clauses.flush();
          if (rest) engine.enqueue(rest);
        }

        const cleanSpeech = spoken.replace(/###JSON###/g, "").trim();
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: cleanSpeech || "Timetable updated.",
            via,
          },
        ]);

        const jsonText = jsonPart.replace(/```json|```/g, "").trim();
        const firstBrace = jsonText.indexOf("{");
        const lastBrace = jsonText.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          try {
            const parsed = JSON.parse(jsonText.slice(firstBrace, lastBrace + 1));
            const next = normalisePlan(parsed);
            if (next.blocks.length > 0) commitPlan(next);
          } catch {
            /* model returned malformed JSON — keep the previous plan */
          }
        }

        await memoryPromise;
        void storeMemory(
          { url: keys.qdrantUrl, apiKey: keys.qdrant },
          "routine-turn",
          `${trimmed}\nCoach: ${cleanSpeech}`,
        );

        if (!speakingRef.current) setState("idle");
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Something went wrong.");
        setState("error");
        speakingRef.current = false;
      }
    },
    [commitPlan, engine, keys, messages],
  );

  const updateBlock = useCallback(
    (id: string, patch: Partial<TimeBlock>) => {
      const blocks = planRef.current.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b));
      commitPlan({
        ...planRef.current,
        blocks,
        scores: computeScores(blocks),
        recommendations: localRecommendations(blocks),
      });
    },
    [commitPlan],
  );

  const removeBlock = useCallback(
    (id: string) => {
      const blocks = planRef.current.blocks.filter((b) => b.id !== id);
      commitPlan({
        ...planRef.current,
        blocks,
        scores: computeScores(blocks),
        recommendations: blocks.length ? localRecommendations(blocks) : [],
      });
    },
    [commitPlan],
  );

  const reset = useCallback(() => {
    engine.cancel();
    abortRef.current?.abort();
    commitPlan(EMPTY_PLAN);
    setMessages([]);
    setState("idle");
  }, [commitPlan, engine]);

  return {
    state,
    setState,
    plan,
    messages,
    metrics,
    memories,
    error,
    send,
    interrupt,
    updateBlock,
    removeBlock,
    reset,
  };
}
