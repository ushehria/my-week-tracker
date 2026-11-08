import test from "node:test";
import assert from "node:assert/strict";
import { PLAN } from "../plan.js";
import { pageModel } from "../page-model.js";
import { renderPage } from "../render.js";
import { LEGACY_PLAN } from "../legacy-plan.js";
import { LEGACY_STORE_KEY, blankState, loadState, sealDueWeeks, setCall, setMark, shouldAskCall } from "../store.js";
import { memoryStorage } from "./helpers.js";

test("Call mother and Call father are separate on every day and stay unchecked by default", () => {
  const sunday = pageModel({
    plan: PLAN,
    state: blankState(),
    selectedDate: "2026-11-08",
    now: new Date("2026-11-08T12:00:00Z"),
    syncStatus: "inactive",
  });
  const saturday = pageModel({
    plan: PLAN,
    state: blankState(),
    selectedDate: "2026-11-07",
    now: new Date("2026-11-07T12:00:00Z"),
    syncStatus: "inactive",
  });
  assert.deepEqual(sunday.calls, { mother: { done: false, note: "" }, father: { done: false, note: "" } });
  assert.deepEqual(saturday.calls.father, { done: false, note: "" });
  const html = renderPage(sunday);
  assert.match(html, /id="call-mother"/);
  assert.match(html, /id="call-father"/);
  assert.match(html, /id="call-prompt" hidden/);
  assert.doesNotMatch(html, /tel:/);
  assert.match(html, /Stays on this phone/);
});

test("each parent and each date keeps its own answer", () => {
  let state = setCall(blankState(), "2026-11-07", "mother", { done: true, note: "fine" });
  state = setCall(state, "2026-11-08", "father", { done: true });
  assert.equal(state.weeks["2026-11-02"].days["2026-11-07"].calls.mother.note, "fine");
  assert.equal(state.weeks["2026-11-02"].days["2026-11-07"].calls.father, undefined);
  assert.equal(state.weeks["2026-11-02"].days["2026-11-08"].calls.father.done, true);
  assert.equal(state.weeks["2026-11-02"].days["2026-11-08"].calls.father.note, "");
  assert.equal(shouldAskCall(false, true), true);
  assert.equal(shouldAskCall(true, true), false);
  assert.equal(shouldAskCall(true, false), false);
});

test("migration leaves parent calls unchecked and keeps old marks", () => {
  const raw = JSON.stringify({
    day: "sat",
    marks: { "sat:family": "yes", "wed:fajr": "yes" },
    cigs: { wed: "", thu: "", fri: "", sat: "", sun: "" },
    energy: { wed: "", thu: "", fri: "", sat: "", sun: "" },
    note: "kept",
  });
  const storage = memoryStorage({ [LEGACY_STORE_KEY]: raw });
  const state = loadState(storage, { legacyPlan: LEGACY_PLAN });
  assert.equal(state.weeks["2026-11-02"].days["2026-11-07"].marks.family, "yes");
  assert.equal(state.weeks["2026-11-02"].days["2026-11-07"].calls, undefined);
  const model = pageModel({
    plan: PLAN,
    state,
    selectedDate: "2026-11-07",
    now: new Date("2026-11-07T12:00:00Z"),
    syncStatus: "inactive",
  });
  assert.equal(model.calls.mother.done, false);
  assert.equal(model.calls.father.note, "");
  const sealed = sealDueWeeks(setCall(state, "2026-11-07", "mother", { done: true, note: "fine" }), new Date("2026-11-08T23:00:00Z"), PLAN);
  assert.equal(sealed.outbox[0].payload.days["2026-11-07"].calls.mother.note, "fine");
  assert.equal(sealed.weeks["2026-11-02"].days["2026-11-04"].marks.fajr, "yes");
});
