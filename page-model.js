import { dayView } from "./day-view.js?v=6";
import {
  addCalendarDays,
  formatDayLabel,
  formatLongDay,
  formatWeekTitle,
  londonDate,
  weekDates,
  weekStartMonday,
} from "./london-time.js?v=6";
import { syncStatusLabel } from "./sync.js?v=6";

export function pageModel({ plan, state, selectedDate, now, syncStatus, weekStart: requestedWeek }) {
  const today = londonDate(now);
  const currentWeek = weekStartMonday(today);
  const weekStart = requestedWeek && requestedWeek <= currentWeek ? requestedWeek : currentWeek;
  const days = weekDates(weekStart);
  const selected = days.includes(selectedDate) ? selectedDate : weekStart === currentWeek ? today : days[0];
  const pastWeek = weekStart < currentWeek;
  const week = state.weeks?.[weekStart];
  const dayRecord = week?.days?.[selected] || { marks: {}, cigs: "", energy: "", activities: [] };
  const activePlan = week?.sealed && week.planSnapshot ? week.planSnapshot : plan;
  return {
    title: "My Week",
    range: formatWeekTitle(weekStart),
    heading: formatLongDay(selected),
    viewingHint: pastWeek
      ? `Earlier week. Today is ${formatDayLabel(today)}`
      : selected === today
        ? ""
        : `Today is ${formatDayLabel(today)}`,
    today,
    currentWeek,
    lastWeekStart: addCalendarDays(currentWeek, -7),
    canGoNext: pastWeek,
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
    syncLabel: syncStatusLabel(syncStatus),
    showsOtherWeeks: pastWeek,
  };
}
