import test from "node:test";
import assert from "node:assert/strict";
import { PLAN } from "../plan.js";
import { pageModel } from "../page-model.js";
import { renderPage } from "../render.js";
import { queueChanges } from "../sync-queue.js";
import {
  adjustCigs,
  blankState,
  saveFlexibleActivity,
  setCall,
  setDayNote,
  setMark,
  setWeekNote,
} from "../store.js";
import { weekSummary } from "../week-summary.js";

function ids() {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
}

test("not counted is a third mark, and daylight names the afternoon window", () => {
  let state = setMark(blankState(), "2026-11-09", "fajr", "yes");
  state = setMark(state, "2026-11-09", "daylight", "skip");
  state = setMark(state, "2026-11-09", "woke", "no");
  const before = structuredClone(state);
  const html = renderPage(pageModel({
    plan: PLAN,
    state,
    selectedDate: "2026-11-09",
    now: new Date("2026-11-09T08:00:00Z"),
    syncStatus: "unsigned",
  }));
  assert.match(html, /Daylight: 15 min outside, any time before Maghrib/);
  assert.match(html, /class="mark skip"/);
  assert.match(html, /–/);
  assert.doesNotMatch(html, /id="copy-full-week"/);
  assert.match(html, /Copy week summary/);
  assert.match(html, /Copy last week summary/);
  const text = weekSummary({ state, plan: PLAN, weekStart: "2026-11-09" });
  assert.match(text, /Fajr: yes/);
  assert.match(text, /Daylight: 15 min outside, any time before Maghrib: not counted/);
  assert.match(text, /Woke: no/);
  assert.equal(state.weeks["2026-11-09"].days["2026-11-09"].marks.fajr, "yes");
  assert.deepEqual(state, before);
});

test("cigarette buttons keep the cigs field and each day keeps its own notes", () => {
  let state = setWeekNote(blankState(), "2026-11-09", "shared week");
  state = adjustCigs(state, "2026-11-09", 1);
  state = adjustCigs(state, "2026-11-09", 1);
  state = adjustCigs(state, "2026-11-10", 1);
  state = adjustCigs(state, "2026-11-10", -1);
  state = setDayNote(state, "2026-11-09", "Monday only");
  state = setDayNote(state, "2026-11-10", "Tuesday only");
  assert.equal(state.weeks["2026-11-09"].days["2026-11-09"].cigs, "2");
  assert.equal(state.weeks["2026-11-09"].days["2026-11-10"].cigs, "0");
  assert.equal(adjustCigs(state, "2026-11-11", -1), state);
  assert.equal(state.weeks["2026-11-09"].note, "shared week");
  assert.equal(state.weeks["2026-11-09"].days["2026-11-09"].note, "Monday only");
  assert.equal(state.weeks["2026-11-09"].days["2026-11-10"].note, "Tuesday only");
  const monday = pageModel({
    plan: PLAN,
    state,
    selectedDate: "2026-11-09",
    now: new Date("2026-11-09T08:00:00Z"),
    syncStatus: "unsigned",
  });
  const tuesday = pageModel({
    plan: PLAN,
    state,
    selectedDate: "2026-11-10",
    now: new Date("2026-11-09T08:00:00Z"),
    syncStatus: "unsigned",
  });
  assert.equal(monday.cigs, "2");
  assert.equal(monday.dayNote, "Monday only");
  assert.equal(tuesday.dayNote, "Tuesday only");
  assert.equal(monday.note, "shared week");
  assert.match(renderPage(monday), /id="cigs-inc"/);
  assert.match(renderPage(monday), /id="cigs-dec"/);
  assert.match(renderPage(monday), /id="cigs"/);
  assert.match(renderPage(monday), /id="day-note"/);
});

test("new fields reach entry revisions on their own dates", () => {
  let state = setMark(blankState(), "2026-11-09", "daylight", "skip");
  state = setDayNote(state, "2026-11-09", "outside");
  state = setDayNote(state, "2026-11-10", "quiet");
  state = adjustCigs(state, "2026-11-09", 1);
  state = setCall(state, "2026-11-09", "mother", { done: true, note: "fine" });
  state = setCall(state, "2026-11-09", "father", { done: true, note: "" });
  state = setWeekNote(state, "2026-11-09", "week");
  const saved = saveFlexibleActivity(state, "2026-11-14", {
    id: "park",
    title: "park",
    start: "10:00",
    end: "11:00",
  });
  state = queueChanges(saved.state, "2026-11-09T09:00:00.000Z", ids());
  const rows = state.sync.outbox.filter((item) => item.table === "entry_revisions").map((item) => item.row);
  const mark = rows.find((row) => row.field_key === "mark:daylight");
  assert.equal(mark.value, "skip");
  assert.equal(mark.entry_date, "2026-11-09");
  assert.notEqual(mark.value, "no");
  assert.equal(rows.find((row) => row.field_key === "note" && row.entry_date === "2026-11-09").value, "outside");
  assert.equal(rows.find((row) => row.field_key === "note" && row.entry_date === "2026-11-10").value, "quiet");
  assert.equal(rows.find((row) => row.field_key === "cigs").value, "1");
  assert.equal(rows.find((row) => row.field_key === "call:mother").value.note, "fine");
  assert.equal(rows.find((row) => row.field_key === "call:father").entry_date, "2026-11-09");
  assert.equal(rows.find((row) => row.field_key === "week:note").entry_date, "2026-11-09");
  assert.equal(rows.find((row) => row.field_key === "activity:park").entry_date, "2026-11-14");
  assert.equal(state.weeks["2026-11-09"].days["2026-11-09"].marks.daylight, "skip");
});

test("Sunday copies the whole current week, including not counted, notes, calls, and Saturday", () => {
  let state = setWeekNote(blankState(), "2026-11-09", "week note");
  state = setMark(state, "2026-11-09", "fajr", "skip");
  state = setDayNote(state, "2026-11-09", "Monday note");
  state = adjustCigs(state, "2026-11-09", 1);
  state = setCall(state, "2026-11-15", "mother", { done: true, note: "spoke" });
  state = setCall(state, "2026-11-15", "father", { done: true, note: "short" });
  const saved = saveFlexibleActivity(state, "2026-11-14", {
    id: "park",
    title: "park",
    start: "15:00",
    end: "16:00",
  });
  state = saved.state;
  const sunday = pageModel({
    plan: PLAN,
    state,
    selectedDate: "2026-11-15",
    now: new Date("2026-11-15T12:00:00Z"),
    syncStatus: "unsigned",
  });
  assert.equal(sunday.showFullWeekCopy, true);
  const html = renderPage(sunday);
  assert.match(html, /id="copy-full-week">Copy full week summary/);
  assert.match(html, /id="copy-week">Copy week summary/);
  assert.match(html, /Copy last week summary/);
  const text = weekSummary({ state, plan: PLAN, weekStart: sunday.weekStart, full: true });
  assert.match(text, /Monday 9 Nov/);
  assert.match(text, /Sunday 15 Nov/);
  assert.match(text, /Fajr: not counted/);
  assert.match(text, /Notes: Monday note/);
  assert.match(text, /Cigarettes: 1/);
  assert.match(text, /park: 15:00–16:00/);
  assert.match(text, /Call mother: yes — spoke/);
  assert.match(text, /Call father: yes — short/);
  assert.match(text, /Week note: week note/);
  const earlier = weekSummary({ state: saved.state, plan: PLAN, weekStart: "2026-11-02" });
  assert.doesNotMatch(earlier, /Monday/);
  assert.doesNotMatch(earlier, /Tuesday/);
});
