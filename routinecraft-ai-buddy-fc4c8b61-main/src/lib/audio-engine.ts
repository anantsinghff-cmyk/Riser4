import { speakify } from "@/lib/stream";

interface EngineOptions {
  rimeKey: string;
  voice: string;
  onFirstAudio?: (msAfterStart: number) => void;
  onDone?: () => void;
}

/**
 * Sequential low-latency TTS player. Clauses are enqueued as soon as they are
 * parsed out of the LLM stream; each clause is fetched from Rime (via our
 * server route) and played the moment the previous one finishes. Falls back to
 * the browser speech synthesiser when no Rime key is configured.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private queue: Promise<void> = Promise.resolve();
  private sources = new Set<AudioBufferSourceNode>();
  private controllers = new Set<AbortController>();
  private startedAt = 0;
  private firstAudioReported = false;
  private cancelled = false;
  private pending = 0;

  constructor(private opts: EngineOptions) {}

  begin() {
    this.cancelled = false;
    this.firstAudioReported = false;
    this.startedAt = performance.now();
    this.pending = 0;
  }

  private context(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  enqueue(rawClause: string) {
    if (this.cancelled) return;
    const clause = speakify(rawClause);
    if (!clause) return;
    this.pending++;

    if (!this.opts.rimeKey) {
      this.queue = this.queue.then(() => this.speakFallback(clause));
      return;
    }

    const controller = new AbortController();
    this.controllers.add(controller);
    const fetchPromise = fetch("/api/public/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: clause, apiKey: this.opts.rimeKey, voice: this.opts.voice }),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text().catch(() => "TTS failed"));
        return res.arrayBuffer();
      })
      .catch(() => null)
      .finally(() => this.controllers.delete(controller));

    this.queue = this.queue.then(async () => {
      const bytes = await fetchPromise;
      if (this.cancelled || !bytes || bytes.byteLength === 0) {
        this.settle();
        return;
      }
      await this.play(bytes);
      this.settle();
    });
  }

  private settle() {
    this.pending = Math.max(0, this.pending - 1);
    if (this.pending === 0) this.opts.onDone?.();
  }

  private async play(bytes: ArrayBuffer) {
    const ctx = this.context();
    let buffer: AudioBuffer;
    try {
      buffer = await ctx.decodeAudioData(bytes.slice(0));
    } catch {
      return;
    }
    if (this.cancelled) return;
    if (!this.firstAudioReported) {
      this.firstAudioReported = true;
      this.opts.onFirstAudio?.(Math.round(performance.now() - this.startedAt));
    }
    await new Promise<void>((resolve) => {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => {
        this.sources.delete(source);
        resolve();
      };
      this.sources.add(source);
      source.start();
    });
  }

  private speakFallback(clause: string) {
    return new Promise<void>((resolve) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        this.settle();
        resolve();
        return;
      }
      const utterance = new SpeechSynthesisUtterance(clause);
      utterance.rate = 1.05;
      utterance.onend = () => {
        if (!this.firstAudioReported) {
          this.firstAudioReported = true;
          this.opts.onFirstAudio?.(Math.round(performance.now() - this.startedAt));
        }
        this.settle();
        resolve();
      };
      utterance.onerror = () => {
        this.settle();
        resolve();
      };
      window.speechSynthesis.speak(utterance);
    });
  }

  /** Barge-in: kill every buffered/pending clause immediately. */
  cancel() {
    this.cancelled = true;
    this.pending = 0;
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
    }
    this.sources.clear();
    this.queue = Promise.resolve();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    if (this.ctx && this.ctx.state === "running") void this.ctx.suspend().catch(() => {});
  }

  dispose() {
    this.cancel();
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
