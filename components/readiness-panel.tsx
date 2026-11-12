"use client";
import Link from "next/link";
import { useTrackedDocuments } from "./local-store";
import { readiness } from "@/lib/readiness";
import { deadlineParts } from "@/lib/places";
import type { Profile, Program } from "@/lib/domain";
import type { Truth } from "@/lib/matching";

export const testTag: Record<Truth, string> = {
  PASS: "Met",
  UNKNOWN: "Add a result",
  FAIL: "Below minimum",
};
const haveLabel = {
  MISSING: "Not yet",
  IN_PROGRESS: "In progress",
  HAVE: "I have it",
} as const;

/** What the student still needs for one program: tests against published minimums and a document checklist. */
export function ReadinessPanel({
  program,
  profile,
  now,
}: {
  program: Program;
  profile: Profile | null;
  now: Date | null;
}) {
  // Stored in this browser only.
  const { tracked, mark } = useTrackedDocuments();
  if (!profile || !now)
    return (
      <section className="card side-card">
        <h2>What you need to apply</h2>
        <p style={{ margin: 0, fontSize: 15 }}>
          <Link href="/profile">Complete your profile</Link> to compare your
          test results with this program and see which documents to prepare.
        </p>
      </section>
    );
  const r = readiness(program, profile, tracked, now);
  const next =
    r.deadline &&
    deadlineParts(
      r.deadline,
      program.intakes.find((i) => i.deadline === r.deadline)?.timezone ?? null,
      now,
    );
  return (
    <section className="card side-card">
      <h2>What you need to apply</h2>
      {next && (
        <p style={{ margin: "0 0 4px", fontSize: 14 }}>
          Next verified deadline:{" "}
          <strong style={{ color: "var(--fg-1)" }}>
            {next.date} · {next.time}
          </strong>
        </p>
      )}
      <h3 className="sub-label">Tests</h3>
      <div className="side-list">
        {!r.tests.length && (
          <p className="note">
            No test requirement is verified for this program yet. Check the
            official page before you book a test.
          </p>
        )}
        {r.tests.map((t, i) => (
          <div className="row" key={i}>
            <div>
              <div className="row-title small">{t.label}</div>
              <div className="row-body small">{t.reason}</div>
            </div>
            <span className={"mini " + t.state}>{testTag[t.state]}</span>
          </div>
        ))}
      </div>
      <h3 className="sub-label">Documents</h3>
      <div className="side-list">
        {r.documents.some((d) => d.typical) && (
          <p className="note">
            This program’s document list is not verified yet. These are typical
            documents; confirm on the official page.
          </p>
        )}
        {r.documents.map((d) => (
          <div className="row center" key={d.name}>
            <div>
              <div className="row-title small">{d.label}</div>
              <div className="row-body small">
                {d.mandatory ? "Required" : "Optional"}
              </div>
            </div>
            {d.kind === null ? (
              <span className="mini UNKNOWN" style={{ alignSelf: "center" }}>
                Check official page
              </span>
            ) : (
              <select
                aria-label={"Status of " + d.label}
                value={d.have}
                onChange={(e) =>
                  mark(
                    d.kind!,
                    e.target.value === "MISSING"
                      ? "NONE"
                      : (e.target.value as "HAVE" | "IN_PROGRESS"),
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
            )}
          </div>
        ))}
      </div>
      <p className="note">Document status is saved in this browser only.</p>
    </section>
  );
}
