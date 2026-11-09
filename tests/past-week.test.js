import test from "node:test";
import assert from "node:assert/strict";
import { PLAN } from "../plan.js";
import { LEGACY_PLAN } from "../legacy-plan.js";
import { pageModel } from "../page-model.js";
import { renderPage } from "../render.js";
import { LEGACY_STORE_KEY, STORE_KEY, loadState } from "../store.js";
import { createViewController } from "../view-date.js";
import { memoryStorage } from "./helpers.js";
import { weekSummary } from "../week-summary.js";

const legacy = {
  day: "sun",
  marks: { "wed:fajr": "yes", "sun:bed": "no" },
  cigs: { wed: "1", sun: "" },
  energy: { wed: "6", sun: "4" },
  note: "week note stays",
};

const monday = new Date("2026-11-09T08:00:00Z");

test("a stored 2026-11-02 week is still summarised when today is 2026-11-09", () => {
  const seeded = loadState(memoryStorage({ [LEGACY_STORE_KEY]: JSON.stringify(legacy) }), { legacyPlan: LEGACY_PLAN });
  const storage = memoryStorage({
    [LEGACY_STORE_KEY]: JSON.stringify(legacy),
    [STORE_KEY]: JSON.stringify(seeded),
  });
  const state = loadState(storage, { legacyPlan: LEGACY_PLAN });
  const before = structuredClone(state);
  const legacyRaw = storage.getItem(LEGACY_STORE_KEY);

  const current = pageModel({
    plan: PLAN,
    state,
    selectedDate: "2026-11-09",
    now: monday,
    syncStatus: "unsigned",
  });
  assert.equal(current.weekStart, "2026-11-09");
  assert.equal(current.lastWeekStart, "2026-11-02");
  const html = renderPage(current);
  assert.match(html, />Previous week</);
  assert.match(html, />Next week</);
  assert.match(html, />Copy last week summary</);
  assert.match(html, /id="next-week"[^>]*disabled/);

  const text = weekSummary({ state, plan: PLAN, weekStart: current.lastWeekStart });
  assert.match(text, /Wednesday 4 Nov/);
  assert.match(text, /Sunday 8 Nov/);
  assert.match(text, /Fajr: yes/);
  assert.match(text, /In bed: no/);
  assert.match(text, /Cigarettes: 1/);
  assert.match(text, /Week note: week note stays/);
  assert.doesNotMatch(text, /Monday/);
  assert.doesNotMatch(text, /Tuesday/);
  assert.doesNotMatch(text, /supabase|access_token|Bearer|sb_publishable/i);

  const viewed = pageModel({
    plan: PLAN,
    state,
    selectedDate: "2026-11-04",
    weekStart: "2026-11-02",
    now: monday,
    syncStatus: "unsigned",
  });
  assert.equal(viewed.weekStart, "2026-11-02");
  assert.equal(viewed.selectedDate, "2026-11-04");
  assert.equal(viewed.canGoNext, true);
  const fajr = viewed.view.bands.flatMap((band) => band.items).find((item) => item.id === "fajr");
  assert.equal(fajr.mark, "yes");
  assert.match(renderPage(viewed), /data-date="2026-11-04"/);

  assert.deepEqual(state, before);
  assert.equal(storage.getItem(LEGACY_STORE_KEY), legacyRaw);
  assert.equal(storage.getItem(STORE_KEY), JSON.stringify(seeded));
});

test("previous week can be opened and the current week returns on resume", () => {
  const view = createViewController({ now: () => monday });
  assert.equal(view.weekStart(), "2026-11-09");
  view.showWeek("2026-11-02", "2026-11-04");
  assert.equal(view.weekStart(), "2026-11-02");
  assert.equal(view.selectedDate(), "2026-11-04");
  view.showWeek("2026-11-16", "2026-11-16");
  assert.equal(view.weekStart(), "2026-11-02");
  view.resume();
  assert.equal(view.selectedDate(), "2026-11-09");
  assert.equal(view.weekStart(), "2026-11-09");
});
