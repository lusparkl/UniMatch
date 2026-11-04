"use client";
// Account API helpers. Used only by the account pages (not in PUBLIC_MODE); student pages keep data in
// the browser through ./local-store.
import type { TrackedDocuments } from "./local-store";
export type { TrackedDocuments };

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

export async function signedInEmail() {
  const me = await api<{ user: { email: string } | null }>("/api/auth/me");
  return me?.user?.email ?? null;
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
