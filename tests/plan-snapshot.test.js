import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PLAN, editHabitTime } from "../plan.js";
import { dayView } from "../day-view.js";
import { pageModel } from "../page-model.js";
import { blankState, sealDueWeeks, setMark } from "../store.js";

test("editing a plan copy does not change the stock plan or a sealed snapshot", () => {
  const edited = editHabitTime(PLAN, "woke", "8:00");
  assert.equal(edited.habits.find((habit) => habit.id === "woke").time, "8:00");
  assert.equal(PLAN.habits.find((habit) => habit.id === "woke").time, "6:30–7");

  let state = setMark(blankState(), "2026-11-04", "fajr", "yes");
  const template = structuredClone(PLAN);
  state = sealDueWeeks(state, new Date("2026-11-08T23:00:00Z"), template);
  template.habits.find((habit) => habit.id === "woke").time = "CHANGED";
  assert.equal(state.weeks["2026-11-02"].planSnapshot.habits.find((habit) => habit.id === "woke").time, "6:30–7");
  assert.equal(state.outbox[0].payload.planSnapshot.habits.find((habit) => habit.id === "woke").time, "6:30–7");

  state.outbox[0].payload.planSnapshot.habits.find((habit) => habit.id === "woke").time = "PAYLOAD";
  assert.equal(state.weeks["2026-11-02"].planSnapshot.habits.find((habit) => habit.id === "woke").time, "6:30–7");
});

test("the open week follows plan data and a sealed week keeps its snapshot", () => {
  const custom = structuredClone(PLAN);
  custom.habits.find((habit) => habit.id === "dhuhr").days.fri.label = "CUSTOM";
  const customView = dayView({
    plan: custom,
    isoDate: "2026-11-06",
    dayRecord: { marks: {}, activities: [] },
  });
  assert.equal(customView.bands.flatMap((band) => band.items).find((item) => item.id === "dhuhr").label, "CUSTOM");
  const stock = dayView({
    plan: PLAN,
    isoDate: "2026-11-06",
    dayRecord: { marks: {}, activities: [] },
  });
  assert.match(stock.bands.flatMap((band) => band.items).find((item) => item.id === "dhuhr").label, /صلاة الجمعة/);

  let state = setMark(blankState(), "2026-11-06", "dhuhr", "yes");
  const frozen = structuredClone(PLAN);
  frozen.habits.find((habit) => habit.id === "dhuhr").days.fri.label = "Frozen label";
  state.weeks["2026-11-02"].sealed = true;
  state.weeks["2026-11-02"].planSnapshot = frozen;

  const historical = pageModel({
    plan: PLAN,
    state,
    selectedDate: "2026-11-06",
    now: new Date("2026-11-07T12:00:00Z"),
    syncStatus: "inactive",
  });
  assert.equal(
    historical.view.bands.flatMap((band) => band.items).find((item) => item.id === "dhuhr").label,
    "Frozen label",
  );

  const later = pageModel({
    plan: PLAN,
    state,
    selectedDate: "2026-11-13",
    now: new Date("2026-11-13T12:00:00Z"),
    syncStatus: "inactive",
  });
  assert.match(
    later.view.bands.flatMap((band) => band.items).find((item) => item.id === "dhuhr").label,
    /صلاة الجمعة/,
  );
  assert.equal(state.weeks["2026-11-02"].planSnapshot.habits.find((habit) => habit.id === "dhuhr").days.fri.label, "Frozen label");
  assert.equal(later.days.some((day) => day.iso === "2026-11-06"), false);
});

test("habit copy stays in plan data rather than the renderer", () => {
  const files = ["day-view.js", "page-model.js", "render.js", "app.js", "store.js", "sync.js"];
  const banned = ["صلاة الجمعة", "Work block", "Washbrooks", "Sussex prayer room", "6:30–7", "No PhD"];
  for (const file of files) {
    const source = fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    for (const phrase of banned) {
      assert.equal(source.includes(phrase), false, `${file} should not contain ${phrase}`);
    }
  }
  assert.equal(JSON.parse(JSON.stringify(PLAN)).id, PLAN.id);
});
