import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertCircle, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InputBar } from "@/components/routine/InputBar";
import { RecommendationPanel } from "@/components/routine/RecommendationPanel";
import { SettingsDrawer } from "@/components/routine/SettingsDrawer";
import { TimetableGrid } from "@/components/routine/TimetableGrid";
import { TopBar } from "@/components/routine/TopBar";
import { useRoutineAgent } from "@/hooks/useRoutineAgent";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { EMPTY_KEYS, loadKeys } from "@/lib/settings";
import type { ApiKeys } from "@/types/routine";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "RoutineCraft AI — Voice Student Routine & Timetable Coach" },
      {
        name: "description",
        content:
          "Speak or type your student routine and get a color-coded interactive timetable with sleep, deep work and burnout recommendations in real time.",
      },
      { property: "og:title", content: "RoutineCraft AI — Voice Student Routine Coach" },
      {
        property: "og:description",
        content:
          "Real-time voice and text agent that turns your classes, sleep and goals into an optimized, color-coded timetable.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

const EXAMPLES = [
  "I have classes from nine to one, gym at six, and I sleep around 2am.",
  "My physics exam is in three weeks and I focus best late morning.",
  "Add a two hour coding block on Saturday afternoon.",
];

function Dashboard() {
  const [keys, setKeys] = useState<ApiKeys>(EMPTY_KEYS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [interim, setInterim] = useState("");
  const [voiceError, setVoiceError] = useState<string | null>(null);

  useEffect(() => {
    const stored = loadKeys();
    setKeys(stored);
    if (!stored.groq) setSettingsOpen(true);
  }, []);

  const agent = useRoutineAgent(keys);
  const { state, plan, messages, metrics, memories, error, send, interrupt, reset } = agent;

  const voice = useVoiceInput({
    onFinal: (transcript, latency) => {
      setInterim("");
      void send(transcript, "voice", latency);
    },
    onInterim: setInterim,
    onSpeechStart: interrupt,
    onError: setVoiceError,
  });

  const toggleMic = useCallback(() => {
    setVoiceError(null);
    if (voice.listening) {
      voice.stop();
      agent.setState("idle");
    } else {
      void voice.start();
      agent.setState("listening");
    }
  }, [agent, voice]);

  return (
    <div className="min-h-screen">
      <TopBar state={state} metrics={metrics} onOpenSettings={() => setSettingsOpen(true)} />

      <main className="mx-auto max-w-[1500px] space-y-4 px-4 py-5 sm:px-6">
        {(error || voiceError) && (
          <div className="flex items-start gap-2 rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{error ?? voiceError}</span>
          </div>
        )}

        <InputBar
          listening={voice.listening}
          level={voice.level}
          busy={state === "analyzing"}
          interim={interim}
          onToggleMic={toggleMic}
          onSubmit={(text) => void send(text, "text")}
        />

        <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
          <div className="space-y-4">
            <TimetableGrid
              blocks={plan.blocks}
              onUpdate={agent.updateBlock}
              onRemove={agent.removeBlock}
            />

            <div className="panel p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Conversation
                </h2>
                <Button variant="ghost" size="sm" className="gap-1.5" onClick={reset}>
                  <RotateCcw className="size-3.5" /> Reset
                </Button>
              </div>

              {messages.length === 0 ? (
                <div className="mt-3 space-y-2">
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Sparkles className="size-3.5 text-primary" /> Try saying:
                  </p>
                  {EXAMPLES.map((example) => (
                    <button
                      key={example}
                      onClick={() => void send(example, "text")}
                      className="w-full rounded-lg border border-border/70 bg-secondary/40 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              ) : (
                <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
                  {messages.map((message) => (
                    <li
                      key={message.id}
                      className={
                        message.role === "user"
                          ? "ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary/15 px-3 py-2 text-sm text-foreground"
                          : "mr-auto max-w-[85%] rounded-2xl rounded-bl-sm bg-secondary/60 px-3 py-2 text-sm text-foreground"
                      }
                    >
                      <span className="mr-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {message.role === "user" ? message.via : "coach"}
                      </span>
                      {message.content}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <RecommendationPanel
            scores={plan.scores}
            recommendations={plan.recommendations}
            summary={plan.summary}
            memories={memories}
          />
        </div>
      </main>

      <SettingsDrawer
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        keys={keys}
        onSave={setKeys}
      />
    </div>
  );
}
