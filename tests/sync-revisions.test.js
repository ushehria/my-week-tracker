import test from "node:test";
import assert from "node:assert/strict";
import { PLAN } from "../plan.js";
import { queueBootstrap, queueChanges } from "../sync-queue.js";
import { liveSyncStatus, pushSupabase, requestEmailCode, sendFailure, syncStatusLabel, verifyMagicLink } from "../sync.js";
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

test("a pasted signup confirmation link is verified as a token hash", async () => {
  const bodies = [];
  const fetchImpl = async (url, options) => {
    bodies.push({ url, body: JSON.parse(options.body), redirect: options.redirect });
    const token = bodies.at(-1).body.token_hash;
    if (token === "expired-hash") {
      return { ok: false, status: 403, json: async () => ({ error_code: "otp_expired", msg: "Email link is invalid or has expired" }) };
    }
    if (token === "offline-hash") throw new Error("offline");
    return { ok: true, json: async () => ({ access_token: "user-access-token", user: { id: "user-1" } }) };
  };
  const signupUrl = "https://psjlltcrepnimnvbggog.supabase.co/auth/v1/verify?token=example-signup-hash&type=signup&redirect_to=http://localhost:3000";
  const verified = await verifyMagicLink(signupUrl, fetchImpl);
  assert.equal(verified.ok, true);
  assert.deepEqual(bodies[0].body, { token_hash: "example-signup-hash", type: "signup" });
  assert.equal(bodies[0].redirect, "error");
  const expired = await verifyMagicLink(signupUrl.replace("example-signup-hash", "expired-hash"), fetchImpl);
  assert.equal(expired.ok, false);
  assert.equal(expired.reason, "expired");
  const offline = await verifyMagicLink(signupUrl.replace("example-signup-hash", "offline-hash"), fetchImpl);
  assert.equal(offline.reason, "network");
  const requested = await requestEmailCode("ushehri.a@gmail.com", async (url, options) => {
    bodies.push({ url, body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({}) };
  });
  assert.equal(requested.ok, true);
  assert.deepEqual(bodies.at(-1).body, { email: "ushehri.a@gmail.com", create_user: true });
});

test("email send errors keep the provider reason and do not retry", async () => {
  let calls = 0;
  const limited = await requestEmailCode("person@example.com", async () => {
    calls += 1;
    return {
      ok: false,
      status: 429,
      headers: { get: (name) => (name === "retry-after" ? "120" : "") },
      json: async () => ({ error_code: "over_email_send_rate_limit", msg: "email rate limit exceeded" }),
    };
  });
  assert.equal(calls, 1);
  assert.equal(limited.reason, "rate_limit");
  assert.equal(limited.retryAfter, "120");
  assert.match(sendFailure(limited), /120 seconds/);
  assert.doesNotMatch(sendFailure(limited), /token/i);
  const noWait = await requestEmailCode("person@example.com", async () => ({
    ok: false,
    status: 429,
    headers: { get: () => "" },
    json: async () => ({ error_code: "over_email_send_rate_limit", msg: "email rate limit exceeded" }),
  }));
  assert.equal(noWait.retryAfter, "");
  assert.match(sendFailure(noWait), /did not say how long/);
  const blocked = await requestEmailCode("other@example.com", async () => ({
    ok: false,
    status: 422,
    headers: { get: () => "" },
    json: async () => ({ error_code: "email_address_not_authorized", msg: "Email address not authorized" }),
  }));
  assert.equal(blocked.reason, "not_authorized");
  assert.match(sendFailure(blocked), /default email/);
  const offline = await requestEmailCode("person@example.com", async () => {
    throw new Error("offline");
  });
  assert.equal(offline.reason, "network");
});
