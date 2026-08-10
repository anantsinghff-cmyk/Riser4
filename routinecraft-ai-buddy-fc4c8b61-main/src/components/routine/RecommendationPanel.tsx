import {
  AlertTriangle,
  Brain,
  CalendarClock,
  Dumbbell,
  Flame,
  Lightbulb,
  Moon,
  Repeat,
  Target,
  UtensilsCrossed,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { BalanceScores, MemoryHit, Recommendation } from "@/types/routine";

const KIND_ICON: Record<Recommendation["kind"], typeof Moon> = {
  sleep: Moon,
  "cognitive-load": Brain,
  "deep-work": Target,
  balance: Lightbulb,
  "spaced-repetition": Repeat,
  nutrition: UtensilsCrossed,
  movement: Dumbbell,
  schedule: CalendarClock,
};

const SEVERITY_STYLE = {
  critical: "border-destructive/50 bg-destructive/10 text-destructive",
  warning: "border-cat-meal/50 bg-cat-meal/10 text-cat-meal",
  tip: "border-primary/40 bg-primary/10 text-primary",
} as const;

function ScoreBar({ label, value, invert }: { label: string; value: number; invert?: boolean }) {
  const good = invert ? value < 45 : value > 55;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span
          className={cn(
            "font-mono text-sm font-semibold",
            good ? "text-primary" : "text-cat-meal",
          )}
        >
          {value}
        </span>
      </div>
      <Progress value={value} className="mt-1.5 h-1.5" />
    </div>
  );
}

export function RecommendationPanel({
  scores,
  recommendations,
  summary,
  memories,
}: {
  scores: BalanceScores;
  recommendations: Recommendation[];
  summary: string;
  memories: MemoryHit[];
}) {
  return (
    <section className="flex h-full flex-col gap-4">
      <div className="panel p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <Flame className="size-4" /> Balance Index
        </h2>
        <div className="mt-4 space-y-3">
          <ScoreBar label="Academic load" value={scores.academic} />
          <ScoreBar label="Rest &amp; recovery" value={scores.rest} />
          <ScoreBar label="Burnout risk" value={scores.burnoutRisk} invert />
        </div>
        {summary ? (
          <p className="mt-4 rounded-lg border border-border/60 bg-secondary/40 p-3 text-xs leading-relaxed text-muted-foreground">
            {summary}
          </p>
        ) : null}
      </div>

      <div className="panel flex-1 overflow-hidden p-4 sm:p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Productivity Recommendations
        </h2>
        <div className="mt-3 max-h-[46vh] space-y-2 overflow-y-auto pr-1">
          {recommendations.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border/70 p-5 text-center text-xs text-muted-foreground">
              Recommendations appear once your routine is captured.
            </p>
          ) : (
            recommendations.map((rec) => {
              const Icon = KIND_ICON[rec.kind] ?? AlertTriangle;
              return (
                <article
                  key={rec.id}
                  className={cn("rounded-xl border p-3", SEVERITY_STYLE[rec.severity])}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="size-4 shrink-0" />
                    <h3 className="text-sm font-semibold">{rec.title}</h3>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-foreground/80">{rec.detail}</p>
                </article>
              );
            })
          )}
        </div>
      </div>

      {memories.length > 0 ? (
        <div className="panel p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Qdrant memory context
          </h2>
          <ul className="mt-2 space-y-1.5">
            {memories.slice(0, 3).map((hit, index) => (
              <li key={index} className="line-clamp-2 text-[11px] text-muted-foreground">
                <span className="font-mono text-primary">{hit.score.toFixed(2)}</span> · {hit.text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
