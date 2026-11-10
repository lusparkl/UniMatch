"use client";
import { useCallback, useEffect, useState } from "react";
import { countries, profileSchema, type Profile } from "@/lib/domain";

// Everything a student enters stays in this browser. Storage can be missing or throw (private mode,
// blocked site data), so every access falls back to an empty value instead of failing the page.
export const PROFILE_KEY = "unimatch-profile-v2";
export const LEGACY_PROFILE_KEY = "unimatch-profile-v1";
export const SHORTLIST_KEY = "unimatch-shortlist-v1";
export const DOCS_KEY = "unimatch-docs-v1";
export const COMPARE_KEY = "unimatch-compare-v1";
export const COMPARE_MAX = 3;

export type TrackedDocuments = Record<string, "HAVE" | "IN_PROGRESS">;

function read(key: string): unknown {
  try {
    return JSON.parse(globalThis.localStorage?.getItem(key) ?? "null");
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
function remove(key: string) {
  try {
    globalThis.localStorage?.removeItem(key);
  } catch {
    // Nothing stored, or storage blocked: nothing to remove.
  }
}

/** A stored profile in the current shape: bachelor's only, destinations limited to the enabled ones. */
export function migrateProfile(raw: unknown): Profile | null {
  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success) return null;
  const kept = parsed.data.preferredCountries.filter((c) =>
    (countries as readonly string[]).includes(c),
  );
  return {
    ...parsed.data,
    degreeLevel: "BACHELOR",
    preferredCountries: kept.length ? kept : [...countries],
  };
}

export function readProfile(): Profile | null {
  const current = migrateProfile(read(PROFILE_KEY));
  if (current) return current;
  let stored: string | null = null;
  try {
    stored = globalThis.localStorage?.getItem(LEGACY_PROFILE_KEY) ?? null;
  } catch {
    return null;
  }
  if (stored === null) return null;
  // One-time move from the v1 key; unreadable v1 data is dropped silently.
  const migrated = migrateProfile(read(LEGACY_PROFILE_KEY));
  if (migrated) write(PROFILE_KEY, migrated);
  remove(LEGACY_PROFILE_KEY);
  return migrated;
}
export const saveProfile = (profile: Profile) => write(PROFILE_KEY, profile);
export function deleteProfile() {
  remove(PROFILE_KEY);
  remove(LEGACY_PROFILE_KEY);
}

export function readShortlist(): string[] {
  const value = read(SHORTLIST_KEY);
  return Array.isArray(value)
    ? [...new Set(value.filter((v): v is string => typeof v === "string"))]
    : [];
}
export function readDocuments(): TrackedDocuments {
  const value = read(DOCS_KEY);
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (e): e is [string, "HAVE" | "IN_PROGRESS"] =>
        e[1] === "HAVE" || e[1] === "IN_PROGRESS",
    ),
  );
}

/** The ordered shortlist of programme IDs. `ready` is false until storage has been read on the client. */
export function useShortlist() {
  const [ids, setIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setIds(readShortlist());
    setReady(true);
  }, []);
  const update = useCallback((change: (list: string[]) => string[]) => {
    setIds((list) => {
      const next = change(list);
      write(SHORTLIST_KEY, next);
      return next;
    });
  }, []);
  const toggle = useCallback(
    (id: string) =>
      update((list) =>
        list.includes(id) ? list.filter((i) => i !== id) : [...list, id],
      ),
    [update],
  );
  const move = useCallback(
    (id: string, direction: "up" | "down") =>
      update((list) => {
        const at = list.indexOf(id),
          to = direction === "up" ? at - 1 : at + 1;
        if (at < 0 || to < 0 || to >= list.length) return list;
        const next = [...list];
        [next[at], next[to]] = [next[to], next[at]];
        return next;
      }),
    [update],
  );
  const removeId = useCallback(
    (id: string) => update((list) => list.filter((i) => i !== id)),
    [update],
  );
  return { ids, ready, toggle, move, remove: removeId };
}

/** Documents the student marked as held or in progress. */
export function useTrackedDocuments() {
  const [tracked, setTracked] = useState<TrackedDocuments>({});
  useEffect(() => setTracked(readDocuments()), []);
  const mark = useCallback(
    (kind: string, status: "HAVE" | "IN_PROGRESS" | "NONE") =>
      setTracked((current) => {
        const next = { ...current };
        if (status === "NONE") delete next[kind];
        else next[kind] = status;
        write(DOCS_KEY, next);
        return next;
      }),
    [],
  );
  return { tracked, mark };
}

/** Up to three programme IDs picked for /compare. */
export function useCompare() {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    const value = read(COMPARE_KEY);
    setIds(
      Array.isArray(value)
        ? value
            .filter((v): v is string => typeof v === "string")
            .slice(0, COMPARE_MAX)
        : [],
    );
  }, []);
  const toggle = useCallback(
    (id: string) =>
      setIds((list) => {
        const next = list.includes(id)
          ? list.filter((i) => i !== id)
          : list.length < COMPARE_MAX
            ? [...list, id]
            : list;
        write(COMPARE_KEY, next);
        return next;
      }),
    [],
  );
  return { ids, toggle, full: ids.length >= COMPARE_MAX };
}
