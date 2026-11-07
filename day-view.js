import { weekdayKey } from "./london-time.js";

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

  return {
    isoDate,
    layout: dayPlan.layout,
    banner: layout.banner || "",
    bands,
    activities: layout.activities
      ? {
          enabled: true,
          fields: ACTIVITY_FIELDS.slice(),
          items: (record.activities || []).map((item) => ({
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
