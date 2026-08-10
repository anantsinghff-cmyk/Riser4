export type BlockCategory =
  | "study"
  | "class"
  | "rest"
  | "exercise"
  | "meal"
  | "leisure"
  | "commute"
  | "work";

export type EnergyLevel = "high" | "medium" | "low";

export type DayName =
  | "Monday"
  | "Tuesday"
  | "Wednesday"
  | "Thursday"
  | "Friday"
  | "Saturday"
  | "Sunday";

export const DAYS: DayName[] = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export interface TimeBlock {
  id: string;
  /** "08:00 - 09:30" */
  time: string;
  activity: string;
  category: BlockCategory;
  energyLevel: EnergyLevel;
  day: DayName;
  note?: string;
}

export interface Recommendation {
  id: string;
  title: string;
  detail: string;
  severity: "critical" | "warning" | "tip";
  kind:
    | "sleep"
    | "cognitive-load"
    | "deep-work"
    | "balance"
    | "spaced-repetition"
    | "nutrition"
    | "movement"
    | "schedule";
}

export interface BalanceScores {
  academic: number;
  rest: number;
  burnoutRisk: number;
}

export interface RoutineProfile {
  peakFocus?: string;
  sleepWindow?: string;
  goals?: string[];
}

export interface RoutinePlan {
  blocks: TimeBlock[];
  recommendations: Recommendation[];
  scores: BalanceScores;
  profile: RoutineProfile;
  summary: string;
}

export type AgentState =
  | "idle"
  | "listening"
  | "analyzing"
  | "speaking"
  | "interrupted"
  | "error";

export interface LatencyMetrics {
  stt: number | null;
  ttfa: number | null;
  qdrant: number | null;
  llmFirstToken: number | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  via: "voice" | "text";
}

export interface ApiKeys {
  groq: string;
  rime: string;
  qdrant: string;
  qdrantUrl: string;
  deepgram: string;
  rimeVoice: string;
}

export interface MemoryHit {
  text: string;
  score: number;
  createdAt?: string;
}
