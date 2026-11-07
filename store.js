import { isDueForCollection, weekStartMonday } from "./london-time.js";

export const LEGACY_STORE_KEY = "abdullah-my-week-4-8-nov-v1";
export const STORE_KEY = "abdullah-my-week-v2";

const LEGACY_DAY_ISO = {
  wed: "2026-11-04",
  thu: "2026-11-05",
  fri: "2026-11-06",
  sat: "2026-11-07",
  sun: "2026-11-08",
};

const LEGACY_WEEK_START = "2026-11-02";

export function blankState() {
  return {
    version: 2,
    weeks: {},
    outbox: [],
    migration: { completed: false, sourceKey: LEGACY_STORE_KEY },
  };
}

export function loadState(storage, { legacyPlan } = {}) {
  const existing = storage.getItem(STORE_KEY);
  if (existing !== null) return JSON.parse(existing);
  const migrated = migrateFromLegacy(storage, legacyPlan);
  storage.setItem(STORE_KEY, JSON.stringify(migrated));
  return migrated;
}

export function saveState(storage, state) {
  storage.setItem(STORE_KEY, JSON.stringify(state));
}

export function setMark(state, iso, habitId, value) {
  const next = clone(state);
  const week = ensureWeek(next, weekStartMonday(iso));
  const day = ensureDay(week, iso);
  if (value) day.marks[habitId] = value;
  else delete day.marks[habitId];
  refreshPending(next, week.weekStart);
  return next;
}

export function setDayValue(state, iso, field, value) {
  if (field !== "cigs" && field !== "energy") return state;
  const next = clone(state);
  const week = ensureWeek(next, weekStartMonday(iso));
  const day = ensureDay(week, iso);
  day[field] = value;
  refreshPending(next, week.weekStart);
  return next;
}

export function setWeekNote(state, iso, value) {
  const next = clone(state);
  const week = ensureWeek(next, weekStartMonday(iso));
  week.note = value;
  refreshPending(next, week.weekStart);
  return next;
}

export function clearDay(state, iso) {
  const next = clone(state);
  const week = next.weeks[weekStartMonday(iso)];
  const day = week?.days?.[iso];
  if (!day) return next;
  day.marks = {};
  day.cigs = "";
  day.energy = "";
  refreshPending(next, week.weekStart);
  return next;
}

export function addActivity(state, iso, activity) {
  const next = clone(state);
  const week = ensureWeek(next, weekStartMonday(iso));
  const day = ensureDay(week, iso);
  day.activities.push({
    id: activity.id,
    start: activity.start || "",
    end: activity.end || "",
    place: activity.place || "",
    duration: activity.duration || "",
  });
  refreshPending(next, week.weekStart);
  return next;
}

export function updateActivity(state, iso, activityId, patch) {
  const next = clone(state);
  const week = ensureWeek(next, weekStartMonday(iso));
  const day = ensureDay(week, iso);
  const item = day.activities.find((entry) => entry.id === activityId);
  if (item) {
    for (const field of ["start", "end", "place", "duration"]) {
      if (Object.prototype.hasOwnProperty.call(patch, field)) item[field] = patch[field];
    }
  }
  refreshPending(next, week.weekStart);
  return next;
}

export function removeActivity(state, iso, activityId) {
  const next = clone(state);
  const week = next.weeks[weekStartMonday(iso)];
  const day = week?.days?.[iso];
  if (!day) return next;
  day.activities = day.activities.filter((item) => item.id !== activityId);
  refreshPending(next, week.weekStart);
  return next;
}

export function weekHasContent(week) {
  if (week.note && String(week.note).trim()) return true;
  if (week.unmappedMarks && Object.keys(week.unmappedMarks).length) return true;
  return Object.values(week.days || {}).some((day) => {
    if (day.cigs) return true;
    if (day.energy) return true;
    if (day.marks && Object.keys(day.marks).length) return true;
    return (day.activities || []).some((item) => item.start || item.end || item.place || item.duration);
  });
}

