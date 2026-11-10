import { it, expect, vi } from "vitest";
import {
  getPrograms,
  parseSnapshot,
  queryRows,
  snapshotJson,
  toProgram,
} from "../../lib/catalog";
import { enabledCountries } from "../../lib/config";
import { matchProgram } from "../../lib/matching";
import { personas } from "../../lib/personas";
it("database and snapshot modes give identical matches for every persona", async () => {
  vi.stubEnv("DEMO_MODE", "false");
  const now = new Date();
  const fromDb = await getPrograms(true, now);
  const enabled = enabledCountries();
  const fromSnapshot = parseSnapshot(snapshotJson(await queryRows(), null))
    .programmes.filter((r) => enabled.includes(r.university.country))
    .map((r) => toProgram(r, now));
  const byId = <T extends { id: string }>(xs: T[]) =>
    [...xs].sort((a, b) => a.id.localeCompare(b.id));
  expect(fromSnapshot.length).toBe(fromDb.length);
  for (const persona of personas)
    expect(
      byId(fromSnapshot).map((p) => matchProgram(p, persona.profile, now)),
    ).toEqual(byId(fromDb).map((p) => matchProgram(p, persona.profile, now)));
});
