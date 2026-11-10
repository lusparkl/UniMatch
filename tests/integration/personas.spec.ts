import { it, expect, vi } from "vitest";
import { getPrograms } from "../../lib/catalog";
import { matchProgram } from "../../lib/matching";
import { personas } from "../../lib/personas";
// The demo stories must hold for the published catalog, with the deployment's 30-day deadline freshness.
it.each(personas)("persona story holds: $name", async (persona) => {
  vi.stubEnv("DEMO_MODE", "false");
  vi.stubEnv("FRESHNESS_DEADLINE_DAYS", "30");
  const matches = (await getPrograms(true)).map((p) =>
    matchProgram(p, persona.profile),
  );
  expect(persona.check(matches)).toEqual([]);
});
