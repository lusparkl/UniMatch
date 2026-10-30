"use client";
import { profileSchema, type Profile } from "@/lib/domain";

export const PROFILE_KEY = "unimatch-profile-v1";

export type TrackedDocuments = Record<string, "HAVE" | "IN_PROGRESS">;

/** JSON call to the account API. Resolves to null on a non-2xx answer, so callers fall back to local data. */
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T | null> {
  try {
    const response = await fetch(path, {
      method,
      headers:
        body === undefined ? undefined : { "Content-Type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
    });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

export function readLocalProfile(): Profile | null {
  try {
    const data = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? "null");
    const result = profileSchema.safeParse(data);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export async function signedInEmail() {
  const me = await api<{ user: { email: string } | null }>("/api/auth/me");
  return me?.user?.email ?? null;
}

/** Account profile when signed in, otherwise the one saved in this browser. */
export async function loadProfile(): Promise<Profile | null> {
  const remote = await api<{ profile: unknown }>("/api/account/profile");
  if (remote) {
    const parsed = profileSchema.safeParse(remote.profile);
    if (parsed.success) return parsed.data;
    // Signed in without a saved account profile: keep this browser's profile and upload it.
    const local = readLocalProfile();
    if (local) await api("/api/account/profile", "PUT", local);
    return local;
  }
  return readLocalProfile();
}

/** Always keeps a local copy; also stores it on the account when signed in. */
export async function saveProfile(profile: Profile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  await api("/api/account/profile", "PUT", profile);
}

export async function loadDocuments(): Promise<TrackedDocuments | null> {
  const result = await api<{
    documents: { kind: string; status: "HAVE" | "IN_PROGRESS" }[];
  }>("/api/account/documents");
  if (!result) return null;
  return Object.fromEntries(result.documents.map((d) => [d.kind, d.status]));
}

import { useCallback, useEffect, useState } from "react";

/** Signed-in state and the student's priority list, loaded once per page. */
export function usePriorities() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    void api<{ priorities: { programId: string }[] }>(
      "/api/account/priorities",
    ).then((result) => {
      setSignedIn(result !== null);
      setIds(result?.priorities.map((p) => p.programId) ?? []);
    });
  }, []);
  const toggle = useCallback(
    async (programId: string) => {
      const has = ids.includes(programId);
      const done = has
        ? await api(
            "/api/account/priorities/" + encodeURIComponent(programId),
            "DELETE",
          )
        : await api("/api/account/priorities", "POST", { programId });
      if (done)
        setIds((list) =>
          has ? list.filter((i) => i !== programId) : [...list, programId],
        );
      return done !== null;
    },
    [ids],
  );
  return { signedIn, ids, toggle };
}
