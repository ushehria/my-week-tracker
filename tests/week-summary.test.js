import test from "node:test";
import assert from "node:assert/strict";
import { PLAN } from "../plan.js";
import { LEGACY_PLAN } from "../legacy-plan.js";
import { LEGACY_STORE_KEY, loadState, setMark } from "../store.js";
import { memoryStorage } from "./helpers.js";
import { weekSummary } from "../week-summary.js";

const legacy = {
  day: "sat",
  marks: {
    "wed:fajr": "yes",
    "wed:work1": "no",
    "thu:nap": "yes",
    "fri:dhuhr": "yes",
    "sat:family": "yes",
    "sun:bed": "no",
  },
  cigs: { wed: "1", thu: "", fri: "0", sat: "2", sun: "" },
  energy: { wed: "6", thu: "7", fri: "", sat: "5", sun: "9" },
  note: "week note stays",
};

test("the first copy includes only Wed 4–Sun 8 and keeps yes, no, and unlogged apart", () => {
  const storage = memoryStorage({ [LEGACY_STORE_KEY]: JSON.stringify(legacy) });
  const before = storage.getItem(LEGACY_STORE_KEY);
  let state = loadState(storage, { legacyPlan: LEGACY_PLAN });
  state = {
    ...state,
    weeks: {
      ...state.weeks,
      "2026-11-02": {
        ...state.weeks["2026-11-02"],
        days: {
          ...state.weeks["2026-11-02"].days,
          "2026-11-07": {
            ...state.weeks["2026-11-02"].days["2026-11-07"],
            activities: [{ id: "window-1", start: "10:00", end: "12:30", place: "library", duration: "2h 30m" }],
          },
        },
      },
    },
  };
  const snapshot = structuredClone(state);
  const text = weekSummary({ state, plan: PLAN, weekStart: "2026-11-02" });
  assert.deepEqual(state, snapshot);
  assert.equal(storage.getItem(LEGACY_STORE_KEY), before);
  assert.match(text, /Wednesday 4 Nov/);
  assert.match(text, /Thursday 5 Nov/);
  assert.match(text, /Friday 6 Nov/);
  assert.match(text, /Saturday 7 Nov/);
  assert.match(text, /Sunday 8 Nov/);
  assert.doesNotMatch(text, /Monday/);
  assert.doesNotMatch(text, /Tuesday/);
  assert.doesNotMatch(text, /2 Nov/);
  assert.doesNotMatch(text, /3 Nov/);
  assert.match(text, /Fajr: yes/);
  assert.match(text, /Work block 1: no/);
  assert.match(text, /Nap 60–75 min \(set alarm\): yes/);
  assert.match(text, /صلاة الجمعة: yes/);
  assert.match(text, /Family time: yes/);
  assert.match(text, /In bed: no/);
  assert.match(text, /Woke: unlogged/);
  assert.match(text, /Cigarettes: 1/);
  assert.match(text, /Cigarettes: unlogged/);
  assert.match(text, /Energy 1–10: 9/);
  assert.match(text, /Week note: week note stays/);
  assert.match(text, /library: 10:00–12:30 · library · 2h 30m/);
  assert.match(text, /Legacy plan: legacy-4-8-nov-2026/);
  assert.match(text, /Plan: rhythm-v1 current plan/);
  assert.doesNotMatch(text, /supabase|access_token|Bearer|sb_publishable/i);
});

test("a later week copies Monday through Sunday", () => {
  let state = setMark({ version: 2, weeks: {}, outbox: [], migration: { completed: true } }, "2026-11-09", "woke", "yes");
  const text = weekSummary({ state, plan: PLAN, weekStart: "2026-11-09" });
  assert.match(text, /Monday 9 Nov/);
  assert.match(text, /Sunday 15 Nov/);
  assert.match(text, /Woke: yes/);
  assert.match(text, /Fajr: unlogged/);
  assert.match(text, /Plan: rhythm-v1 current plan/);
});
