const ZONE = "Europe/London";

const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  weekday: "short",
  hourCycle: "h23",
  timeZoneName: "longOffset",
});

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function londonParts(date) {
  const parts = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  let hour = Number(parts.hour);
  if (hour === 24) hour = 0;
  return {
    iso: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday,
    hour,
    minute: Number(parts.minute),
    second: Number(parts.second),
    offsetMinutes: offsetToMinutes(parts.timeZoneName),
  };
}

function offsetToMinutes(name) {
  const match = String(name || "").match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}

export function londonDate(date) {
  return londonParts(date).iso;
}

export function addCalendarDays(iso, days) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days, 12)).toISOString().slice(0, 10);
}

export function londonCivilToUtc(iso, hour, minute, second) {
  const [year, month, day] = iso.split("-").map(Number);
  const civilAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  let guess = civilAsUtc;
  for (let i = 0; i < 4; i += 1) {
    const offset = londonParts(new Date(guess)).offsetMinutes;
    const next = civilAsUtc - offset * 60 * 1000;
    if (next === guess) break;
    guess = next;
  }
  return new Date(guess);
}

export function nextLondonMidnight(now) {
  const today = londonDate(now);
  const tomorrow = addCalendarDays(today, 1);
  const midnight = londonCivilToUtc(tomorrow, 0, 0, 0);
  if (midnight.getTime() <= now.getTime()) {
    return londonCivilToUtc(addCalendarDays(tomorrow, 1), 0, 0, 0);
  }
  return midnight;
}

export function weekdayIndex(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
}

export function weekStartMonday(iso) {
  const index = weekdayIndex(iso);
  const delta = index === 0 ? -6 : 1 - index;
  return addCalendarDays(iso, delta);
}

export function weekDates(weekStart) {
  return Array.from({ length: 7 }, (_, index) => addCalendarDays(weekStart, index));
}

function civilParts(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return { year, month, day };
}

export function formatWeekTitle(weekStart) {
  const days = weekDates(weekStart);
  const start = civilParts(days[0]);
  const end = civilParts(days[6]);
  if (start.month === end.month && start.year === end.year) {
    return `${start.day}–${end.day} ${MONTHS[start.month - 1]}`;
  }
  if (start.year === end.year) {
    return `${start.day} ${MONTHS[start.month - 1]} – ${end.day} ${MONTHS[end.month - 1]}`;
  }
  return `${start.day} ${MONTHS[start.month - 1]} ${start.year} – ${end.day} ${MONTHS[end.month - 1]} ${end.year}`;
}

export function formatDayLabel(iso) {
  const { day } = civilParts(iso);
  return `${WEEKDAYS[weekdayIndex(iso)].slice(0, 3)} ${day}`;
}

export function formatLongDay(iso) {
  const { day, month } = civilParts(iso);
  return `${WEEKDAYS[weekdayIndex(iso)]} ${day} ${MONTHS[month - 1]}`;
}

export function weekdayKey(iso) {
  return WEEKDAYS[weekdayIndex(iso)].slice(0, 3).toLowerCase();
}

export function isDueForCollection(weekStart, now) {
  const sunday = addCalendarDays(weekStart, 6);
  return now.getTime() >= londonCivilToUtc(sunday, 23, 0, 0).getTime();
}
