import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DOCS_KEY,
  LEGACY_PROFILE_KEY,
  PROFILE_KEY,
  SHORTLIST_KEY,
  deleteProfile,
  migrateProfile,
  readDocuments,
  readProfile,
  readShortlist,
  saveProfile,
} from "@/components/local-store";
import { catalogSource, enabledCountries, isPublicMode } from "@/lib/config";
import { getPrograms } from "@/lib/catalog";
import { defaultProfile } from "@/lib/domain";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data,
  };
}
const v1Profile = {
  ...defaultProfile,
  nationality: "Ukraine",
  educationCountry: "Ukraine",
  degreeLevel: "MASTER",
  preferredCountries: ["Germany", "Hong Kong", "Singapore"],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("profile storage", () => {
  it("migrates a v1 profile once: bachelor's, enabled destinations, old key removed", () => {
    const storage = memoryStorage();
    storage.setItem(LEGACY_PROFILE_KEY, JSON.stringify(v1Profile));
    vi.stubGlobal("localStorage", storage);
    const profile = readProfile();
    expect(profile?.nationality).toBe("Ukraine");
    expect(profile?.degreeLevel).toBe("BACHELOR");
    expect(profile?.preferredCountries).toEqual(["Hong Kong"]);
    expect(storage.data.has(LEGACY_PROFILE_KEY)).toBe(false);
    expect(JSON.parse(storage.getItem(PROFILE_KEY)!).degreeLevel).toBe(
      "BACHELOR",
    );
  });

  it("gives a v1 profile with no remaining destination both destinations", () => {
    expect(
      migrateProfile({ ...v1Profile, preferredCountries: ["Germany"] })
        ?.preferredCountries,
    ).toEqual(["Hong Kong", "South Korea"]);
  });

  it("parses a stored profile that predates optional fields", () => {
    const older: Record<string, unknown> = { ...v1Profile };
    delete older.preferredCountries;
    delete older.duolingo;
    expect(migrateProfile(older)?.preferredCountries).toEqual([
      "Hong Kong",
      "South Korea",
    ]);
  });

  it("drops unreadable v1 data silently", () => {
    const storage = memoryStorage();
    storage.setItem(LEGACY_PROFILE_KEY, "{not json");
    vi.stubGlobal("localStorage", storage);
    expect(readProfile()).toBeNull();
    expect(storage.data.has(LEGACY_PROFILE_KEY)).toBe(false);
  });

  it("saves and deletes", () => {
    const storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
    expect(
      saveProfile({
        ...v1Profile,
        degreeLevel: "BACHELOR",
        nationality: "India",
      }),
    ).toBe(true);
    expect(readProfile()?.nationality).toBe("India");
    deleteProfile();
    expect(readProfile()).toBeNull();
  });
});

describe("storage failures", () => {
  it("returns empty values when storage throws", () => {
    const fail = () => {
      throw new Error("SecurityError");
    };
    vi.stubGlobal("localStorage", {
      getItem: fail,
      setItem: fail,
      removeItem: fail,
    });
    expect(readProfile()).toBeNull();
    expect(readShortlist()).toEqual([]);
    expect(readDocuments()).toEqual({});
    expect(saveProfile(defaultProfile)).toBe(false);
    expect(() => deleteProfile()).not.toThrow();
  });

  it("ignores malformed shortlist and document data", () => {
    const storage = memoryStorage();
    storage.setItem(SHORTLIST_KEY, JSON.stringify(["a", 3, "b", "a"]));
    storage.setItem(
      DOCS_KEY,
      JSON.stringify({ passport: "HAVE", cv: "MAYBE", photo: "IN_PROGRESS" }),
    );
    vi.stubGlobal("localStorage", storage);
    expect(readShortlist()).toEqual(["a", "b"]);
    expect(readDocuments()).toEqual({ passport: "HAVE", photo: "IN_PROGRESS" });
  });
});

describe("configuration", () => {
  it("parses enabled countries with Hong Kong and South Korea as default", () => {
    vi.stubEnv("ENABLED_COUNTRIES", undefined);
    expect(enabledCountries()).toEqual(["Hong Kong", "South Korea"]);
    vi.stubEnv("ENABLED_COUNTRIES", " Hong Kong , ,South Korea ");
    expect(enabledCountries()).toEqual(["Hong Kong", "South Korea"]);
  });

  it("turns on public mode and snapshot source only for exact values", () => {
    vi.stubEnv("PUBLIC_MODE", "1");
    expect(isPublicMode()).toBe(false);
    vi.stubEnv("PUBLIC_MODE", "true");
    expect(isPublicMode()).toBe(true);
    vi.stubEnv("CATALOG_SOURCE", "SNAPSHOT");
    expect(catalogSource()).toBe("db");
    vi.stubEnv("CATALOG_SOURCE", "snapshot");
    expect(catalogSource()).toBe("snapshot");
  });

  it("filters the catalog by enabled countries", async () => {
    vi.stubEnv("DEMO_MODE", "DEMO_FIXTURES");
    vi.stubEnv("ENABLED_COUNTRIES", "South Korea");
    const programs = await getPrograms();
    expect(programs.length).toBeGreaterThan(0);
    expect(new Set(programs.map((p) => p.country))).toEqual(
      new Set(["South Korea"]),
    );
  });
});
