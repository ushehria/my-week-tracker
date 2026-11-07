import test from "node:test";
import assert from "node:assert/strict";
import { PLAN } from "../plan.js";
import { LEGACY_PLAN } from "../legacy-plan.js";
import { pageModel } from "../page-model.js";
import { renderPage } from "../render.js";
import {
  LEGACY_STORE_KEY,
  loadState,
  sealDueWeeks,
  setMark,
} from "../store.js";
import { readOnlyLegacyStorage } from "./helpers.js";

const RAW = JSON.stringify({
  day: "sun",
  marks: { "wed:fajr": "yes", "sun:bed": "yes" },
  cigs: { wed: "1", thu: "", fri: "", sat: "", sun: "" },
  energy: { wed: "6", thu: "", fri: "", sat: "", sun: "4" },
  note: "week note stays",
});

test("Monday opens a new week immediately while the previous week stays stored", () => {
  const storage = readOnlyLegacyStorage({ [LEGACY_STORE_KEY]: RAW }, LEGACY_STORE_KEY);
  let state = loadState(storage, { legacyPlan: LEGACY_PLAN, now: new Date("2026-11-09T08:00:00Z") });
  state = sealDueWeeks(state, new Date("2026-11-09T08:00:00Z"), PLAN);
  state.weeks["2026-11-02"].analysisRead = false;

  const before = structuredClone(state.weeks["2026-11-02"]);
  const next = setMark(state, "2026-11-09", "woke", "yes");

  assert.equal(next.weeks["2026-11-09"].days["2026-11-09"].marks.woke, "yes");
  assert.deepEqual(next.weeks["2026-11-02"].days, before.days);
  assert.equal(next.weeks["2026-11-02"].note, "week note stays");
  assert.equal(next.weeks["2026-11-02"].analysisRead, false);
  assert.equal(next.weeks["2026-11-02"].legacyPlanSnapshot.habits[0].label, before.legacyPlanSnapshot.habits[0].label);
  assert.equal(storage.getItem(LEGACY_STORE_KEY), RAW);

  const model = pageModel({
    plan: PLAN,
    state: next,
    selectedDate: "2026-11-08",
    now: new Date("2026-11-09T08:00:00Z"),
    syncStatus: "pending",
  });
  assert.equal(model.selectedDate, "2026-11-09");
  assert.equal(model.weekStart, "2026-11-09");
  assert.deepEqual(model.days.map((day) => day.iso), [
    "2026-11-09",
    "2026-11-10",
    "2026-11-11",
    "2026-11-12",
    "2026-11-13",
    "2026-11-14",
    "2026-11-15",
  ]);
  const html = renderPage(model);
  assert.match(html, /data-date="2026-11-09"/);
  assert.doesNotMatch(html, /data-date="2026-11-04"/);
  assert.doesNotMatch(html, /data-date="2026-11-02"/);
  assert.match(html, /9–15 Nov/);
  assert.equal(next.outbox.some((item) => item.id === "2026-11-02"), true);
});

test("logging Monday does not wait for sync or for analysis to be read", () => {
  const storage = readOnlyLegacyStorage({ [LEGACY_STORE_KEY]: RAW }, LEGACY_STORE_KEY);
  let state = loadState(storage, { legacyPlan: LEGACY_PLAN, now: new Date("2026-11-09T08:00:00Z") });
  state = sealDueWeeks(state, new Date("2026-11-09T08:00:00Z"), PLAN);
  state.outbox[0].lastError = "Sync failed";
  state.weeks["2026-11-02"].analysisRead = false;
  const monday = setMark(state, "2026-11-09", "fajr", "yes");
  assert.equal(monday.weeks["2026-11-09"].days["2026-11-09"].marks.fajr, "yes");
  assert.equal(monday.weeks["2026-11-02"].days["2026-11-04"].marks.fajr, "yes");
  assert.equal(monday.outbox[0].lastError, "Sync failed");
  assert.equal(monday.weeks["2026-11-02"].analysisRead, false);
});
