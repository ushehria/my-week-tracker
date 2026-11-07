import test from "node:test";
import assert from "node:assert/strict";
import { PLAN } from "../plan.js";
import { dayView } from "../day-view.js";
import { pageModel } from "../page-model.js";
import { renderPage } from "../render.js";
import { addActivity, blankState, updateActivity } from "../store.js";

const blankDay = { marks: {}, activities: [] };

function itemText(view) {
  return view.bands.flatMap((band) => band.items.map((item) => `${item.label} ${item.time} ${item.note}`)).join("\n");
}

test("Saturday is an open day with no work blocks and no invented outing", () => {
  const view = dayView({ plan: PLAN, isoDate: "2026-11-07", dayRecord: blankDay });
  assert.equal(view.layout, "open");
  assert.equal(view.banner, "No PhD");
  assert.equal(view.activities.items.length, 0);
  assert.deepEqual(view.activities.fields, ["start", "end", "place", "duration"]);
  const text = itemText(view);
  assert.doesNotMatch(text, /Work block/i);
  assert.doesNotMatch(text, /Washbrooks/);
  assert.equal(view.bands.some((band) => band.title === "Morning work"), false);
  const items = view.bands.flatMap((band) => band.items);
  const byId = Object.fromEntries(items.map((item) => [item.id, item]));
  assert.equal(byId.work1, undefined);
  assert.equal(byId.work2, undefined);
  assert.equal(byId.woke.time, "6:30–7");
  assert.match(byId.nap.time, /20–30 min/);
  assert.match(byId.family.time, /7–9/);
  assert.equal(byId.bed.time, "9:30–10");
});

test("Saturday windows keep an editable time range, place, and duration", () => {
  let state = addActivity(blankState(), "2026-11-07", {
    id: "window-1",
    start: "",
    end: "",
    place: "",
    duration: "",
  });
  state = updateActivity(state, "2026-11-07", "window-1", {
    start: "10:00",
    end: "12:30",
    place: "park",
    duration: "2h 30m",
  });
  const day = state.weeks["2026-11-02"].days["2026-11-07"];
  assert.deepEqual(day.activities, [
    { id: "window-1", start: "10:00", end: "12:30", place: "park", duration: "2h 30m" },
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
  assert.match(html, /data-field="place"/);
  assert.match(html, /data-field="duration"/);
  assert.match(html, /value="10:00"/);
  assert.match(html, /value="park"/);
  assert.match(html, /Add a window/);
});

test("Saturday renders an empty window list until the user adds one", () => {
  const model = pageModel({
    plan: PLAN,
    state: blankState(),
    selectedDate: "2026-11-07",
    now: new Date("2026-11-07T15:00:00Z"),
    syncStatus: "inactive",
  });
  const html = renderPage(model);
  assert.match(html, /Add a window/);
  assert.doesNotMatch(html, /Washbrooks/);
  assert.equal(model.view.activities.items.length, 0);
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
