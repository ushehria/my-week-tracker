import { dayView } from "./day-view.js";
import { formatLongDay, weekDates } from "./london-time.js";

const ORIGINAL_WEEK = "2026-11-02";
const ORIGINAL_START = "2026-11-04";

export function weekSummary({ state, plan, weekStart, full = false }) {
  const week = state.weeks?.[weekStart];
  const activePlan = week?.sealed && week.planSnapshot ? week.planSnapshot : plan;
  const lines = [
    `Week starting ${weekStart}`,
    `Plan: ${activePlan?.id || "unknown"}${week?.sealed ? " sealed snapshot" : " current plan"}`,
  ];
  if (week?.legacyPlanSnapshot?.id) lines.push(`Legacy plan: ${week.legacyPlanSnapshot.id}`);
  if (weekStart === ORIGINAL_WEEK) {
    lines.push("Logged period: Wed 4–Sun 8 Nov 2026. The app was first opened Thu 5 Nov 2026.");
  }
  if (week?.note?.trim()) lines.push(`Week note: ${week.note.trim()}`);
  const dates = weekDates(weekStart).filter((date) => full || weekStart !== ORIGINAL_WEEK || date >= ORIGINAL_START);
  for (const date of dates) {
    lines.push("");
    lines.push(formatLongDay(date));
    const day = week?.days?.[date] || { marks: {}, cigs: "", energy: "", activities: [] };
    const view = dayView({ plan: activePlan, isoDate: date, dayRecord: day });
    const seen = new Set();
    const items = [
      ...(view.prayers || []),
      ...(view.checkins || []),
      ...(view.bands || []).flatMap((band) => band.items),
      ...(view.preserved || []),
    ];
    for (const item of items) {
      if (item.kind === "window" && !savedActivity(day, item.id)) continue;
      seen.add(item.id);
      lines.push(item.kind === "window" ? windowLine(item, day) : `${labelOf(item)}: ${markWord(item.mark)}`);
    }
    for (const [id, mark] of Object.entries(day.marks || {})) {
      if (!mark || seen.has(id)) continue;
      lines.push(`${id}: ${markWord(mark)}`);
    }
    for (const activity of day.activities || []) {
      if (seen.has(activity.id)) continue;
      lines.push(activityLine(activity));
    }
    lines.push(`Cigarettes: ${day.cigs ? day.cigs : "unlogged"}`);
    lines.push(`Energy 1–10: ${day.energy ? day.energy : "unlogged"}`);
    lines.push(`Notes: ${String(day.note || "").trim() || "unlogged"}`);
    lines.push(callLine("Call mother", day.calls?.mother));
    lines.push(callLine("Call father", day.calls?.father));
  }
  return lines.join("\n");
}

function savedActivity(day, id) {
  return (day.activities || []).some((activity) => activity.id === id);
}

function windowLine(item, day) {
  const activity = (day.activities || []).find((entry) => entry.id === item.id) || item;
  return activityLine(activity, item.label);
}

function activityLine(activity, label = "") {
  const name = activity.title || activity.place || label || activity.id;
  const range = [activity.start, activity.end].filter(Boolean).join("–");
  return `${name}: ${range || "no time"} · ${activity.place || activity.title || "no place"} · ${activity.duration || "no duration"}`;
}

function labelOf(item) {
  return item.label || item.id;
}

function callLine(label, call) {
  if (!call?.done) return `${label}: unlogged`;
  const answer = String(call.note || "").trim();
  return answer ? `${label}: yes — ${answer}` : `${label}: yes`;
}

function markWord(mark) {
  if (mark === "yes") return "yes";
  if (mark === "no") return "no";
  if (mark === "skip") return "not counted";
  return "unlogged";
}
