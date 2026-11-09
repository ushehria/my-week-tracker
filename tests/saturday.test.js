import test from "node:test";
import assert from "node:assert/strict";
import { PLAN } from "../plan.js";
import { dayView } from "../day-view.js";
import { pageModel } from "../page-model.js";
import { renderPage } from "../render.js";
import { addActivity, blankState, saveFlexibleActivity, setMark } from "../store.js";

const blankDay = { marks: {}, activities: [] };

test("Saturday keeps prayers and medicines and does not impose a fixed day plan", () => {
  const view = dayView({ plan: PLAN, isoDate: "2026-11-07", dayRecord: blankDay });
  assert.equal(view.flexible, true);
  assert.equal(view.banner, "No PhD");
  assert.equal(view.activities.items.length, 0);
  const prayers = Object.fromEntries(view.prayers.map((item) => [item.id, item]));
  assert.equal(prayers.fajr.time, "~5:45");
  assert.equal(prayers.dhuhr.time, "~12:00");
  assert.equal(prayers.asr.time, "~2:15");
  assert.equal(prayers.maghrib.time, "~4:25");
  assert.equal(prayers.isha.time, "~6:00");
  assert.equal(view.checkins.map((item) => item.id).join(","), "meds_am,meds_pm");
  assert.equal(view.checkins.every((item) => item.time === ""), true);
  assert.deepEqual(view.preserved, []);
  const html = renderPage(pageModel({
    plan: PLAN,
    state: blankState(),
    selectedDate: "2026-11-07",
    now: new Date("2026-11-07T15:00:00Z"),
    syncStatus: "inactive",
  }));
  assert.match(html, /Call mother/);
  assert.match(html, /Call father/);
  assert.match(html, /id="call-prompt" hidden/);
  assert.doesNotMatch(html, /Breakfast/);
  assert.doesNotMatch(html, /Work block/);
  assert.doesNotMatch(html, /8:30–Dhuhr/);
  assert.match(html, /Sync off\. Logs stay on this phone\./);
});

test("Saturday windows keep an editable time range, place, and duration", () => {
  const saved = saveFlexibleActivity(blankState(), "2026-11-07", {
    id: "window-1",
    title: "park",
    start: "10:00",
    end: "12:30",
  });
  assert.equal(saved.ok, true);
  const state = saved.state;
  const day = state.weeks["2026-11-02"].days["2026-11-07"];
  assert.deepEqual(day.activities, [
    { id: "window-1", title: "park", place: "park", start: "10:00", end: "12:30", duration: "2h 30m" },
  ]);
  const model = pageModel({
    plan: PLAN,
    state,
    selectedDate: "2026-11-07",
    now: new Date("2026-11-07T15:00:00Z"),
    syncStatus: "inactive",
  });
  const html = renderPage(model);
  assert.match(html, /No PhD/);
  assert.doesNotMatch(html, /Work block/);
  assert.doesNotMatch(html, /Washbrooks/);
  assert.match(html, /data-field="start"/);
  assert.match(html, /data-field="end"/);
  assert.match(html, /data-field="title"/);
  assert.match(html, /value="10:00"/);
  assert.match(html, /value="12:30"/);
  assert.match(html, /value="park"/);
  assert.match(html, />2h 30m</);
});

test("saved Saturday entries stay visible and overlaps are refused", () => {
  let state = setMark(blankState(), "2026-11-04", "fajr", "yes");
  state = setMark(state, "2026-11-07", "family", "yes");
  state = addActivity(state, "2026-11-07", {
    id: "morning",
    start: "09:00",
    end: "11:00",
    place: "library",
    duration: "2h",
  });
  const before = structuredClone(state);
  const overlap = saveFlexibleActivity(state, "2026-11-07", {
    id: "later",
    title: "walk",
    start: "10:00",
    end: "12:00",
  });
  assert.equal(overlap.ok, false);
  assert.match(overlap.error, /Overlaps library/);
  assert.deepEqual(overlap.state, before);
  const touching = saveFlexibleActivity(state, "2026-11-07", {
    id: "later",
    title: "walk",
    start: "11:00",
    end: "12:30",
  });
  assert.equal(touching.ok, true);
  const acrossPrayer = saveFlexibleActivity(touching.state, "2026-11-07", {
    id: "span",
    title: "errand",
    start: "12:30",
    end: "13:30",
  });
  assert.equal(acrossPrayer.ok, true);
  const view = dayView({
    plan: PLAN,
    isoDate: "2026-11-07",
    dayRecord: acrossPrayer.state.weeks["2026-11-02"].days["2026-11-07"],
  });
  assert.equal(view.prayers.find((item) => item.id === "dhuhr").time, "~12:00");
  assert.deepEqual(view.activities.items.map((item) => item.title), ["library", "walk", "errand"]);
  assert.equal(view.preserved.find((item) => item.id === "family").label, "Family time");
  assert.equal(view.preserved.find((item) => item.id === "family").time, "");
  assert.equal(acrossPrayer.state.weeks["2026-11-02"].days["2026-11-04"].marks.fajr, "yes");
  const missing = saveFlexibleActivity(acrossPrayer.state, "2026-11-07", { id: "bad", title: "x", start: "15:00", end: "" });
  assert.equal(missing.ok, false);
  assert.match(missing.error, /start and end/);
  const backwards = saveFlexibleActivity(acrossPrayer.state, "2026-11-07", { id: "bad", title: "x", start: "16:00", end: "15:00" });
  assert.equal(backwards.ok, false);
  assert.match(backwards.error, /after the start/);
});

test("activity text is escaped", () => {
  const state = addActivity(blankState(), "2026-11-07", {
    id: "window-1",
    place: `<img alt="x" onerror="alert(1)">`,
    duration: "1h",
  });
  const html = renderPage(pageModel({
    plan: PLAN,
    state,
    selectedDate: "2026-11-07",
    now: new Date("2026-11-07T15:00:00Z"),
    syncStatus: "inactive",
  }));
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img/);
});

test("a different plan layout changes Saturday without a renderer change", () => {
  const custom = structuredClone(PLAN);
  custom.days.sat.layout = "weekday";
  const view = dayView({ plan: custom, isoDate: "2026-11-07", dayRecord: blankDay });
  assert.equal(view.layout, "weekday");
  assert.equal(view.activities, null);
  const labels = view.bands.flatMap((band) => band.items.map((item) => item.label));
  assert.ok(labels.includes("Work block 1"));
  const stock = dayView({ plan: PLAN, isoDate: "2026-11-07", dayRecord: blankDay });
  assert.equal(stock.banner, "No PhD");
});
