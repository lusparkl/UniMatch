"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { readProfile, useShortlist, useTrackedDocuments } from "./local-store";
import { statusLabel } from "./results";
import { readiness } from "@/lib/readiness";
import type { HaveStatus } from "@/lib/documents";
import type { Profile, Program } from "@/lib/domain";

const haveText: Record<HaveStatus, string> = {
  HAVE: "Have it",
  IN_PROGRESS: "In progress",
  MISSING: "Still to prepare",
  UNTRACKED: "Check official page",
};

// Titles repeat across universities, so button labels name both.
const name = (p: Program) => p.title + " at " + p.university;

/** The student's ordered shortlist, computed in the browser from the published catalog. */
export function Shortlist({ programs }: { programs: Program[] }) {
  const shortlist = useShortlist();
  const { tracked } = useTrackedDocuments();
  const [profile, setProfile] = useState<Profile | null>(null);
  useEffect(() => setProfile(readProfile()), []);
  const rows = useMemo(
    () =>
      shortlist.ids.flatMap((id) => {
        const program = programs.find((p) => p.id === id);
        if (!program) return [];
        return [
          { program, ready: profile && readiness(program, profile, tracked) },
        ];
      }),
    [shortlist.ids, programs, profile, tracked],
  );
  // Documents still to prepare, with the number of shortlisted programmes that ask for each.
  const todo = useMemo(() => {
    const counts = new Map<string, number>();
    for (const { ready } of rows)
      for (const d of ready?.documents ?? [])
        if (d.mandatory && (d.have === "MISSING" || d.have === "IN_PROGRESS"))
          counts.set(d.label, (counts.get(d.label) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]);
  }, [rows]);
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Your plan</div>
          <h1>My shortlist</h1>
          <p className="muted">
            Programmes you want most, in order. For each one: the tests and
            documents you still need before you can apply. Saved in this browser
            only.
          </p>
        </div>
      </div>
      {shortlist.ready && !profile && (
        <div className="notice">
          <Link href="/profile">Complete your profile</Link> to compare your
          test results with these programmes.
        </div>
      )}
      {shortlist.ready && !rows.length && (
        <div className="empty">
          <h3>Your shortlist is empty.</h3>
          <p className="muted">
            Find programmes in your matches and choose “Add to shortlist”.
          </p>
          <Button asChild>
            <Link href="/results">Explore programs</Link>
          </Button>
        </div>
      )}
      {todo.length > 0 && (
        <section className="panel">
          <h3>Documents to prepare across your shortlist</h3>
          {todo.map(([label, count]) => (
            <div className="check" key={label}>
              <strong className="tiny">{label}</strong>
              <span className="tag UNKNOWN">
                {count} {count === 1 ? "programme" : "programmes"}
              </span>
            </div>
          ))}
        </section>
      )}
      {rows.map(({ program, ready }, index) => (
        <section className="panel" key={program.id}>
          <div className="card-top">
            <div>
              <div className="eyebrow">
                #{index + 1} · {program.country}
              </div>
              <h2>{program.university}</h2>
              <p className="muted">{program.title}</p>
              {ready && (
                <span className={"tag " + ready.match.status}>
                  {statusLabel[ready.match.status]}
                </span>
              )}
            </div>
            <div className="actions" style={{ gap: 6 }}>
              <Button
                variant="outline"
                size="sm"
                aria-label={"Move " + name(program) + " up"}
                disabled={index === 0}
                onClick={() => shortlist.move(program.id, "up")}
              >
                <ArrowUp size={14} />
              </Button>
              <Button
                variant="outline"
                size="sm"
                aria-label={"Move " + name(program) + " down"}
                disabled={index === rows.length - 1}
                onClick={() => shortlist.move(program.id, "down")}
              >
                <ArrowDown size={14} />
              </Button>
              <Button
                variant="outline"
                size="sm"
                aria-label={"Remove " + name(program)}
                onClick={() => shortlist.remove(program.id)}
              >
                <Trash2 size={14} />
              </Button>
            </div>
          </div>
          {ready?.deadline && (
            <p className="muted">
              Next verified deadline:{" "}
              <strong>{new Date(ready.deadline).toLocaleDateString()}</strong>
            </p>
          )}
          {ready && (
            <>
              <h4>Tests</h4>
              {!ready.tests.length && (
                <p className="muted">No test requirement verified yet.</p>
              )}
              {ready.tests.map((t, i) => (
                <div className="check" key={i}>
                  <div>
                    <strong className="tiny">{t.label}</strong>
                    <p>{t.reason}</p>
                  </div>
                  <span className={"tag " + t.state}>
                    {t.state === "PASS"
                      ? "Met"
                      : t.state === "FAIL"
                        ? "Below minimum"
                        : "Add a result"}
                  </span>
                </div>
              ))}
              <h4>Documents</h4>
              {ready.documents.some((d) => d.typical) && (
                <p className="muted">
                  Typical documents; this programme’s list is not verified yet.
                </p>
              )}
              {ready.documents.map((d) => (
                <div className="check" key={d.label}>
                  <div>
                    <strong className="tiny">{d.label}</strong>
                    <p>{d.mandatory ? "Required" : "Optional"}</p>
                  </div>
                  <span
                    className={
                      "tag " + (d.have === "HAVE" ? "PASS" : "UNKNOWN")
                    }
                  >
                    {haveText[d.have]}
                  </span>
                </div>
              ))}
            </>
          )}
          <div className="form-actions">
            <Button asChild variant="dark" size="sm">
              <Link
                href={
                  "/universities/" +
                  program.universityId +
                  "?program=" +
                  program.id
                }
              >
                Open program
              </Link>
            </Button>
          </div>
        </section>
      ))}
    </>
  );
}
