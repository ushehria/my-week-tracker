import test from "node:test";
import assert from "node:assert/strict";
import { PLAN } from "../plan.js";
import { dayView } from "../day-view.js";
import { pageModel } from "../page-model.js";
import { renderPage } from "../render.js";
import { blankState } from "../store.js";

const blankDay = { marks: {}, activities: [] };

test("Friday says صلاة الجمعة with Sussex prayer room and teaching times", () => {
  const view = dayView({ plan: PLAN, isoDate: "2026-11-06", dayRecord: blankDay });
  const items = view.bands.flatMap((band) => band.items);
  const jumuah = items.find((item) => item.label.includes("صلاة الجمعة"));
  assert.ok(jumuah, "expected the Friday Arabic label");
  assert.match(jumuah.time, /Sussex prayer room/);
  assert.match(jumuah.time, /arrive 12:10/);
  assert.match(jumuah.time, /starts 12:20/);
  assert.match(jumuah.time, /UK/);

  const teaching = items.find((item) => /3–5 PM UK/.test(`${item.label} ${item.time} ${item.note}`));
  assert.ok(teaching, "expected teaching 3–5 PM UK");
});

test("Friday Arabic label is rendered for that London day", () => {
  const model = pageModel({
    plan: PLAN,
    state: blankState(),
    selectedDate: "2026-11-06",
    now: new Date("2026-11-06T12:00:00Z"),
    syncStatus: "inactive",
  });
  const html = renderPage(model);
  assert.match(html, /صلاة الجمعة/);
  assert.match(html, /Sussex prayer room/);
  assert.match(html, /arrive 12:10/);
  assert.match(html, /starts 12:20/);
  assert.match(html, /3–5 PM UK/);
  assert.match(html, /Friday 6 Nov/);
  assert.match(html, /Sync off\. Logs stay on this phone\./);
});

test("usual rhythm times are plan data", () => {
  const view = dayView({ plan: PLAN, isoDate: "2026-11-04", dayRecord: blankDay });
  const items = view.bands.flatMap((band) => band.items);
  const byId = Object.fromEntries(items.map((item) => [item.id, item]));
  assert.equal(byId.woke.time, "6:30–7");
  assert.match(byId.nap.time, /20–30 min/);
  assert.match(byId.nap.time, /1–2 PM/);
  assert.match(byId.family.time, /7–9/);
  assert.equal(byId.bed.time, "9:30–10");
});
