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