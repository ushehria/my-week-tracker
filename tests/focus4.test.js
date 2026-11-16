import test from "node:test";
import assert from "node:assert/strict";
import { PLAN } from "../plan.js";
import { dayView } from "../day-view.js";
import { pageModel } from "../page-model.js";
import { renderPage } from "../render.js";
import { blankState, setMark, setSick } from "../store.js";

test("Focus 4 applies only to weekdays in the week of 16 Nov 2026", () => {
  const monday = dayView({ plan: PLAN, isoDate: "2026-11-16", dayRecord: { marks: {}, activities: [] } });
  const nextMonday = dayView({ plan: PLAN, isoDate: "2026-11-23", dayRecord: { marks: {}, activities: [] } });
  const earlierMonday = dayView({ plan: PLAN, isoDate: "2026-11-09", dayRecord: { marks: {}, activities: [] } });
  const sunday = dayView({ plan: PLAN, isoDate: "2026-11-22", dayRecord: { marks: {}, activities: [] } });
  assert.equal(monday.focus, true);
  assert.equal(nextMonday.focus, undefined);
  assert.equal(earlierMonday.focus, undefined);
  assert.equal(sunday.focus, undefined);
  assert.ok(nextMonday.bands.flatMap((band) => band.items).some((item) => item.id === "work1"));
  assert.ok(nextMonday.bands.flatMap((band) => band.items).some((item) => item.label.includes("15 min outside")));
});

test("Tuesday uses the Focus 4 layout and keeps bonus collapsed", () => {
  const state = setMark(blankState(), "2026-11-17", "meds_am", "yes");
  const withCigs = structuredClone(state);
  withCigs.weeks["2026-11-16"].days["2026-11-17"].cigs = "8";
  const model = pageModel({
    plan: PLAN,
    state: withCigs,
    selectedDate: "2026-11-17",
    now: new Date("2026-11-17T12:00:00Z"),
    syncStatus: "unsigned",
  });
  assert.equal(model.view.focus, true);
  assert.equal(model.view.focusTitle, "⭐ Focus 4");
  assert.deepEqual(model.view.focusItems.map((item) => item.label), [
    "Morning medicines on time",
    "Nap",
    "Asr",
  ]);
  assert.equal(model.view.focusItems[1].time, "75-minute alarm");
  assert.equal(model.view.bonusItems.find((item) => item.id === "breakfast").label, "Breakfast or a small bite");
  assert.equal(model.view.bonusItems.find((item) => item.id === "bed").label, "In bed by 10");
  assert.deepEqual(model.view.alwaysItems.map((item) => item.id), ["dinner", "family", "meds_pm"]);
  const html = renderPage(model);
  assert.match(html, /⭐ Focus 4/);
  assert.match(html, /id="bonus-body" hidden/);
  assert.match(html, /target ≤ 15/);
  assert.match(html, /cig-target ok/);
  assert.match(html, /id="cigs-dec"/);
  assert.match(html, /id="cigs-inc"/);
  assert.match(html, /Dinner with family/);
  assert.match(html, /Family time/);
  assert.match(html, /Evening medicines/);
  assert.match(html, /Energy 1–10/);
  assert.match(html, /🤒 Sick day/);
  assert.match(html, /id="day-note"/);
  assert.match(html, /Call mother/);
  assert.match(html, /Call father/);
  assert.doesNotMatch(html, /Minimum plan/);
  assert.equal(model.view.focusItems.find((item) => item.id === "meds_am").mark, "yes");
});

test("a count above 15 is amber and a sick day shows the minimum plan", () => {
  let state = setSick(blankState(), "2026-11-17", true);
  state.weeks["2026-11-16"].days["2026-11-17"].cigs = "18";
  state = setMark(state, "2026-11-17", "woke", "no");
  const model = pageModel({
    plan: PLAN,
    state,
    selectedDate: "2026-11-17",
    now: new Date("2026-11-17T12:00:00Z"),
    syncStatus: "unsigned",
  });
  model.bonusOpen = true;
  const html = renderPage(model);
  assert.match(html, /cig-target over/);
  assert.match(html, /id="sick-day" checked/);
  assert.match(html, /Minimum plan/);
  assert.match(html, /Bonus items are not missed today/);
  assert.match(html, /data-habit="rest"/);
  assert.match(html, /data-habit="water"/);
  assert.match(html, /data-habit="lunch"/);
  const woke = model.view.bonusItems.find((item) => item.id === "woke");
  const fajr = model.view.bonusItems.find((item) => item.id === "fajr");
  assert.equal(woke.mark, "no");
  assert.equal(fajr.mark, "");
  assert.match(html, /data-habit="fajr"[\s\S]*class="mark skip"/);
  assert.match(html, /data-habit="woke"[\s\S]*class="mark no"/);
});
