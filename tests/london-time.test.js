import test from "node:test";
import assert from "node:assert/strict";
import {
  addCalendarDays,
  formatWeekTitle,
  isDueForCollection,
  londonCivilToUtc,
  londonDate,
  nextLondonMidnight,
  weekDates,
  weekStartMonday,
} from "../london-time.js";

test("London winter midnight rolls the civil date at 00:00 UTC", () => {
  assert.equal(londonDate(new Date("2026-11-07T23:59:59Z")), "2026-11-07");
  assert.equal(londonDate(new Date("2026-11-08T00:00:00Z")), "2026-11-08");
});

test("London summer midnight rolls the civil date at 23:00 UTC", () => {
  assert.equal(londonDate(new Date("2026-06-30T22:59:59Z")), "2026-06-30");
  assert.equal(londonDate(new Date("2026-06-30T23:00:00Z")), "2026-07-01");
  assert.equal(londonCivilToUtc("2026-07-01", 0, 0, 0).toISOString(), "2026-06-30T23:00:00.000Z");
});

test("London DST end still rolls at local midnight, which is 23:00 UTC", () => {
  assert.equal(londonDate(new Date("2026-10-24T22:59:59Z")), "2026-10-24");
  assert.equal(londonDate(new Date("2026-10-24T23:00:00Z")), "2026-10-25");
  assert.equal(londonCivilToUtc("2026-10-25", 0, 0, 0).toISOString(), "2026-10-24T23:00:00.000Z");
  assert.equal(londonDate(new Date("2026-10-25T00:30:00Z")), "2026-10-25");
  assert.equal(londonDate(new Date("2026-10-25T01:30:00Z")), "2026-10-25");
});

test("London DST start keeps the civil date on the spring-forward morning", () => {
  assert.equal(londonDate(new Date("2026-03-29T00:30:00Z")), "2026-03-29");
  assert.equal(londonDate(new Date("2026-03-29T01:30:00Z")), "2026-03-29");
  assert.equal(londonCivilToUtc("2026-03-29", 0, 0, 0).toISOString(), "2026-03-29T00:00:00.000Z");
});

test("next London midnight is the following local midnight", () => {
  assert.equal(
    nextLondonMidnight(new Date("2026-11-07T22:00:00Z")).toISOString(),
    "2026-11-08T00:00:00.000Z",
  );
  assert.equal(
    nextLondonMidnight(new Date("2026-06-30T22:00:00Z")).toISOString(),
    "2026-06-30T23:00:00.000Z",
  );
  assert.equal(
    nextLondonMidnight(new Date("2026-11-08T00:00:00Z")).toISOString(),
    "2026-11-09T00:00:00.000Z",
  );
});

test("weeks start on Monday and include Sunday", () => {
  assert.equal(weekStartMonday("2026-11-07"), "2026-11-02");
  assert.equal(weekStartMonday("2026-11-08"), "2026-11-02");
  assert.equal(weekStartMonday("2026-11-09"), "2026-11-09");
  assert.deepEqual(weekDates("2026-11-02"), [
    "2026-11-02",
    "2026-11-03",
    "2026-11-04",
    "2026-11-05",
    "2026-11-06",
    "2026-11-07",
    "2026-11-08",
  ]);
  assert.equal(formatWeekTitle("2026-11-02"), "2–8 Nov");
  assert.equal(addCalendarDays("2026-11-08", 1), "2026-11-09");
});

test("Sunday collection is due from 23:00 London, including during BST", () => {
  assert.equal(isDueForCollection("2026-11-02", new Date("2026-11-08T22:59:00Z")), false);
  assert.equal(isDueForCollection("2026-11-02", new Date("2026-11-08T23:00:00Z")), true);
  assert.equal(isDueForCollection("2026-11-02", new Date("2026-11-09T08:00:00Z")), true);
  assert.equal(isDueForCollection("2026-06-29", new Date("2026-07-05T21:59:00Z")), false);
  assert.equal(isDueForCollection("2026-06-29", new Date("2026-07-05T22:00:00Z")), true);
});
