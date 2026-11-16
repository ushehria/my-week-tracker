// Editable week plan. Habit copy, times, and day layouts live here.
// The renderer reads this object; changing it does not require a new renderer.

export const PLAN = {
  id: "rhythm-v1",
  timezone: "Europe/London",
  weekStartsOn: "monday",
  layouts: {
    weekday: {
      bands: ["Morning", "Morning work", "Midday", "Afternoon", "Evening", "Night", "Daily totals"],
    },
    focus4: {
      focus: true,
      bands: ["Morning", "Morning work", "Midday", "Afternoon", "Evening", "Night", "Daily totals"],
      title: "⭐ Focus 4",
      focusItems: [
        { id: "meds_am", label: "Morning medicines on time", time: "" },
        { id: "nap", label: "Nap", time: "75-minute alarm" },
        { id: "asr" },
      ],
      cigsTarget: 15,
      cigsTargetLabel: "target ≤ 15",
      bonusTitle: "Bonus",
      bonusItems: [
        { id: "woke" },
        { id: "fajr" },
        { id: "breakfast", label: "Breakfast or a small bite", time: "" },
        { id: "work1" },
        { id: "dhuhr" },
        { id: "lunch" },
        { id: "coffee" },
        { id: "work2" },
        { id: "maghrib" },
        { id: "exercise", label: "Exercise / cycling" },
        { id: "isha" },
        { id: "daylight", label: "Daylight", time: "15 min before Maghrib" },
        { id: "water" },
        { id: "bed", label: "In bed by 10", time: "" },
      ],
      alwaysTitle: "Always",
      alwaysItems: [
        { id: "dinner" },
        { id: "family" },
        { id: "meds_pm" },
      ],
      sickTitle: "Minimum plan",
      sickNote: "Bonus items are not missed today.",
      sickItems: [
        { id: "meds_am", label: "Medicines", time: "" },
        { id: "meds_pm", label: "Evening medicines", time: "" },
        { id: "water" },
        { id: "lunch" },
      ],
      restLabel: "Rest",
    },
    open: {
      flexible: true,
      banner: "No PhD",
      prayers: ["fajr", "dhuhr", "asr", "maghrib", "isha"],
      checkins: ["meds_am", "meds_pm"],
    },
  },
  days: {
    mon: { layout: "focus4" },
    tue: { layout: "focus4" },
    wed: { layout: "focus4" },
    thu: { layout: "focus4" },
    fri: { layout: "focus4" },
    sat: { layout: "open" },
    sun: { layout: "weekday" },
  },
  habits: [
    { id: "fajr", label: "Fajr", time: "~5:45", band: "Morning" },
    { id: "woke", label: "Woke", time: "6:30–7", band: "Morning" },
    { id: "meds_am", label: "Morning medicines", band: "Morning" },
    { id: "daylight", label: "Daylight: 15 min outside, any time before Maghrib", band: "Morning" },
    { id: "breakfast", label: "Breakfast", time: "before 8:30", band: "Morning" },
    {
      id: "work1",
      label: "Work block 1",
      time: "8:30 – Dhuhr",
      band: "Morning work",
      layouts: ["weekday", "focus4"],
      days: {
        sun: { note: "Plan week + meal prep with Taif" },
      },
    },
    {
      id: "dhuhr",
      label: "Dhuhr",
      time: "~12:00",
      band: "Midday",
      days: {
        fri: {
          label: "صلاة الجمعة",
          time: "Sussex prayer room · arrive 12:10 · starts 12:20 UK",
        },
      },
    },
    { id: "lunch", label: "Lunch", band: "Midday" },
    { id: "nap", label: "Nap 60–75 min (set alarm)", time: "1–2 PM", band: "Midday" },
    { id: "coffee", label: "Last coffee", time: "before 2:30 PM", band: "Midday" },
    { id: "asr", label: "Asr", time: "~2:15", band: "Afternoon" },
    {
      id: "work2",
      label: "Work block 2",
      band: "Afternoon",
      layouts: ["weekday", "focus4"],
      days: {
        fri: { note: "Teaching 3–5 PM UK" },
        sun: { note: "Rest / family" },
      },
    },
    { id: "maghrib", label: "Maghrib", time: "~4:25", band: "Afternoon" },
    {
      id: "exercise",
      label: "Exercise",
      band: "Afternoon",
      days: {
        wed: { note: "Gym 1 — easy 30–40 min" },
        thu: { note: "Walk 20–30 min after Maghrib" },
        fri: { note: "Gym 2 or walk" },
        sat: { note: "Gym 3 or volleyball" },
        sun: { note: "Optional walk" },
      },
    },
    { id: "isha", label: "Isha", time: "~6:00", band: "Evening" },
    { id: "dinner", label: "Dinner with family", band: "Evening" },
    { id: "family", label: "Family time", time: "7–9 PM", note: "Laptop closed", band: "Evening" },
    { id: "meds_pm", label: "Evening medicines", time: "~9 PM", band: "Night" },
    { id: "bed", label: "In bed", time: "9:30–10", band: "Night" },
    { id: "water", label: "Water ~2 L", band: "Daily totals" },
  ],
};

export function editHabitTime(plan, habitId, time) {
  const next = structuredClone(plan);
  const habit = next.habits.find((item) => item.id === habitId);
  if (!habit) throw new Error(`Unknown habit: ${habitId}`);
  habit.time = time;
  return next;
}
