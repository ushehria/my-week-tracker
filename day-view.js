import { weekdayKey } from "./london-time.js?v=6";

const ACTIVITY_FIELDS = ["start", "end", "place", "duration"];

export function dayView({ plan, isoDate, dayRecord }) {
  const key = weekdayKey(isoDate);
  const dayPlan = plan.days[key];
  const layout = plan.layouts[dayPlan.layout];
  const record = dayRecord || { marks: {}, activities: [] };
  const bands = layout.bands
    .map((band) => ({
      title: band,
      items: plan.habits
        .filter((habit) => habit.band === band && visibleInLayout(habit, dayPlan.layout))
        .map((habit) => presentHabit(habit, key, record)),
    }))
    .filter((band) => band.items.length > 0);

  const suggestions = layout.windows || [];
  const saved = new Map((record.activities || []).map((item) => [item.id, item]));
  const suggestionIds = new Set(suggestions.map((item) => item.id));
  for (const spec of suggestions) {
    const savedItem = saved.get(spec.id);
    const windowItem = {
      kind: "window",
      id: spec.id,
      label: spec.label,
      time: spec.hint || "",
      note: "",
      start: savedItem ? savedItem.start || "" : spec.start || "",
      end: savedItem ? savedItem.end || "" : spec.end || "",
      place: savedItem ? savedItem.place || "" : "",
      duration: savedItem ? savedItem.duration || "" : "",
      suggested: true,
    };
    let placed = false;
    for (const band of bands) {
      const index = band.items.findIndex((item) => item.id === spec.after);
      if (index === -1) continue;
      band.items.splice(index + 1, 0, windowItem);
      placed = true;
      break;
    }
    if (!placed && bands[0]) bands[0].items.push(windowItem);
  }

  return {
    isoDate,
    layout: dayPlan.layout,
    banner: layout.banner || "",
    bands,
    activities: layout.activities
      ? {
          enabled: true,
          fields: ACTIVITY_FIELDS.slice(),
          items: (record.activities || [])
            .filter((item) => !suggestionIds.has(item.id))
            .map((item) => ({
              id: item.id,
              start: item.start || "",
              end: item.end || "",
              place: item.place || "",
              duration: item.duration || "",
            })),
        }
      : null,
  };
}

function visibleInLayout(habit, layoutName) {
  if (!habit.layouts) return true;
  return habit.layouts.includes(layoutName);
}

function presentHabit(habit, key, record) {
  const override = (habit.days && habit.days[key]) || {};
  return {
    id: habit.id,
    label: override.label || habit.label,
    time: override.time || habit.time || "",
    note: override.note || habit.note || "",
    mark: (record.marks && record.marks[habit.id]) || "",
  };
}
