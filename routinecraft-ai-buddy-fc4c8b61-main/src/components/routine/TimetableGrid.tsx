import { useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORY_STYLES, blocksForDay, durationMinutes } from "@/lib/analysis";
import { cn } from "@/lib/utils";
import { DAYS, type BlockCategory, type DayName, type TimeBlock } from "@/types/routine";

const CATEGORIES = Object.keys(CATEGORY_STYLES) as BlockCategory[];

function BlockRow({
  block,
  onUpdate,
  onRemove,
}: {
  block: TimeBlock;
  onUpdate: (patch: Partial<TimeBlock>) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(block);
  const style = CATEGORY_STYLES[block.category] ?? CATEGORY_STYLES.study;
  const minutes = durationMinutes(block);

  if (editing) {
    return (
      <li className="rounded-xl border border-border bg-secondary/40 p-3">
        <div className="grid gap-2 sm:grid-cols-[130px_1fr]">
          <Input
            value={draft.time}
            onChange={(event) => setDraft({ ...draft, time: event.target.value })}
            className="h-9 font-mono text-xs"
          />
          <Input
            value={draft.activity}
            onChange={(event) => setDraft({ ...draft, activity: event.target.value })}
            className="h-9"
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Select
            value={draft.category}
            onValueChange={(value) => setDraft({ ...draft, category: value as BlockCategory })}
          >
            <SelectTrigger className="h-9 w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((category) => (
                <SelectItem key={category} value={category}>
                  {CATEGORY_STYLES[category].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={draft.energyLevel}
            onValueChange={(value) =>
              setDraft({ ...draft, energyLevel: value as TimeBlock["energyLevel"] })
            }
          >
            <SelectTrigger className="h-9 w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="high">High energy</SelectItem>
              <SelectItem value="medium">Medium energy</SelectItem>
              <SelectItem value="low">Low energy</SelectItem>
            </SelectContent>
          </Select>
          <div className="ml-auto flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                onUpdate(draft);
                setEditing(false);
              }}
              className="gap-1"
            >
              <Check className="size-4" /> Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              <X className="size-4" />
            </Button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li
      className={cn(
        "group flex items-center gap-3 rounded-xl border-l-4 border-y border-r border-border/60 bg-secondary/30 p-3 transition-colors hover:bg-secondary/50",
        style.className,
      )}
    >
      <div className="w-[120px] shrink-0 font-mono text-xs text-foreground/90">{block.time}</div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{block.activity}</p>
        <p className="text-[11px] text-muted-foreground">
          {style.label} · {block.energyLevel} energy
          {minutes ? ` · ${Math.round(minutes)} min` : ""}
        </p>
      </div>
      <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <Button size="icon" variant="ghost" className="size-8" onClick={() => setEditing(true)}>
          <Pencil className="size-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="size-8" onClick={onRemove}>
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </li>
  );
}

export function TimetableGrid({
  blocks,
  onUpdate,
  onRemove,
}: {
  blocks: TimeBlock[];
  onUpdate: (id: string, patch: Partial<TimeBlock>) => void;
  onRemove: (id: string) => void;
}) {
  const [day, setDay] = useState<DayName | "All">("All");
  const visible = blocksForDay(blocks, day);

  return (
    <section className="panel flex h-full min-h-[420px] flex-col p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Interactive Timetable
          </h2>
          <p className="text-xs text-muted-foreground/80">
            {blocks.length} block{blocks.length === 1 ? "" : "s"} · click a row to edit
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {(["All", ...DAYS] as const).map((option) => (
            <button
              key={option}
              onClick={() => setDay(option)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                day === option
                  ? "border-primary/60 bg-primary/15 text-primary"
                  : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground",
              )}
            >
              {option === "All" ? "All" : option.slice(0, 3)}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {CATEGORIES.map((category) => (
          <span
            key={category}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
          >
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: `var(--cat-${category})` }}
            />
            {CATEGORY_STYLES[category].label}
          </span>
        ))}
      </div>

      <ul className="mt-4 flex-1 space-y-2 overflow-y-auto pr-1">
        {visible.length === 0 ? (
          <li className="grid h-full min-h-[220px] place-items-center rounded-xl border border-dashed border-border/70 p-6 text-center">
            <div>
              <p className="text-sm font-medium text-foreground">No blocks yet</p>
              <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                Describe your classes, sleep, and study goals by voice or text and RoutineCraft will
                build the grid.
              </p>
            </div>
          </li>
        ) : (
          visible.map((block) => (
            <BlockRow
              key={block.id}
              block={block}
              onUpdate={(patch) => onUpdate(block.id, patch)}
              onRemove={() => onRemove(block.id)}
            />
          ))
        )}
      </ul>
    </section>
  );
}
