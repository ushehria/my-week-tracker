import test from "node:test";
import assert from "node:assert/strict";
import { LEGACY_PLAN } from "../legacy-plan.js";
import {
  LEGACY_STORE_KEY,
  STORE_KEY,
  clearDay,
  loadState,
  setMark,
} from "../store.js";
import { readOnlyLegacyStorage } from "./helpers.js";
import { pageModel } from "../page-model.js";
import { PLAN } from "../plan.js";

function legacyFixture() {
  return {
    day: "sat",
    marks: {
      "wed:fajr": "yes",
      "wed:meds_am": "yes",
      "thu:work1": "no",
      "fri:dhuhr": "yes",
      "sat:family": "yes",
      "sat:work1": "yes",
      "sun:bed": "no",
      "mon:fajr": "yes",
    },
    cigs: { wed: "1", thu: "0", fri: "", sat: "2", sun: "0", mon: "9" },
    energy: { wed: "6", thu: "7", fri: "8", sat: "5", sun: "9" },
    note: "synthetic fixture note",
  };
}

test("migration keeps Wed 4–Sun 8 Nov 2026 logs and the original key", () => {
  const legacy = legacyFixture();
  const raw = JSON.stringify(legacy);
  const legacyPlan = structuredClone(LEGACY_PLAN);
  const storage = readOnlyLegacyStorage({ [LEGACY_STORE_KEY]: raw }, LEGACY_STORE_KEY);

  const state = loadState(storage, { legacyPlan, now: new Date("2026-11-07T12:00:00Z") });
  const week = state.weeks["2026-11-02"];

  assert.equal(storage.getItem(LEGACY_STORE_KEY), raw);
  assert.equal(week.days["2026-11-04"].marks.fajr, "yes");
  assert.equal(week.days["2026-11-04"].marks.meds_am, "yes");
  assert.equal(week.days["2026-11-04"].cigs, "1");
  assert.equal(week.days["2026-11-04"].energy, "6");
  assert.equal(week.days["2026-11-05"].marks.work1, "no");
  assert.equal(week.days["2026-11-05"].cigs, "0");
  assert.equal(week.days["2026-11-05"].energy, "7");
  assert.equal(week.days["2026-11-06"].marks.dhuhr, "yes");
  assert.equal(week.days["2026-11-06"].energy, "8");
  assert.equal(week.days["2026-11-07"].marks.family, "yes");
  assert.equal(week.days["2026-11-07"].marks.work1, "yes");
  assert.equal(week.days["2026-11-07"].cigs, "2");
  assert.equal(week.days["2026-11-07"].energy, "5");
  assert.deepEqual(week.days["2026-11-07"].activities, []);
  assert.equal(week.days["2026-11-08"].marks.bed, "no");
  assert.equal(week.days["2026-11-08"].cigs, "0");
  assert.equal(week.days["2026-11-08"].energy, "9");
  assert.equal(week.note, "synthetic fixture note");
  assert.equal(week.unmappedMarks["mon:fajr"], "yes");
  assert.equal(week.unmappedCigs.mon, "9");
  assert.equal(JSON.stringify(week).includes("Washbrooks"), false);

  legacyPlan.habits[0].label = "MUTATED";
  assert.notEqual(week.legacyPlanSnapshot.habits[0].label, "MUTATED");
  assert.equal(week.legacyPlanSnapshot.habits[0].label, LEGACY_PLAN.habits[0].label);

  const again = loadState(storage, { legacyPlan, now: new Date("2026-11-07T13:00:00Z") });
  assert.equal(again.weeks["2026-11-02"].note, "synthetic fixture note");
  assert.equal(storage.getItem(LEGACY_STORE_KEY), raw);
  assert.ok(storage.getItem(STORE_KEY).includes("synthetic fixture note"));

  const saved = JSON.parse(storage.getItem(STORE_KEY));
  saved.weeks["2026-11-02"].days["2026-11-07"].marks.nap = "yes";
  storage.setItem(STORE_KEY, JSON.stringify(saved));
  const reloaded = loadState(storage, { legacyPlan: LEGACY_PLAN, now: new Date("2026-11-07T14:00:00Z") });
  assert.equal(reloaded.weeks["2026-11-02"].days["2026-11-07"].marks.nap, "yes");
  assert.equal(reloaded.weeks["2026-11-02"].days["2026-11-07"].marks.family, "yes");
  assert.equal(storage.getItem(LEGACY_STORE_KEY), raw);
});

test("clearing one day does not wipe the legacy backup or other days", () => {
  const raw = JSON.stringify(legacyFixture());
  const storage = readOnlyLegacyStorage({ [LEGACY_STORE_KEY]: raw }, LEGACY_STORE_KEY);
  const state = loadState(storage, { legacyPlan: LEGACY_PLAN, now: new Date("2026-11-07T12:00:00Z") });
  const cleared = clearDay(state, "2026-11-04");
  assert.deepEqual(cleared.weeks["2026-11-02"].days["2026-11-04"].marks, {});
  assert.equal(cleared.weeks["2026-11-02"].days["2026-11-04"].cigs, "");
  assert.equal(cleared.weeks["2026-11-02"].days["2026-11-05"].marks.work1, "no");
  assert.equal(cleared.weeks["2026-11-02"].note, "synthetic fixture note");
  assert.equal(storage.getItem(LEGACY_STORE_KEY), raw);

  const model = pageModel({
    plan: PLAN,
    state: cleared,
    selectedDate: "2026-11-04",
    now: new Date("2026-11-07T12:00:00Z"),
    syncStatus: "inactive",
  });
  assert.equal(model.note, "synthetic fixture note");
  assert.equal(model.cigs, "");
  const thursday = pageModel({
    plan: PLAN,
    state: cleared,
    selectedDate: "2026-11-05",
    now: new Date("2026-11-07T12:00:00Z"),
    syncStatus: "inactive",
  });
  assert.equal(thursday.cigs, "0");
  assert.equal(setMark(cleared, "2026-11-04", "fajr", "no").weeks["2026-11-02"].days["2026-11-05"].marks.work1, "no");
});
