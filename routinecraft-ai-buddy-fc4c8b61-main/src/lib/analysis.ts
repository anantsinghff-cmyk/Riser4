import type {
  BalanceScores,
  BlockCategory,
  DayName,
  Recommendation,
  TimeBlock,
} from "@/types/routine";

export function parseTimeRange(time: string): { start: number; end: number } | null {
  const match = time.match(/(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const start = Number(match[1]) * 60 + Number(match[2]);
  let end = Number(match[3]) * 60 + Number(match[4]);
  if (end <= start) end += 24 * 60; // overnight
  return { start, end };
}

export function durationMinutes(block: TimeBlock): number {
  const range = parseTimeRange(block.time);
  return range ? range.end - range.start : 0;
}

export function minutesByCategory(blocks: TimeBlock[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const block of blocks) {
    totals[block.category] = (totals[block.category] ?? 0) + durationMinutes(block);
  }
  return totals;
}

function clamp(n: number) {
  return Math.max(1, Math.min(100, Math.round(n)));
}

/** Deterministic local scoring, used as a fallback and to sanity-check the model. */
export function computeScores(blocks: TimeBlock[]): BalanceScores {
  if (blocks.length === 0) return { academic: 0, rest: 0, burnoutRisk: 0 };
  const days = new Set(blocks.map((b) => b.day)).size || 1;
  const totals = minutesByCategory(blocks);
  const study = (totals['study'] ?? 0) + (totals['class'] ?? 0);
  const rest = (totals['rest'] ?? 0) + (totals['leisure'] ?? 0) + (totals['exercise'] ?? 0);

  const studyPerDay = study / days / 60;
  const restPerDay = rest / days / 60;

  const academic = clamp((studyPerDay / 7) * 100);
  const restScore = clamp((restPerDay / 10) * 100);

  const longBlocks = blocks.filter((b) => durationMinutes(b) > 120 && b.category === "study").length;
  const lateNight = blocks.filter((b) => {
    const range = parseTimeRange(b.time);
    if (!range) return false;
    const startHour = (range.start / 60) % 24;
    return (b.category === "study" || b.category === "class") && (startHour >= 23 || startHour < 5);
  }).length;

  const burnout = clamp(
    20 + Math.max(0, studyPerDay - 6) * 12 + longBlocks * 8 + lateNight * 14 - restPerDay * 4,
  );

  return { academic, rest: restScore, burnoutRisk: burnout };
}

export function localRecommendations(blocks: TimeBlock[]): Recommendation[] {
  const recs: Recommendation[] = [];
  if (blocks.length === 0) return recs;

  const sleep = blocks.filter((b) => b.category === "rest");
  const sleepMinutes = sleep.reduce((sum, b) => sum + durationMinutes(b), 0);
  const dayList = Array.from(new Set(blocks.map((b) => b.day)));
  const days = dayList.length || 1;
  const sleepPerDay = sleepMinutes / days / 60;
  const totals = minutesByCategory(blocks);
  const studyMinutes = (totals['study'] ?? 0) + (totals['class'] ?? 0);

  if (sleepPerDay < 7) {
    recs.push({
      id: "sleep-window",
      kind: "sleep",
      severity: sleepPerDay < 6 ? "critical" : "warning",
      title: "Sleep window is too short",
      detail: `You are averaging about ${sleepPerDay.toFixed(1)}h of rest per day. Aim for a protected 7–8h window and shift the last study block earlier.`,
    });
  }

  const marathon = blocks.find((b) => b.category === "study" && durationMinutes(b) > 120);
  if (marathon) {
    recs.push({
      id: "pomodoro",
      kind: "cognitive-load",
      severity: "warning",
      title: "Split marathon study blocks",
      detail: `"${marathon.activity}" runs ${Math.round(durationMinutes(marathon) / 60)}h without a break. Use 50/10 Pomodoro cycles, or 25/5 for heavy recall work.`,
    });
  }

  const lateStudy = blocks.find((b) => {
    const range = parseTimeRange(b.time);
    if (!range) return false;
    const hour = (range.start / 60) % 24;
    return b.category === "study" && (hour >= 23 || hour < 5);
  });
  if (lateStudy) {
    recs.push({
      id: "late-night",
      kind: "sleep",
      severity: "critical",
      title: "Late-night cramming detected",
      detail: `"${lateStudy.activity}" is scheduled past midnight. Retention drops sharply after 23:00 — move it into your peak focus window.`,
    });
  }

  const highEnergyDeepWork = blocks.some(
    (b) => b.category === "study" && b.energyLevel === "high",
  );
  if (!highEnergyDeepWork) {
    recs.push({
      id: "deep-work",
      kind: "deep-work",
      severity: "tip",
      title: "Reserve a high-energy deep work block",
      detail:
        "Complex subjects (math, coding, engineering drawing) belong in your peak focus hours. Book one uninterrupted 90-minute block there.",
    });
  }

  // --- Timetable-derived rules -------------------------------------------

  // Back-to-back load: three or more consecutive study/class blocks with < 15m gap.
  for (const day of dayList) {
    const ordered = sortBlocks(
      blocks.filter((b) => b.day === day && (b.category === "study" || b.category === "class")),
    );
    let streak = 1;
    let streakStart = ordered[0];
    for (let i = 1; i < ordered.length; i++) {
      const prev = parseTimeRange(ordered[i - 1]!.time);
      const curr = parseTimeRange(ordered[i]!.time);
      const gap = prev && curr ? curr.start - prev.end : 999;
      if (gap <= 15) {
        streak += 1;
      } else {
        streak = 1;
        streakStart = ordered[i];
      }
      if (streak >= 3) {
        recs.push({
          id: `back-to-back-${day}`,
          kind: "cognitive-load",
          severity: "warning",
          title: `${day}: no breathing room`,
          detail: `Three or more academic blocks run back to back from "${streakStart?.activity ?? ""}". Insert a 15-minute reset walk between them to keep attention from collapsing.`,
        });
        break;
      }
    }
  }

  // Heaviest vs lightest day imbalance.
  if (dayList.length >= 2) {
    const perDay = dayList.map((day) => ({
      day,
      minutes: blocks
        .filter((b) => b.day === day && (b.category === "study" || b.category === "class"))
        .reduce((sum, b) => sum + durationMinutes(b), 0),
    }));
    const heaviest = perDay.reduce((a, b) => (b.minutes > a.minutes ? b : a));
    const lightest = perDay.reduce((a, b) => (b.minutes < a.minutes ? b : a));
    if (heaviest.minutes - lightest.minutes >= 180) {
      recs.push({
        id: "day-imbalance",
        kind: "balance",
        severity: "warning",
        title: "Workload is lopsided across the week",
        detail: `${heaviest.day} carries ${(heaviest.minutes / 60).toFixed(1)}h of academics while ${lightest.day} has ${(lightest.minutes / 60).toFixed(1)}h. Move one block across to flatten the peak.`,
      });
    }
  }

  // Meals.
  const mealsPerDay = (totals['meal'] ?? 0) / days;
  if (mealsPerDay < 45) {
    recs.push({
      id: "meals",
      kind: "nutrition",
      severity: mealsPerDay === 0 ? "warning" : "tip",
      title: mealsPerDay === 0 ? "No meal breaks scheduled" : "Meal breaks are very short",
      detail:
        "Block three fixed eating windows. Studying through meals spikes fatigue and makes the afternoon slump much worse.",
    });
  }

  // Movement.
  const exercisePerWeek = (totals['exercise'] ?? 0) / 60;
  if (exercisePerWeek < 2.5) {
    recs.push({
      id: "movement",
      kind: "movement",
      severity: exercisePerWeek === 0 ? "warning" : "tip",
      title: exercisePerWeek === 0 ? "No movement in your week" : "Add a little more movement",
      detail: `You have ${exercisePerWeek.toFixed(1)}h of exercise scheduled. Aim for roughly 150 minutes a week — even three 30-minute walks measurably improves recall.`,
    });
  }

  // Downtime.
  const leisurePerDay = (totals['leisure'] ?? 0) / days / 60;
  if (leisurePerDay < 1 && studyMinutes / days / 60 > 4) {
    recs.push({
      id: "downtime",
      kind: "balance",
      severity: "tip",
      title: "Protect some genuine downtime",
      detail: `Only ${leisurePerDay.toFixed(1)}h of leisure per day against a heavy academic load. Schedule one guilt-free evening block so recovery is planned, not accidental.`,
    });
  }

  // Morning dead time before the first commitment.
  const firstStarts = dayList
    .map((day) => {
      const ordered = sortBlocks(blocks.filter((b) => b.day === day && b.category !== "rest"));
      const range = ordered[0] ? parseTimeRange(ordered[0].time) : null;
      return range ? range.start / 60 : null;
    })
    .filter((v): v is number => v !== null);
  if (firstStarts.length > 0) {
    const avgStart = firstStarts.reduce((a, b) => a + b, 0) / firstStarts.length;
    if (avgStart >= 11) {
      recs.push({
        id: "late-start",
        kind: "schedule",
        severity: "tip",
        title: "Your day starts late",
        detail: `The first commitment averages around ${Math.round(avgStart)}:00. Pulling one focus block into the morning adds hours back without extending your day.`,
      });
    }
  }

  // Subject rotation for spaced repetition.
  const subjects = new Set(
    blocks.filter((b) => b.category === "study").map((b) => b.activity.toLowerCase().trim()),
  );
  recs.push({
    id: "spaced-repetition",
    kind: "spaced-repetition",
    severity: "tip",
    title:
      subjects.size <= 1 ? "Rotate subjects across the week" : "Add spaced repetition passes",
    detail:
      subjects.size <= 1
        ? "You are studying a single subject repeatedly. Interleaving two or three subjects per week beats blocked practice for long-term retention."
        : "Close each day with a 15-minute recall pass over yesterday's material, then repeat it at day 3 and day 7 for durable retention.",
  });

  return recs;
}

export const CATEGORY_STYLES: Record<BlockCategory, { label: string; className: string }> = {
  study: { label: "Deep Study", className: "bg-cat-study/15 border-cat-study/50 text-cat-study" },
  class: { label: "Class", className: "bg-cat-class/15 border-cat-class/50 text-cat-class" },
  rest: { label: "Rest / Sleep", className: "bg-cat-rest/15 border-cat-rest/50 text-cat-rest" },
  exercise: {
    label: "Exercise",
    className: "bg-cat-exercise/15 border-cat-exercise/50 text-cat-exercise",
  },
  meal: { label: "Meal", className: "bg-cat-meal/15 border-cat-meal/50 text-cat-meal" },
  leisure: {
    label: "Leisure",
    className: "bg-cat-leisure/15 border-cat-leisure/50 text-cat-leisure",
  },
  commute: {
    label: "Commute",
    className: "bg-cat-commute/15 border-cat-commute/50 text-cat-commute",
  },
  work: { label: "Work", className: "bg-cat-work/15 border-cat-work/50 text-cat-work" },
};

export function sortBlocks(blocks: TimeBlock[]): TimeBlock[] {
  return [...blocks].sort((a, b) => {
    const ra = parseTimeRange(a.time)?.start ?? 0;
    const rb = parseTimeRange(b.time)?.start ?? 0;
    return ra - rb;
  });
}

export function blocksForDay(blocks: TimeBlock[], day: DayName | "All"): TimeBlock[] {
  const filtered = day === "All" ? blocks : blocks.filter((b) => b.day === day);
  return sortBlocks(filtered);
}
