import test from "node:test";
import assert from "node:assert/strict";
import { startApp } from "../app.js";
import { queueChanges, queueMissingWeeks } from "../sync-queue.js";
import { describeSync, pushSupabase, SESSION_KEY } from "../sync.js";
import { STORE_KEY, blankState, setMark } from "../store.js";
import { memoryStorage } from "./helpers.js";

const user = { id: "user-1" };

function freshSession() {
  return {
    access_token: "fresh-access",
    refresh_token: "refresh-2",
    expires_at: 2_000_000_000,
    user,
  };
}

test("an expired access token is refreshed once and the queued revision is sent", async () => {
  const state = queueChanges(setMark(blankState(), "2026-11-16", "fajr", "yes"), "2026-11-16T09:00:00.000Z", () => "rev-kept");
  const calls = [];
  const result = await pushSupabase(state, {
    now: Date.parse("2026-11-16T12:00:00.000Z"),
    session: {
      access_token: "expired-access",
      refresh_token: "refresh-1",
      expires_at: 1_700_000_000,
      user,
    },
    fetch: async (url, options) => {
      calls.push({ url, method: options.method, authorization: options.headers.authorization });
      if (url.includes("grant_type=refresh_token")) return { ok: true, json: async () => freshSession() };
      return { ok: true, status: 201, json: async () => ({}) };
    },
  });
  assert.equal(result.status, "ready");
  assert.equal(result.session.refresh_token, "refresh-2");
  assert.equal(result.state.sync.outbox.length, 0);
  assert.equal(result.state.weeks["2026-11-16"].days["2026-11-16"].marks.fajr, "yes");
  assert.equal(calls.filter((call) => call.url.includes("grant_type=refresh_token")).length, 1);
  const post = calls.find((call) => call.method === "POST" && call.url.includes("/entry_revisions"));
  assert.equal(post.authorization, "Bearer fresh-access");
  assert.equal(JSON.stringify(result.state).includes("expired-access"), false);
  assert.equal(JSON.stringify(result.state).includes("fresh-access"), false);
});

test("a rejected access token refreshes once and the same revision is retried", async () => {
  const state = queueChanges(setMark(blankState(), "2026-11-09", "woke", "yes"), "2026-11-09T10:00:00.000Z", () => "rev-woke");
  let posts = 0;
  const result = await pushSupabase(state, {
    session: { access_token: "stale-access", refresh_token: "refresh-1", expires_at: 2_000_000_000, user },
    fetch: async (url) => {
      if (url.includes("grant_type=refresh_token")) return { ok: true, json: async () => freshSession() };
      posts += 1;
      if (posts === 1) return { ok: false, status: 401, json: async () => ({ message: "JWT expired" }) };
      return { ok: true, status: 201, json: async () => ({}) };
    },
  });
  assert.equal(posts, 2);
  assert.equal(result.status, "ready");
  assert.equal(result.state.sync.outbox.length, 0);
  assert.equal(result.state.weeks["2026-11-09"].days["2026-11-09"].marks.woke, "yes");
});

test("weeks since 9 Nov are queued once when the server does not have them", () => {
  let state = queueChanges(setMark(blankState(), "2026-11-16", "fajr", "yes"), "2026-11-16T09:00:00.000Z", () => "rev-old");
  state.sync.outbox = [];
  const queued = queueMissingWeeks(state, [], "2026-11-16T12:00:00.000Z", () => "rev-backfill");
  assert.equal(queued.sync.backfillDone, true);
  assert.equal(queued.sync.outbox.length, 1);
  assert.equal(queued.sync.outbox[0].client_rev_id, "rev-backfill");
  assert.equal(queued.weeks["2026-11-16"].days["2026-11-16"].marks.fajr, "yes");
  const again = queueMissingWeeks(queued, [], "2026-11-16T13:00:00.000Z", () => "rev-again");
  assert.equal(again.sync.outbox.length, 1);
  assert.equal(again.sync.outbox[0].client_rev_id, "rev-backfill");
  const present = queueMissingWeeks(
    { ...state, sync: { ...state.sync, backfillDone: false, outbox: [] } },
    [{ week_start: "2026-11-16", entry_date: "2026-11-16", field_key: "mark:fajr", value: "yes", client_updated_at: "2026-11-16T08:00:00.000Z" }],
    "2026-11-16T12:00:00.000Z",
    () => "rev-unused",
  );
  assert.equal(present.sync.outbox.length, 0);
});

test("offline sync stays queued, then a reload and a return online send it once", async () => {
  let state = queueChanges(setMark(blankState(), "2026-11-16", "nap", "yes"), "2026-11-16T09:00:00.000Z", () => "rev-nap");
  state.sync.bootstrapped = true;
  state.sync.backfillDone = true;
  const storage = memoryStorage({
    [STORE_KEY]: JSON.stringify(state),
    [SESSION_KEY]: JSON.stringify({ access_token: "stale-access", refresh_token: "refresh-1", expires_at: 2_000_000_000, user }),
  });
  let online = false;
  const sent = [];
  const listeners = {};
  const elements = {};
  for (const id of ["title", "sub", "sync", "weekNav", "dayTop", "dayBottom", "app", "savedMsg"]) {
    elements[id] = { id, tagName: "DIV", innerHTML: "", textContent: "", contains() { return false; } };
  }
  const doc = {
    title: "",
    visibilityState: "visible",
    documentElement: { tagName: "HTML" },
    activeElement: null,
    body: { addEventListener() {} },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    getElementById(id) { return elements[id]; },
    querySelector() { return null; },
    createRange() { return { selectNodeContents() {} }; },
    defaultView: {
      scrollY: 0,
      scrollTo() {},
      navigator: {},
      addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
      getSelection() { return { removeAllRanges() {}, addRange() {} }; },
    },
  };
  const fetchImpl = async (url, options) => {
    if (String(url).includes("grant_type=refresh_token")) return { ok: true, json: async () => freshSession() };
    if (!online) throw new Error("offline");
    sent.push(JSON.parse(options.body).client_rev_id);
    return { ok: true, status: 201, json: async () => ({}) };
  };
  const started = () => new Promise((resolve) => setTimeout(resolve, 30));
  startApp(doc, { storage, now: () => new Date("2026-11-16T12:00:00.000Z"), schedule() {}, fetch: fetchImpl });
  await started();
  let saved = JSON.parse(storage.getItem(STORE_KEY));
  assert.equal(saved.weeks["2026-11-16"].days["2026-11-16"].marks.nap, "yes");
  assert.equal(saved.sync.outbox[0].client_rev_id, "rev-nap");
  assert.match(elements.sync.innerHTML, /1 waiting to sync/);
  online = true;
  doc.visibilityState = "visible";
  for (const fn of listeners.visibilitychange || []) fn();
  await started();
  saved = JSON.parse(storage.getItem(STORE_KEY));
  assert.deepEqual(sent, ["rev-nap"]);
  assert.equal(saved.sync.outbox.length, 0);
  assert.equal(saved.weeks["2026-11-16"].days["2026-11-16"].marks.nap, "yes");
  assert.match(elements.sync.innerHTML, /Synced just now/);
  startApp(doc, { storage, now: () => new Date("2026-11-16T12:02:00.000Z"), schedule() {}, fetch: fetchImpl });
  await started();
  assert.deepEqual(sent, ["rev-nap"]);
  assert.match(describeSync({
    session: freshSession(),
    state: JSON.parse(storage.getItem(STORE_KEY)),
    now: Date.parse("2026-11-16T12:04:00.000Z"),
  }), /Synced 2 min ago/);
});
