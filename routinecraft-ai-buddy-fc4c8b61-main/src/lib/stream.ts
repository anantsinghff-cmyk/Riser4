/**
 * Streaming helpers: SSE line reader and a clause-based buffer parser that
 * releases short speakable chunks (4-6 words ending in , . ? ! ; :) as soon as
 * they are complete, so TTS can start before the LLM finishes.
 */

export async function* readSSE(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string, void, unknown> {
  const reader = (
    body as unknown as ReadableStream<Uint8Array>
  ).pipeThrough(new TextDecoderStream() as unknown as ReadableWritablePair<string, Uint8Array>).getReader();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let index = buffer.indexOf("\n");
    while (index !== -1) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (line.startsWith("data:")) yield line.slice(5).trim();
      index = buffer.indexOf("\n");
    }
  }
  if (buffer.trim().startsWith("data:")) yield buffer.trim().slice(5).trim();
}

const CLAUSE_END = /[,.;:!?]/;

export class ClauseBuffer {
  private buffer = "";

  /** Push a token; returns any clauses ready to be spoken. */
  push(token: string): string[] {
    this.buffer += token;
    const out: string[] = [];
    let guard = 0;
    while (guard++ < 50) {
      const clause = this.extract();
      if (!clause) break;
      out.push(clause);
    }
    return out;
  }

  private extract(): string | null {
    for (let i = 0; i < this.buffer.length; i++) {
      if (!CLAUSE_END.test(this.buffer[i]!)) continue;
      const candidate = this.buffer.slice(0, i + 1).trim();
      const words = candidate.split(/\s+/).filter(Boolean).length;
      if (words < 4) continue;
      this.buffer = this.buffer.slice(i + 1);
      return candidate;
    }
    return null;
  }

  /** Remaining text at end of stream. */
  flush(): string | null {
    const rest = this.buffer.trim();
    this.buffer = "";
    return rest.length > 0 ? rest : null;
  }

  reset() {
    this.buffer = "";
  }
}

/** Numbers must be spelled out in speech output. */
const ONES = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];
const TENS = [
  "",
  "",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
];

function numberToWords(n: number): string {
  if (n < 20) return ONES[n] ?? String(n);
  if (n < 100) {
    const rest = n % 10;
    return TENS[Math.floor(n / 10)] + (rest ? `-${ONES[rest]}` : "");
  }
  if (n < 1000) {
    const rest = n % 100;
    return `${ONES[Math.floor(n / 100)]} hundred${rest ? ` ${numberToWords(rest)}` : ""}`;
  }
  return String(n);
}

export function speakify(text: string): string {
  return text
    .replace(/[*_`#>]/g, "")
    .replace(/(\d{1,2}):(\d{2})/g, (_m, h: string, m: string) =>
      m === "00"
        ? `${numberToWords(Number(h))} o'clock`
        : `${numberToWords(Number(h))} ${numberToWords(Number(m))}`,
    )
    .replace(/\d+/g, (d) => numberToWords(Number(d)))
    .replace(/\s+/g, " ")
    .trim();
}