export function sealDueWeeks(state, now, template) {
  const next = clone(state);
  for (const week of Object.values(next.weeks)) {
    if (week.sealed || !weekHasContent(week)) continue;
    if (!isDueForCollection(week.weekStart, now)) continue;
    week.sealed = true;
    week.sealedAt = now.toISOString();
    week.planSnapshot = clone(template);
    if (!next.outbox.some((item) => item.id === week.weekStart)) {
      next.outbox.push({
        id: week.weekStart,
        acked: false,
        archiveId: null,
        lastError: null,
        payload: archivePayload(week),
      });
    }
  }
  return next;
}

export function archivePayload(week) {
  return {
    kind: "my-week-archive",
    schema: 1,
    weekStart: week.weekStart,
    timezone: "Europe/London",
    sealedAt: week.sealedAt,
    planSnapshot: clone(week.planSnapshot),
    legacyPlanSnapshot: clone(week.legacyPlanSnapshot),
    days: clone(week.days),
    note: week.note || "",
    unmappedMarks: clone(week.unmappedMarks || null),
  };
}

function migrateFromLegacy(storage, legacyPlan) {
  const state = blankState();
  state.migration = { completed: true, sourceKey: LEGACY_STORE_KEY };
  const raw = storage.getItem(LEGACY_STORE_KEY);
  if (!raw) return state;

  let legacy;
  try {
    legacy = JSON.parse(raw);
  } catch {
    state.migration.completed = false;
    state.migration.error = "legacy-unreadable";
    return state;
  }

  const week = blankWeek(LEGACY_WEEK_START);
  week.legacyPlanSnapshot = legacyPlan ? clone(legacyPlan) : null;
  week.note = typeof legacy.note === "string" ? legacy.note : "";

  const unmappedMarks = {};
  for (const [key, value] of Object.entries(legacy.marks || {})) {
    const splitAt = key.indexOf(":");
    const dayId = splitAt === -1 ? "" : key.slice(0, splitAt);
    const habitId = splitAt === -1 ? "" : key.slice(splitAt + 1);
    const iso = LEGACY_DAY_ISO[dayId];
    if (!iso || !habitId) {
      unmappedMarks[key] = value;
      continue;
    }
    ensureDay(week, iso).marks[habitId] = value;
  }

  const unmappedCigs = {};
  const unmappedEnergy = {};
  for (const [dayId, value] of Object.entries(legacy.cigs || {})) {
    const iso = LEGACY_DAY_ISO[dayId];
    if (!iso) unmappedCigs[dayId] = value;
    else ensureDay(week, iso).cigs = value;
  }
  for (const [dayId, value] of Object.entries(legacy.energy || {})) {
    const iso = LEGACY_DAY_ISO[dayId];
    if (!iso) unmappedEnergy[dayId] = value;
    else ensureDay(week, iso).energy = value;
  }

  if (Object.keys(unmappedMarks).length) week.unmappedMarks = unmappedMarks;
  if (Object.keys(unmappedCigs).length) week.unmappedCigs = unmappedCigs;
  if (Object.keys(unmappedEnergy).length) week.unmappedEnergy = unmappedEnergy;

  const known = new Set(["day", "marks", "cigs", "energy", "note"]);
  const extra = {};
  for (const [key, value] of Object.entries(legacy)) {
    if (!known.has(key)) extra[key] = value;
  }
  if (Object.keys(extra).length) week.legacyFields = extra;

  state.weeks[LEGACY_WEEK_START] = week;
  return state;
}

function blankWeek(weekStart) {
  return {
    weekStart,
    note: "",
    sealed: false,
    sealedAt: null,
    planSnapshot: null,
    legacyPlanSnapshot: null,
    days: {},
    archive: null,
  };
}

function blankDay() {
  return { marks: {}, cigs: "", energy: "", activities: [] };
}

function ensureWeek(state, weekStart) {
  if (!state.weeks[weekStart]) state.weeks[weekStart] = blankWeek(weekStart);
  return state.weeks[weekStart];
}

function ensureDay(week, iso) {
  if (!week.days[iso]) week.days[iso] = blankDay();
  return week.days[iso];
}

function refreshPending(state, weekStart) {
  const item = (state.outbox || []).find((entry) => entry.id === weekStart && !entry.acked);
  if (!item) return;
  const preserved = item.payload?.planSnapshot ? clone(item.payload.planSnapshot) : null;
  item.payload = archivePayload(state.weeks[weekStart]);
  if (preserved) item.payload.planSnapshot = preserved;
}

function clone(value) {
  return structuredClone(value);
}
