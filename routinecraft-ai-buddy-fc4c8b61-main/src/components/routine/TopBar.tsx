import { Activity, Gauge, Mic, Radio, Settings2, Timer, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AgentState, LatencyMetrics } from "@/types/routine";

const STATE_LABEL: Record<AgentState, string> = {
  idle: "Idle",
  listening: "Listening",
  analyzing: "Analyzing Routine",
  speaking: "Speaking",
  interrupted: "Interrupted",
  error: "Error",
};

const STATE_STYLE: Record<AgentState, string> = {
  idle: "bg-muted text-muted-foreground",
  listening: "bg-primary/15 text-primary",
  analyzing: "bg-accent/20 text-accent",
  speaking: "bg-cat-work/20 text-cat-work",
  interrupted: "bg-cat-meal/20 text-cat-meal",
  error: "bg-destructive/20 text-destructive",
};

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Timer;
  label: string;
  value: number | null;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-secondary/40 px-3 py-1.5">
      <Icon className="size-3.5 text-muted-foreground" />
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="font-mono text-xs text-foreground">{value === null ? "—" : `${value}ms`}</span>
    </div>
  );
}

export function TopBar({
  state,
  metrics,
  onOpenSettings,
}: {
  state: AgentState;
  metrics: LatencyMetrics;
  onOpenSettings: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-[image:var(--gradient-accent)] text-primary-foreground">
            <Waves className="size-5" />
          </div>
          <div>
            <h1 className="text-base font-semibold leading-tight">
              Routine<span className="text-gradient">Craft</span> AI
            </h1>
            <p className="text-[11px] text-muted-foreground">
              Voice &amp; text student routine coach · VoxForge
            </p>
          </div>
        </div>

        <div
          className={cn(
            "ml-1 flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium",
            STATE_STYLE[state],
          )}
        >
          <span
            className={cn(
              "size-2 rounded-full bg-current",
              (state === "listening" || state === "speaking") && "animate-pulse",
            )}
          />
          {STATE_LABEL[state]}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Metric icon={Mic} label="STT" value={metrics.stt} />
          <Metric icon={Timer} label="TTFA" value={metrics.ttfa} />
          <Metric icon={Activity} label="LLM" value={metrics.llmFirstToken} />
          <Metric icon={Radio} label="Qdrant" value={metrics.qdrant} />
          <Button variant="outline" size="sm" onClick={onOpenSettings} className="gap-2">
            <Settings2 className="size-4" />
            Keys
          </Button>
        </div>
      </div>
      <div className="sr-only">
        <Gauge />
      </div>
    </header>
  );
}
