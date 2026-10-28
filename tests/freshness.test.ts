import { it, expect } from "vitest";
import { effectiveStatus } from "../lib/research/freshness";
it("expires deadline evidence sooner than stable metadata", () => {
  const retrieved = new Date("2026-10-01"),
    now = new Date("2026-10-15");
  expect(effectiveStatus("ADMIN_VERIFIED", retrieved, "deadline", now)).toBe(
    "OUTDATED",
  );
  expect(effectiveStatus("ADMIN_VERIFIED", retrieved, "metadata", now)).toBe(
    "ADMIN_VERIFIED",
  );
});
it("does not erase a conflict merely because a document was retrieved recently", () =>
  expect(effectiveStatus("CONFLICTING", new Date())).toBe("CONFLICTING"));
