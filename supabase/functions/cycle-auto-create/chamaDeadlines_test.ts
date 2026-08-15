import { assertEquals } from "https://deno.land/std@0.190.0/testing/asserts.ts";
import { getNextChamaCycleWindow } from "../_shared/chamaDeadlines.ts";

Deno.test("daily cycle advances to the next Kenya day at 00:01–22:00 EAT", () => {
  const result = getNextChamaCycleWindow(new Date("2026-08-14T18:00:00Z"), { frequency: "daily" });
  assertEquals(result.startDate.toISOString(), "2026-08-14T21:01:00.000Z");
  assertEquals(result.endDate.toISOString(), "2026-08-15T19:00:00.000Z");
});

Deno.test("weekly cycle covers seven Kenya calendar days", () => {
  const result = getNextChamaCycleWindow(new Date("2026-08-14T19:00:00Z"), { frequency: "weekly" });
  assertEquals(result.startDate.toISOString(), "2026-08-14T21:01:00.000Z");
  assertEquals(result.endDate.toISOString(), "2026-08-21T19:00:00.000Z");
});

Deno.test("monthly chosen day crosses month end without fixed 30-day drift", () => {
  const result = getNextChamaCycleWindow(new Date("2026-01-31T19:00:00Z"), {
    frequency: "monthly",
    monthlyDay: 28,
  });
  assertEquals(result.endDate.toISOString(), "2026-02-28T19:00:00.000Z");
});

Deno.test("twice-monthly alternates configured calendar days", () => {
  const result = getNextChamaCycleWindow(new Date("2026-08-15T19:00:00Z"), {
    frequency: "twice_monthly",
    monthlyDay: 10,
    monthlyDay2: 25,
  });
  assertEquals(result.endDate.toISOString(), "2026-08-25T19:00:00.000Z");
});

Deno.test("every-N-days uses inclusive cycle windows", () => {
  const result = getNextChamaCycleWindow(new Date("2026-08-14T19:00:00Z"), {
    frequency: "every_n_days",
    everyNDaysCount: 3,
  });
  assertEquals(result.endDate.toISOString(), "2026-08-17T19:00:00.000Z");
});
Deno.test("twice-weekly alternates the two chosen weekdays (Mon & Thu)", () => {
  // Sat 15 Aug 2026 19:00 UTC (22:00 EAT) -> next chosen weekday is Monday 17 Aug
  const first = getNextChamaCycleWindow(new Date("2026-08-15T19:00:00Z"), {
    frequency: "twice_weekly",
    weeklyDay: 1,
    weeklyDay2: 4,
  });
  assertEquals(first.endDate.toISOString(), "2026-08-17T19:00:00.000Z");

  const second = getNextChamaCycleWindow(first.endDate, {
    frequency: "twice_weekly",
    weeklyDay: 1,
    weeklyDay2: 4,
  });
  assertEquals(second.endDate.toISOString(), "2026-08-20T19:00:00.000Z");

  const third = getNextChamaCycleWindow(second.endDate, {
    frequency: "twice_weekly",
    weeklyDay: 1,
    weeklyDay2: 4,
  });
  assertEquals(third.endDate.toISOString(), "2026-08-24T19:00:00.000Z");
});

Deno.test("twice-weekly handles Sunday/Monday pair across year boundary", () => {
  // Thu 31 Dec 2026 -> next is Sunday 3 Jan 2027, then Monday 4 Jan
  const first = getNextChamaCycleWindow(new Date("2026-12-31T19:00:00Z"), {
    frequency: "twice_weekly",
    weeklyDay: 0,
    weeklyDay2: 1,
  });
  assertEquals(first.endDate.toISOString(), "2027-01-03T19:00:00.000Z");

  const second = getNextChamaCycleWindow(first.endDate, {
    frequency: "twice_weekly",
    weeklyDay: 0,
    weeklyDay2: 1,
  });
  assertEquals(second.endDate.toISOString(), "2027-01-04T19:00:00.000Z");
});

Deno.test("twice-weekly falls back safely when days are missing or identical", () => {
  const missing = getNextChamaCycleWindow(new Date("2026-08-15T19:00:00Z"), {
    frequency: "twice_weekly",
  });
  assertEquals(missing.endDate > new Date("2026-08-15T19:00:00Z"), true);

  const identical = getNextChamaCycleWindow(new Date("2026-08-15T19:00:00Z"), {
    frequency: "twice_weekly",
    weeklyDay: 3,
    weeklyDay2: 3,
  });
  assertEquals(identical.endDate.toISOString(), "2026-08-19T19:00:00.000Z");
});
