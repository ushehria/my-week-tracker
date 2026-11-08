import { dayView } from "./day-view.js";
import { readCall } from "./store.js";
import {
  formatDayLabel,
  formatLongDay,
  formatWeekTitle,
  londonDate,
  weekDates,
  weekStartMonday,
} from "./london-time.js";
import { syncStatusLabel } from "./sync.js";

export function pageModel({ plan, state, selectedDate, now, syncStatus }) {
  const today = londonDate(now);
  const weekStart = weekStartMonday(today);
  const days = weekDates(weekStart);
  const selected = days.includes(selectedDate) ? selectedDate : today;
  const week = state.weeks?.[weekStart];
  const dayRecord = week?.days?.[selected] || { marks: {}, cigs: "", energy: "", activities: [] };
  const activePlan = week?.sealed && week.planSnapshot ? week.planSnapshot : plan;
  return {
    title: "My Week",
    range: formatWeekTitle(weekStart),
    heading: formatLongDay(selected),
    viewingHint: selected === today ? "" : `Today is ${formatDayLabel(today)}`,
    today,
    selectedDate: selected,
    weekStart,
    days: days.map((iso) => ({
      iso,
      label: formatDayLabel(iso),
      short: formatDayLabel(iso).slice(0, 3),
      isToday: iso === today,
      isSelected: iso === selected,
    })),
    view: dayView({ plan: activePlan, isoDate: selected, dayRecord }),
    cigs: dayRecord.cigs || "",
    energy: dayRecord.energy || "",
    note: week?.note || "",
    calls: {
      mother: readCall(dayRecord, "mother"),
      father: readCall(dayRecord, "father"),
    },
    syncLabel: syncStatusLabel(syncStatus),
    showsOtherWeeks: false,
  };
}
