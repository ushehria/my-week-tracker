import test from "node:test";
import assert from "node:assert/strict";
import { startApp } from "../app.js";
import { SESSION_KEY } from "../sync.js";
import { STORE_KEY } from "../store.js";
import { memoryStorage } from "./helpers.js";

const session = { access_token: "user-access-token", refresh_token: "user-refresh", user: { id: "user-1" } };

function harness() {
  const elements = {};
  const make = (id) => {
    const el = {
      id,
      tagName: "DIV",
      innerHTML: "",
      textContent: "",
      contains(node) {
        return Boolean(node) && node.within === id;
      },
    };
    elements[id] = el;
    return el;
  };
  for (const id of ["title", "sub", "sync", "weekNav", "dayTop", "dayBottom", "app", "savedMsg"]) make(id);
  const listeners = {};
  const scheduled = [];
  const doc = {
    title: "",
    visibilityState: "visible",
    documentElement: { tagName: "HTML" },
    activeElement: null,
    body: {
      addEventListener(type, fn) {
        (listeners[type] ||= []).push(fn);
      },
      dispatch(event) {
        for (const fn of listeners[event.type] || []) fn(event);
      },
    },
    addEventListener() {},
    getElementById(id) {
      return elements[id] || null;
    },
    querySelector() {
      return null;
    },
    createRange() {
      return { selectNodeContents() {} };
    },
    defaultView: {
      scrollY: 0,
      scrollTo() {},
      navigator: {},
      getSelection() {
        return { removeAllRanges() {}, addRange() {} };
      },
    },
  };
  const field = (id, tagName) => ({
    id,
    tagName,
    within: "app",
    value: "",
    selectionStart: 0,
    selectionEnd: 0,
    focus() {
      doc.activeElement = this;
    },
  });
  return { doc, elements, listeners, scheduled, field, schedule(delay, fn) { scheduled.push({ delay, fn }); } };
}

test("typing keeps focus and value while a signed-in sync refresh arrives", async () => {
  const ui = harness();
  const storage = memoryStorage({ [SESSION_KEY]: JSON.stringify(session) });
  let posts = 0;
  startApp(ui.doc, {
    storage,
    now: () => new Date("2026-11-09T08:00:00Z"),
    schedule: ui.schedule,
    fetch: async () => {
      posts += 1;
      return { ok: true, json: async () => ({}) };
    },
  });
  for (let i = 0; i < 30; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  const before = ui.elements.app.innerHTML;
  assert.match(before, /id="day-note"/);
  assert.match(before, /id="cigs"/);
  const sentBefore = posts;
  const note = ui.field("day-note", "TEXTAREA");
  note.focus();
  note.value = "h";
  note.selectionStart = 1;
  note.selectionEnd = 1;
  ui.doc.body.dispatch({ type: "input", target: note });
  note.value = "hello";
  note.selectionStart = 5;
  note.selectionEnd = 5;
  ui.doc.body.dispatch({ type: "input", target: note });
  const pauses = () => ui.scheduled.filter((item) => item.delay === 600);
  assert.equal(pauses().length, 2);
  assert.equal(posts, sentBefore);
  await pauses()[0].fn();
  assert.equal(posts, sentBefore);
  await pauses()[1].fn();
  const saved = JSON.parse(storage.getItem(STORE_KEY));
  assert.equal(saved.weeks["2026-11-09"].days["2026-11-09"].note, "hello");
  assert.ok(posts > sentBefore);
  assert.equal(ui.doc.activeElement, note);
  assert.equal(note.value, "hello");
  assert.equal(note.selectionStart, 5);
  assert.equal(ui.elements.app.innerHTML, before);

  const count = ui.field("cigs", "INPUT");
  count.focus();
  count.value = "3";
  count.selectionStart = 1;
  count.selectionEnd = 1;
  ui.doc.body.dispatch({ type: "input", target: count });
  await ui.scheduled.filter((item) => item.delay === 600).at(-1).fn();
  assert.equal(JSON.parse(storage.getItem(STORE_KEY)).weeks["2026-11-09"].days["2026-11-09"].cigs, "3");
  assert.equal(ui.doc.activeElement, count);
  assert.equal(count.value, "3");
  assert.equal(ui.elements.app.innerHTML, before);
});
