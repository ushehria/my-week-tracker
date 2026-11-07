// Snapshot of the plan that the 4–8 Nov 2026 logs were recorded against.
// Stored with a migrated week so later edits to plan.js do not rewrite it.
// Place names are not copied forward; the original localStorage key remains the backup.

export const LEGACY_PLAN = {
  id: "legacy-4-8-nov-2026",
  timezone: "Europe/London",
  days: ["wed", "thu", "fri", "sat", "sun"],
  habits: [
    { id: "fajr", label: "Fajr", time: "~5:45", band: "Morning" },
    { id: "woke", label: "Woke", time: "6:30–7:00", band: "Morning" },
    { id: "meds_am", label: "Morning medicines", band: "Morning" },
    { id: "daylight", label: "Daylight + water", band: "Morning" },
    { id: "breakfast", label: "Breakfast", time: "before 8:30", band: "Morning" },
    {
      id: "work1",
      label: "Work block 1",
      time: "8:30 – Dhuhr",
      band: "Morning work",
      skip: { sat: true },
      days: {
        sat: { note: "No PhD work" },
        sun: { note: "Plan week + meal prep with Taif" },
      },
    },
    {
      id: "dhuhr",
      label: "Dhuhr",
      time: "~12:00",
      band: "Midday",
      days: {
        fri: { label: "صلاة الجمعة 🕌", time: "Sussex prayer room · be there 12:10 · starts 12:20" },
      },
    },
    { id: "lunch", label: "Lunch", band: "Midday" },
    { id: "nap", label: "Nap ≤ 30 min", time: "1–2 PM", band: "Midday" },
    { id: "coffee", label: "Last coffee", time: "before 2:30 PM", band: "Midday" },
    { id: "asr", label: "Asr", time: "~2:15", band: "Afternoon" },
    {
      id: "work2",
      label: "Work block 2",
      band: "Afternoon",
      days: {
        fri: { note: "Teach G5039 3–5 PM" },
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
    { id: "family", label: "Family time", time: "7–9 PM · laptop closed", band: "Evening" },
    { id: "meds_pm", label: "Evening medicines", time: "~9 PM", band: "Night" },
    { id: "bed", label: "In bed by 10 PM", band: "Night" },
    { id: "water", label: "Water ~2 L", band: "Daily totals" },
  ],
};
