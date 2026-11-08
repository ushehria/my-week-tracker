import test from "node:test";
import assert from "node:assert/strict";
import { PLAN } from "../plan.js";
import { queueBootstrap, queueChanges } from "../sync-queue.js";
import { liveSyncStatus, pushSupabase, requestEmailCode, syncStatusLabel, verifyEmailCode } from "../sync.js";
import { SUPABASE_URL } from "../sync-public.js";
import { blankState, setMark } from "../store.js";

function ids() {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
}

const session = { access_token: "user-access-token", refresh_token: "user-refresh", user: { id: "user-1" } };

test("a change is queued immediately and a repeat does not create another revision", () => {
  const createId = ids();
  let state = queueChanges(setMark(blankState(), "2026-11-04", "fajr", "yes"), "2026-11-04T08:00:00.000Z", createId);
  assert.equal(state.sync.outbox.length, 1);
  assert.equal(state.sync.outbox[0].table, "entry_revisions");
  assert.equal(state.sync.outbox[0].row.week_start, "2026-11-02");
  assert.equal(state.sync.outbox[0].row.field_key, "mark:fajr");
  assert.equal(state.sync.outbox[0].row.value, "yes");
  assert.match(state.sync.outbox[0].row.client_rev_id, /^[0-9a-f-]{36}$/);
  const again = queueChanges(state, "2026-11-04T09:00:00.000Z", createId);
  assert.equal(again.sync.outbox.length, 1);
  assert.equal(again.weeks["2026-11-02"].days["2026-11-04"].marks.fajr, "yes");
});

test("clearing a mark queues a tombstone and does not drop the day", () => {
  const createId = ids();
  let state = queueChanges(setMark(blankState(), "2026-11-04", "fajr", "yes"), "2026-11-04T08:00:00.000Z", createId);
  state = queueChanges(setMark(state, "2026-11-04", "fajr", ""), "2026-11-04T08:05:00.000Z", createId);
  const tombstone = state.sync.outbox.find((item) => item.row.deleted);
  assert.equal(tombstone.row.field_key, "mark:fajr");
  assert.equal(state.weeks["2026-11-02"].days["2026-11-04"].marks.fajr, undefined);
});

test("first sign-in queues the legacy log, the current state, and the plan", () => {
  const createId = ids();
  const state = queueBootstrap(setMark(blankState(), "2026-11-07", "family", "yes"), {
    nowIso: "2026-11-07T10:00:00.000Z",
    legacyRaw: "{\"day\":\"sat\"}",
    plan: PLAN,
    createId,
  });
  const tables = state.sync.outbox.map((item) => item.table);
  assert.ok(tables.includes("entry_revisions"));
  assert.equal(tables.filter((table) => table === "client_snapshots").length, 3);
  const kinds = state.sync.outbox.filter((item) => item.table === "client_snapshots").map((item) => item.row.kind);
  assert.deepEqual(kinds.sort(), ["localstorage_raw", "localstorage_raw", "plan"]);
  assert.equal(JSON.stringify(state.sync.outbox).includes("user-access-token"), false);
  const twice = queueBootstrap(state, { nowIso: "2026-11-07T11:00:00.000Z", legacyRaw: "{\"day\":\"sat\"}", plan: PLAN, createId });
  assert.equal(twice.sync.outbox.length, state.sync.outbox.length);
});

test("a sealed week adds one plan snapshot and a later edit does not replace it", () => {
  const createId = ids();
  let state = setMark(blankState(), "2026-11-04", "fajr", "yes");
  state.weeks["2026-11-02"].sealed = true;
  state.weeks["2026-11-02"].planSnapshot = structuredClone(PLAN);
  state = queueChanges(state, "2026-11-08T23:00:00.000Z", createId);
  const plans = state.sync.outbox.filter((item) => item.table === "client_snapshots" && item.row.kind === "plan");
  assert.equal(plans.length, 1);
  const frozenTime = plans[0].row.payload.habits.find((habit) => habit.id === "woke").time;
  state = queueChanges(setMark(state, "2026-11-08", "isha", "yes"), "2026-11-08T23:10:00.000Z", createId);
  const plansAfter = state.sync.outbox.filter((item) => item.table === "client_snapshots" && item.row.kind === "plan");
  assert.equal(plansAfter.length, 1);
  assert.equal(plansAfter[0].row.payload.habits.find((habit) => habit.id === "woke").time, frozenTime);
  assert.ok(state.sync.outbox.some((item) => item.row.field_key === "mark:isha"));
});

test("unsigned sync does not send, and a duplicate revision counts as stored", async () => {
  const createId = ids();
  const state = queueChanges(setMark(blankState(), "2026-11-04", "fajr", "yes"), "2026-11-04T08:00:00.000Z", createId);
  let calls = 0;
  const unsigned = await pushSupabase(state, {
    session: null,
    fetch: async () => {
      calls += 1;
      return { ok: true, json: async () => ({}) };
    },
  });
  assert.equal(calls, 0);
  assert.equal(unsigned.status, "unsigned");
  assert.equal(syncStatusLabel("unsigned"), "Sync off. Not signed in. Logs stay on this phone.");
  assert.equal(liveSyncStatus(state, null), "unsigned");

  const urls = [];
  const pushed = await pushSupabase(state, {
    session,
    fetch: async (url) => {
      urls.push(url);
      return { ok: false, status: 409, json: async () => ({ code: "23505" }) };
    },
  });
  assert.equal(pushed.status, "ready");
  assert.deepEqual(pushed.state.sync.outbox, []);
  assert.equal(pushed.state.weeks["2026-11-02"].days["2026-11-04"].marks.fajr, "yes");
  assert.ok(urls.every((url) => url === `${SUPABASE_URL}/rest/v1/entry_revisions`));
  assert.equal(urls.some((url) => url.includes("weekly_archives")), false);
});

test("a failed push keeps the queue and the local log", async () => {
  const state = queueChanges(setMark(blankState(), "2026-11-04", "meds_am", "yes"), "2026-11-04T08:00:00.000Z", ids());
  const result = await pushSupabase(state, {
    session,
    fetch: async () => {
      throw new Error("offline");
    },
  });
  assert.equal(result.status, "failed");
  assert.equal(result.state.sync.outbox.length, 1);
  assert.equal(result.state.weeks["2026-11-02"].days["2026-11-04"].marks.meds_am, "yes");
  assert.equal(JSON.stringify(result.state).includes("user-access-token"), false);
});

test("email code login uses sign-in OTP and verify type email", async () => {
  const bodies = [];
  const fetchImpl = async (url, options) => {
    bodies.push({ url, body: JSON.parse(options.body) });
    if (url.endsWith("/verify")) {
      return { ok: true, json: async () => ({ access_token: "user-access-token", user: { id: "user-1" } }) };
    }
    return { ok: true, json: async () => ({}) };
  };
  const requested = await requestEmailCode("ushehri.a@gmail.com", fetchImpl);
  const verified = await verifyEmailCode("ushehri.a@gmail.com", "123456", fetchImpl);
  assert.equal(requested.ok, true);
  assert.equal(verified.ok, true);
  assert.equal(verified.session.user.id, "user-1");
  assert.equal(bodies[0].url, `${SUPABASE_URL}/auth/v1/otp`);
  assert.deepEqual(bodies[0].body, { email: "ushehri.a@gmail.com", create_user: true });
  assert.equal(bodies[1].url, `${SUPABASE_URL}/auth/v1/verify`);
  assert.deepEqual(bodies[1].body, { email: "ushehri.a@gmail.com", token: "123456", type: "email" });
});
