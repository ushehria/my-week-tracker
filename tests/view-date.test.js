import test from "node:test";
import assert from "node:assert/strict";
import { createViewController, bindAutoDate } from "../view-date.js";

function clock(start) {
  let now = start;
  return {
    now: () => now,
    set(value) {
      now = value;
    },
  };
}

test("launch selects the actual London date", () => {
  const view = createViewController({ now: new Date("2026-11-07T15:00:00Z") });
  assert.equal(view.selectedDate(), "2026-11-07");
});

test("manual viewing stays put while the London date does not change", () => {
  const time = clock(new Date("2026-11-07T15:00:00Z"));
  const view = createViewController({ now: time.now });
  view.selectManually("2026-11-04");
  view.interact();
  time.set(new Date("2026-11-07T20:00:00Z"));
  view.tick();
  view.interact();
  assert.equal(view.selectedDate(), "2026-11-04");
});

test("resume selects the current London date", () => {
  const time = clock(new Date("2026-11-07T15:00:00Z"));
  const view = createViewController({ now: time.now });
  view.selectManually("2026-11-04");
  time.set(new Date("2026-11-07T18:00:00Z"));
  view.resume();
  assert.equal(view.selectedDate(), "2026-11-07");
});

test("midnight rollover selects the new London day", () => {
  const time = clock(new Date("2026-11-07T23:59:00Z"));
  const view = createViewController({ now: time.now });
  view.selectManually("2026-11-04");
  time.set(new Date("2026-11-08T00:00:30Z"));
  view.tick();
  assert.equal(view.selectedDate(), "2026-11-08");
});

test("summer midnight rollover uses Europe/London", () => {
  const time = clock(new Date("2026-06-30T22:30:00Z"));
  const view = createViewController({ now: time.now });
  assert.equal(view.selectedDate(), "2026-06-30");
  view.selectManually("2026-06-29");
  time.set(new Date("2026-06-30T22:59:00Z"));
  view.tick();
  assert.equal(view.selectedDate(), "2026-06-29");
  time.set(new Date("2026-06-30T23:00:00Z"));
  view.tick();
  assert.equal(view.selectedDate(), "2026-07-01");
});

test("auto date listens for resume and midnight, not for ordinary interaction", () => {
  const time = clock(new Date("2026-11-07T15:00:00Z"));
  const view = createViewController({ now: time.now });
  view.selectManually("2026-11-05");
  const listeners = {};
  const doc = {
    visibilityState: "visible",
    addEventListener(type, fn) {
      listeners[type] = fn;
    },
  };
  const scheduled = [];
  let draws = 0;
  bindAutoDate(view, doc, {
    now: time.now,
    onChange() {
      draws += 1;
    },
    schedule(delay, fn) {
      scheduled.push({ delay, fn });
    },
  });

  assert.equal(typeof listeners.visibilitychange, "function");
  assert.equal(typeof listeners.pageshow, "function");
  assert.equal(listeners.focus, undefined);
  assert.equal(listeners.focusin, undefined);

  doc.visibilityState = "visible";
  listeners.visibilitychange();
  assert.equal(view.selectedDate(), "2026-11-05");
  assert.equal(draws, 0);

  doc.visibilityState = "hidden";
  listeners.visibilitychange();
  doc.visibilityState = "visible";
  listeners.visibilitychange();
  assert.equal(view.selectedDate(), "2026-11-07");

  view.selectManually("2026-11-04");
  time.set(new Date("2026-11-07T16:00:00Z"));
  scheduled[0].fn();
  assert.equal(view.selectedDate(), "2026-11-04");

  time.set(new Date("2026-11-08T00:00:30Z"));
  scheduled.at(-1).fn();
  assert.equal(view.selectedDate(), "2026-11-08");
});
