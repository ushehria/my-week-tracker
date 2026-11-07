import test from "node:test";
import assert from "node:assert/strict";
import { PLAN } from "../plan.js";
import {
  attemptSync,
  currentSyncStatus,
  normalizeConfig,
  syncStatusLabel,
} from "../sync.js";
import { blankState, sealDueWeeks, setMark } from "../store.js";

function queuedState() {
  let state = setMark(blankState(), "2026-11-04", "fajr", "yes");
  state = setMark(state, "2026-11-04", "meds_am", "no");
  state.weeks["2026-11-02"].note = "private note";
  return sealDueWeeks(state, new Date("2026-11-08T23:00:00Z"), PLAN);
}

test("sync stays inactive and does not send when it is not configured", async () => {
  const state = queuedState();
  let called = false;
  const result = await attemptSync(state, {
    config: null,
    fetch: async () => {
      called = true;
      throw new Error("should not send");
    },
  });
  assert.equal(called, false);
  assert.equal(result.status, "inactive");
  assert.deepEqual(result.state.weeks, state.weeks);
  assert.equal(result.state.outbox.length, 1);
  assert.equal(syncStatusLabel("inactive"), "Sync off. Logs stay on this phone.");
  assert.equal(currentSyncStatus(state, null), "inactive");
});

test("public or insecure endpoints are not a configured sync target", () => {
  assert.equal(normalizeConfig({ endpoint: "http://archive.example/weeks", token: "test-token" }), null);
  assert.equal(normalizeConfig({ endpoint: "https://ushehria.github.io/my-week-tracker/collect", token: "test-token" }), null);
  assert.equal(normalizeConfig({ endpoint: "https://github.com/ushehria/my-week-tracker", token: "test-token" }), null);
  assert.equal(normalizeConfig({ endpoint: "https://user:test-token@archive.example/weeks", token: "test-token" }), null);
  assert.equal(normalizeConfig({ endpoint: "https://archive.example/weeks", token: "   " }), null);
  assert.ok(normalizeConfig({ endpoint: "https://archive.example/weeks", token: "test-token" }));
});

test("a failed sync leaves logs, notes, and the pending archive on the device", async () => {
  const state = queuedState();
  const result = await attemptSync(state, {
    config: { endpoint: "https://archive.example/weeks", token: "test-token" },
    fetch: async () => {
      throw new Error("offline");
    },
  });
  assert.equal(result.status, "failed");
  assert.deepEqual(result.state.weeks["2026-11-02"].days, state.weeks["2026-11-02"].days);
  assert.equal(result.state.weeks["2026-11-02"].note, "private note");
  assert.equal(result.state.outbox.length, 1);
  assert.equal(result.state.outbox[0].acked, false);
  assert.equal(result.state.outbox[0].payload.days["2026-11-04"].marks.fajr, "yes");
  assert.equal(JSON.stringify(result.state).includes("test-token"), false);
  assert.equal(syncStatusLabel(result.status), "Sync failed. Logs stay on this phone.");
});

test("a response without an archive ack does not clean up", async () => {
  const state = queuedState();
  const result = await attemptSync(state, {
    config: { endpoint: "https://archive.example/weeks", token: "test-token" },
    fetch: async () => ({ ok: true, json: async () => ({ ack: false }) }),
  });
  assert.equal(result.status, "failed");
  assert.equal(result.state.outbox.length, 1);
  assert.equal(result.state.weeks["2026-11-02"].days["2026-11-04"].marks.meds_am, "no");
  assert.equal(result.state.weeks["2026-11-02"].archive, null);
});

test("an archive ack removes only the pending copy and keeps the week logs", async () => {
  const state = queuedState();
  let sent;
  const result = await attemptSync(state, {
    config: { endpoint: "https://archive.example/weeks", token: "test-token" },
    now: new Date("2026-11-09T08:00:00Z"),
    fetch: async (_url, options) => {
      sent = options;
      return { ok: true, json: async () => ({ ack: true, archiveId: "arc-1" }) };
    },
  });
  const body = JSON.parse(sent.body);
  assert.equal(sent.method, "POST");
  assert.equal(sent.redirect, "error");
  assert.equal(sent.headers.authorization, "Bearer test-token");
  assert.equal(sent.headers["idempotency-key"], "2026-11-02");
  assert.equal(body.kind, "my-week-archive");
  assert.equal(body.days["2026-11-04"].marks.fajr, "yes");
  assert.equal(body.note, "private note");
  assert.equal(JSON.stringify(body).includes("test-token"), false);
  assert.equal(result.status, "acked");
  assert.deepEqual(result.state.outbox, []);
  assert.equal(result.state.weeks["2026-11-02"].days["2026-11-04"].marks.fajr, "yes");
  assert.equal(result.state.weeks["2026-11-02"].note, "private note");
  assert.equal(result.state.weeks["2026-11-02"].archive.archiveId, "arc-1");
  assert.equal(result.state.weeks["2026-11-02"].archive.ack, true);
});

test("Sunday collection waits until 23:00 London and does not block a later Monday", () => {
  let state = setMark(blankState(), "2026-11-07", "family", "yes");
  const early = sealDueWeeks(state, new Date("2026-11-08T22:59:00Z"), PLAN);
  assert.equal(early.weeks["2026-11-02"].sealed, false);
  assert.equal(early.outbox.length, 0);

  const sealed = sealDueWeeks(state, new Date("2026-11-08T23:00:00Z"), PLAN);
  assert.equal(sealed.weeks["2026-11-02"].sealed, true);
  assert.equal(sealed.outbox.length, 1);

  const empty = sealDueWeeks(blankState(), new Date("2026-11-09T08:00:00Z"), PLAN);
  assert.deepEqual(empty.outbox, []);

  const monday = setMark(sealed, "2026-11-09", "woke", "yes");
  assert.equal(monday.weeks["2026-11-09"].days["2026-11-09"].marks.woke, "yes");
  assert.equal(monday.weeks["2026-11-02"].sealed, true);
  assert.equal(monday.outbox[0].payload.planSnapshot.habits.find((habit) => habit.id === "woke").time, "6:30–7");
});
