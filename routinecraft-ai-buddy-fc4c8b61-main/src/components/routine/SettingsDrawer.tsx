import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { EMPTY_KEYS, saveKeys } from "@/lib/settings";
import type { ApiKeys } from "@/types/routine";

const FIELDS: Array<{ key: keyof ApiKeys; label: string; hint: string; type?: string }> = [
  { key: "groq", label: "Groq API key", hint: "Required · llama-3.1-8b-instant", type: "password" },
  { key: "rime", label: "Rime API key", hint: "Streaming TTS · falls back to browser voice", type: "password" },
  { key: "rimeVoice", label: "Rime speaker", hint: "e.g. abbie, cove, marsh" },
  { key: "qdrantUrl", label: "Qdrant URL", hint: "https://xyz.cloud.qdrant.io:6333" },
  { key: "qdrant", label: "Qdrant API key", hint: "Vector memory of past routines", type: "password" },
  { key: "deepgram", label: "Deepgram API key", hint: "Optional · Nova-2 STT upgrade", type: "password" },
];

export function SettingsDrawer({
  open,
  onOpenChange,
  keys,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  keys: ApiKeys;
  onSave: (keys: ApiKeys) => void;
}) {
  const [draft, setDraft] = useState<ApiKeys>(keys);
  useEffect(() => setDraft(keys), [keys, open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>API keys</SheetTitle>
          <SheetDescription>
            Stored only in this browser&apos;s local storage and sent directly to each provider.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-6">
          {FIELDS.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <Label htmlFor={field.key}>{field.label}</Label>
              <Input
                id={field.key}
                type={field.type ?? "text"}
                autoComplete="off"
                value={draft[field.key]}
                onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })}
                placeholder={field.hint}
              />
              <p className="text-[11px] text-muted-foreground">{field.hint}</p>
            </div>
          ))}

          <div className="flex gap-2 pt-2">
            <Button
              className="flex-1"
              onClick={() => {
                saveKeys(draft);
                onSave(draft);
                onOpenChange(false);
              }}
            >
              Save keys
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                saveKeys(EMPTY_KEYS);
                onSave(EMPTY_KEYS);
                setDraft(EMPTY_KEYS);
              }}
            >
              Clear
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
