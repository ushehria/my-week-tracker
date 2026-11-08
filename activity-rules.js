export function normalizeTime(value) {
  const match = String(value ?? "").trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function minutes(value) {
  const time = normalizeTime(value);
  if (!time) return null;
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

export function derivedDuration(start, end) {
  const from = minutes(start);
  const to = minutes(end);
  if (from == null || to == null || to <= from) return "";
  const total = to - from;
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours && mins) return `${hours}h ${mins}m`;
  if (hours) return `${hours}h`;
  return `${mins}m`;
}

export function rangesOverlap(a, b) {
  return a.start < b.end && b.start < a.end;
}

export function validateActivity(candidate, others = []) {
  const start = normalizeTime(candidate.start);
  const end = normalizeTime(candidate.end);
  if (!start || !end) return { ok: false, error: "Add a start and end." };
  if (end <= start) return { ok: false, error: "End must be after the start." };
  const clash = others.find((other) => {
    if (other.id === candidate.id) return false;
    const otherStart = normalizeTime(other.start);
    const otherEnd = normalizeTime(other.end);
    if (!otherStart || !otherEnd) return false;
    return rangesOverlap({ start, end }, { start: otherStart, end: otherEnd });
  });
  if (clash) {
    const name = String(clash.title || clash.place || "").trim() || "another activity";
    return {
      ok: false,
      error: `Overlaps ${name} (${normalizeTime(clash.start)}–${normalizeTime(clash.end)}). Touching the same minute is fine.`,
    };
  }
  const title = String(candidate.title ?? candidate.place ?? "");
  return {
    ok: true,
    activity: {
      ...candidate,
      title,
      start,
      end,
      duration: derivedDuration(start, end),
    },
  };
}

export function sortActivities(items) {
  return [...items].sort((a, b) => {
    const as = normalizeTime(a.start) || "";
    const bs = normalizeTime(b.start) || "";
    if (as && bs && as !== bs) return as < bs ? -1 : 1;
    if (as && !bs) return -1;
    if (!as && bs) return 1;
    return String(a.id).localeCompare(String(b.id));
  });
}

export function presentActivity(raw) {
  const title = String(raw?.title ?? raw?.place ?? "");
  const start = raw?.start || "";
  const end = raw?.end || "";
  const derived = derivedDuration(start, end);
  return {
    ...raw,
    id: raw.id,
    title,
    start,
    end,
    duration: derived || raw?.duration || "",
    place: raw?.place ?? title,
  };
}
