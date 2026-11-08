export function createRevisionId() {
  return globalThis.crypto.randomUUID();
}

export function queueChanges(state, nowIso, createId = createRevisionId) {
  const next = structuredClone(state);
  const sync = ensureSync(next);
  const current = fieldMap(next);
  const seen = new Set(Object.keys(current));
  for (const [key, spec] of Object.entries(current)) {
    const previous = sync.mirror[key];
    const encoded = JSON.stringify(spec.value);
    if (previous && previous.encoded === encoded && !previous.deleted) continue;
    pushRevision(sync, spec, false, nowIso, createId);
    sync.mirror[key] = { encoded, deleted: false };
  }
  for (const key of Object.keys(sync.mirror)) {
    if (seen.has(key) || sync.mirror[key].deleted) continue;
    const [weekStart, entryDate, fieldKey] = splitFieldKey(key);
    pushRevision(sync, {
      week_start: weekStart,
      entry_date: entryDate,
      field_key: fieldKey,
      value: null,
    }, true, nowIso, createId);
    sync.mirror[key] = { encoded: "null", deleted: true };
  }
  queueSealedPlans(next, nowIso, createId);
  return next;
}

export function queueBootstrap(state, { nowIso, legacyRaw, plan, createId = createRevisionId }) {
  let next = queueChanges(state, nowIso, createId);
  const sync = ensureSync(next);
  if (sync.bootstrapped) return next;
  if (legacyRaw) {
    pushSnapshot(sync, {
      kind: "localstorage_raw",
      week_start: null,
      plan_version: "abdullah-my-week-4-8-nov-v1",
      payload: { source: "abdullah-my-week-4-8-nov-v1", raw: legacyRaw },
      client_created_at: nowIso,
    }, createId);
  }
  const portable = structuredClone(next);
  delete portable.sync;
  pushSnapshot(sync, {
    kind: "localstorage_raw",
    week_start: null,
    plan_version: "abdullah-my-week-v2",
    payload: { source: "abdullah-my-week-v2", state: portable },
    client_created_at: nowIso,
  }, createId);
  pushSnapshot(sync, {
    kind: "plan",
    week_start: null,
    plan_version: plan?.id || "plan",
    payload: plan,
    client_created_at: nowIso,
  }, createId);
  sync.bootstrapped = true;
  return next;
}

function queueSealedPlans(state, nowIso, createId) {
  const sync = ensureSync(state);
  sync.planQueued ||= {};
  for (const week of Object.values(state.weeks || {})) {
    if (!week.sealed || !week.planSnapshot || sync.planQueued[week.weekStart]) continue;
    pushSnapshot(sync, {
      kind: "plan",
      week_start: week.weekStart,
      plan_version: week.planSnapshot.id || "plan",
      payload: week.planSnapshot,
      client_created_at: nowIso,
    }, createId);
    sync.planQueued[week.weekStart] = true;
  }
}

function pushRevision(sync, spec, deleted, nowIso, createId) {
  const clientRevId = createId();
  sync.outbox.push({
    client_rev_id: clientRevId,
    table: "entry_revisions",
    row: {
      client_rev_id: clientRevId,
      week_start: spec.week_start,
      entry_date: spec.entry_date,
      field_key: spec.field_key,
      value: deleted ? null : spec.value,
      deleted,
      client_updated_at: nowIso,
    },
  });
}

function pushSnapshot(sync, row, createId) {
  const clientRevId = createId();
  sync.outbox.push({
    client_rev_id: clientRevId,
    table: "client_snapshots",
    row,
  });
}

function ensureSync(state) {
  if (!state.sync) state.sync = { bootstrapped: false, mirror: {}, outbox: [], planQueued: {} };
  if (!state.sync.mirror) state.sync.mirror = {};
  if (!state.sync.outbox) state.sync.outbox = [];
  if (!state.sync.planQueued) state.sync.planQueued = {};
  return state.sync;
}

function fieldMap(state) {
  const map = {};
  for (const week of Object.values(state.weeks || {})) {
    const weekStart = week.weekStart;
    if (week.note) {
      addField(map, weekStart, weekStart, "week:note", week.note);
    }
    for (const [entryDate, day] of Object.entries(week.days || {})) {
      for (const [habitId, mark] of Object.entries(day.marks || {})) {
        if (mark) addField(map, weekStart, entryDate, `mark:${habitId}`, mark);
      }
      if (day.cigs) addField(map, weekStart, entryDate, "cigs", day.cigs);
      if (day.energy) addField(map, weekStart, entryDate, "energy", day.energy);
      for (const activity of day.activities || []) {
        addField(map, weekStart, entryDate, `activity:${activity.id}`, activity);
      }
    }
  }
  return map;
}

function addField(map, weekStart, entryDate, fieldKey, value) {
  map[`${weekStart}|${entryDate}|${fieldKey}`] = {
    week_start: weekStart,
    entry_date: entryDate,
    field_key: fieldKey,
    value,
  };
}

function splitFieldKey(key) {
  const [weekStart, entryDate, ...rest] = key.split("|");
  return [weekStart, entryDate, rest.join("|")];
}
