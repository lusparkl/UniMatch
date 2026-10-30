"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, loadDocuments, type TrackedDocuments } from "./account-client";
import { readiness } from "@/lib/readiness";
import type { Profile, Program } from "@/lib/domain";
import type { Truth } from "@/lib/matching";

const testTag: Record<Truth, string> = {
  PASS: "Met",
  UNKNOWN: "Add a result",
  FAIL: "Below minimum",
};
const haveLabel = {
  HAVE: "I have it",
  IN_PROGRESS: "In progress",
  MISSING: "Not yet",
} as const;

/** What the student still needs for one program: tests against published minimums and a document checklist. */
export function ReadinessPanel({
  program,
  profile,
  signedIn,
}: {
  program: Program;
  profile: Profile | null;
  signedIn: boolean | null;
}) {
  const [tracked, setTracked] = useState<TrackedDocuments>({});
  useEffect(() => {
    if (signedIn) void loadDocuments().then((d) => setTracked(d ?? {}));
  }, [signedIn]);
  if (!profile)
    return (
      <section className="panel">
        <h3>What you need to apply</h3>
        <p className="muted">
          <Link href="/profile">Complete your profile</Link> to compare your
          test results with this program and see which documents to prepare.
        </p>
      </section>
    );
  const r = readiness(program, profile, tracked);
  async function mark(kind: string, status: string) {
    const done = await api("/api/account/documents/" + kind, "PUT", { status });
    if (done)
      setTracked((t) => {
        const next = { ...t };
        if (status === "NONE") delete next[kind];
        else next[kind] = status as "HAVE" | "IN_PROGRESS";
        return next;
      });
  }
  return (
    <section className="panel">
      <h3>What you need to apply</h3>
      {r.deadline && (
        <p className="muted">
          Next verified deadline:{" "}
          <strong>{new Date(r.deadline).toLocaleDateString()}</strong>
        </p>
      )}
      <h4>Tests</h4>
      {!r.tests.length && (
        <p className="muted">
          No test requirement is verified for this program yet. Check the
          official page before you book a test.
        </p>
      )}
      {r.tests.map((t, i) => (
        <div className="check" key={i}>
          <div>
            <strong className="tiny">{t.label}</strong>
            <p>{t.reason}</p>
          </div>
          <span className={"tag " + t.state} style={{ alignSelf: "start" }}>
            {testTag[t.state]}
          </span>
        </div>
      ))}
      <h4>Documents</h4>
      {r.documents.some((d) => d.typical) && (
        <p className="muted">
          This program’s document list is not verified yet. These are typical
          documents; confirm on the official page.
        </p>
      )}
      {r.documents.map((d) => (
        <div className="check" key={d.name}>
          <div>
            <strong className="tiny">{d.label}</strong>
            <p>{d.mandatory ? "Required" : "Optional"}</p>
          </div>
          {d.kind === null ? (
            <span className="tag UNKNOWN" style={{ alignSelf: "start" }}>
              Check official page
            </span>
          ) : signedIn ? (
            <select
              aria-label={"Status of " + d.label}
              value={d.have}
              onChange={(e) =>
                void mark(
                  d.kind!,
                  e.target.value === "MISSING" ? "NONE" : e.target.value,
                )
              }
              disabled={
                d.kind === "english" || d.kind === "standardized"
                  ? d.have === "HAVE" && !tracked[d.kind]
                  : false
              }
            >
              {Object.entries(haveLabel).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          ) : (
            <span
              className={"tag " + (d.have === "HAVE" ? "PASS" : "UNKNOWN")}
              style={{ alignSelf: "start" }}
            >
              {haveLabel[d.have as keyof typeof haveLabel] ?? "—"}
            </span>
          )}
        </div>
      ))}
      {signedIn === false && (
        <p className="muted tiny">
          <Link href="/account">Sign in</Link> to track which documents you
          already have.
        </p>
      )}
    </section>
  );
}
