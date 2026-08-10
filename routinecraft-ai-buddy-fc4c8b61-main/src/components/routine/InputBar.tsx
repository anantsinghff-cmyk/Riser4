import { useState } from "react";
import { Loader2, Mic, MicOff, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AudioVisualizer } from "@/components/routine/AudioVisualizer";
import { cn } from "@/lib/utils";

export function InputBar({
  listening,
  level,
  busy,
  interim,
  onToggleMic,
  onSubmit,
}: {
  listening: boolean;
  level: number;
  busy: boolean;
  interim: string;
  onToggleMic: () => void;
  onSubmit: (text: string) => void;
}) {
  const [value, setValue] = useState("");

  return (
    <div className="panel p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={onToggleMic}
          aria-label={listening ? "Stop listening" : "Start voice input"}
          className={cn(
            "grid size-12 shrink-0 place-items-center rounded-full border transition-colors",
            listening
              ? "animate-mic-pulse border-primary/60 bg-primary text-primary-foreground"
              : "border-border bg-secondary text-foreground hover:bg-secondary/70",
          )}
        >
          {listening ? <Mic className="size-5" /> : <MicOff className="size-5" />}
        </button>

        <div className="min-w-0 flex-1">
          <AudioVisualizer level={level} active={listening} />
          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
            {listening
              ? interim || "Listening continuously — speak any time to interrupt."
              : "Tap the mic for voice, or type your routine below."}
          </p>
        </div>

        <form
          className="flex w-full gap-2 sm:w-[46%]"
          onSubmit={(event) => {
            event.preventDefault();
            const text = value.trim();
            if (!text) return;
            setValue("");
            onSubmit(text);
          }}
        >
          <Input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            maxLength={1200}
            placeholder="e.g. Classes 9 to 1, gym at 6, exams in three weeks"
            className="h-11 bg-secondary/50"
          />
          <Button type="submit" disabled={busy} className="h-11 gap-2 px-4">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Submit
          </Button>
        </form>
      </div>
    </div>
  );
}
