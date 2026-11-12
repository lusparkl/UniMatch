"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { Button, IconButton } from "./ui/button";
import { readProfile, useShortlist, useTrackedDocuments } from "./local-store";
import { testTag } from "./readiness-panel";
import { readiness } from "@/lib/readiness";
import { deadlineParts, placeName } from "@/lib/places";
import type { HaveStatus } from "@/lib/documents";
import type { Profile, Program } from "@/lib/domain";

const haveText: Record<HaveStatus, [string, string]> = {
  HAVE: ["Have it", "PASS"],
  IN_PROGRESS: ["In progress", "UNKNOWN"],
  MISSING: ["Still to prepare", "UNKNOWN"],
  UNTRACKED: ["Check official page", "UNKNOWN"],
};

// Titles repeat across universities, so button labels name both.
const name = (p: Program) => p.title + " at " + p.university;

/** The student's ordered shortlist, computed in the browser from the published catalog. */
export function Shortlist({
  programs,
  sharedIds,
}: {
  programs: Program[];
  /** IDs from a shared link (/shortlist?ids=a,b); shown instead of the stored list until saved. */
  sharedIds?: string[];
}) {
  const shortlist = useShortlist();
  const [copied, setCopied] = useState(false);
  const router = useRouter();
  const shared = sharedIds?.length ? sharedIds : null;
  const ids = shared ?? shortlist.ids;
  const { tracked } = useTrackedDocuments();
  const [profile, setProfile] = useState<Profile | null>(null),
    [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setProfile(readProfile());
    setNow(new Date());
  }, []);
  const rows = useMemo(
    () =>
      ids.flatMap((id) => {
        const program = programs.find((p) => p.id === id);
        if (!program) return [];
        return [
          {
            program,
            ready: profile && now && readiness(program, profile, tracked, now),
          },
        ];
      }),
    [ids, programs, profile, tracked, now],
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
    <div className="page-900">
      <div className="eyebrow">Your plan</div>
      <h1>{shared ? "Shared shortlist" : "My shortlist"}</h1>
      <p className="page-lede">
        Programs you want most, in order. For each one: the tests and documents
        you still need before you can apply. Saved in this browser only.
      </p>
      {shared && (
        <div className="notice no-print">
          Shared shortlist of {rows.length}{" "}
          {rows.length === 1 ? "program" : "programs"}.{" "}
          <Button
            size="sm"
            onClick={() => {
              for (const id of shared)
                if (!shortlist.ids.includes(id)) shortlist.toggle(id);
              router.push("/shortlist");
            }}
          >
            Save To My Shortlist
          </Button>
        </div>
      )}
      {rows.length > 0 && (
        <div className="actions no-print" style={{ gap: 10, marginBottom: 20 }}>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              const url =
                window.location.origin +
                "/shortlist?ids=" +
                rows.map((r) => r.program.id).join(",");
              try {
                await navigator.clipboard.writeText(url);
                setCopied(true);
              } catch {
                window.prompt("Copy this link", url);
              }
            }}
          >
            {copied ? "Link Copied" : "Copy Share Link"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            Print
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/deadlines">See Deadlines</Link>
          </Button>
        </div>
      )}
      {shortlist.ready && !profile && (
        <div className="notice info">
          <Link href="/profile">Complete your profile</Link> to compare your
          test results with these programs.
        </div>
      )}
      {shortlist.ready && !shared && !rows.length && (
        <div className="empty">
          <h2>Your shortlist is empty.</h2>
          <p>Find programs in your matches and choose “Add to shortlist”.</p>
          <Button asChild>
            <Link href="/results">Explore Programs</Link>
          </Button>
        </div>
      )}
      {todo.length > 0 && (
        <section className="todo">
          <h2>Documents to prepare across your shortlist</h2>
          {todo.map(([label, count]) => (
            <div className="row" key={label}>
              <span>{label}</span>
              <span className="pill UNKNOWN">
                {count} {count === 1 ? "program" : "programs"}
              </span>
            </div>
          ))}
        </section>
      )}
      {rows.map(({ program, ready }, index) => {
        const next =
          ready?.deadline && now
            ? deadlineParts(
                ready.deadline,
                program.intakes.find((i) => i.deadline === ready.deadline)
                  ?.timezone ?? null,
                now,
              )
            : null;
        return (
          <section className="card sl-card" key={program.id}>
            <div className="row">
              <div>
                <div className="eyebrow">
                  #{index + 1} · {placeName(program)}
                </div>
                <h2>{program.university}</h2>
                <div>{program.title}</div>
              </div>
              <div className="sl-buttons no-print">
                <IconButton
                  label={"Move " + name(program) + " up"}
                  disabled={index === 0}
                  onClick={() => shortlist.move(program.id, "up")}
                >
                  <ArrowUp size={18} aria-hidden />
                </IconButton>
                <IconButton
                  label={"Move " + name(program) + " down"}
                  disabled={index === rows.length - 1}
                  onClick={() => shortlist.move(program.id, "down")}
                >
                  <ArrowDown size={18} aria-hidden />
                </IconButton>
                <IconButton
                  label={"Remove " + name(program)}
                  onClick={() => shortlist.remove(program.id)}
                >
                  <Trash2 size={18} aria-hidden />
                </IconButton>
              </div>
            </div>
            {next && (
              <p style={{ margin: "12px 0 0", fontSize: 14 }}>
                Next verified deadline:{" "}
                <strong style={{ color: "var(--fg-1)" }}>
                  {next.date} · {next.time}
                </strong>
              </p>
            )}
            {ready && (
              <div className="sl-columns">
                <div className="side-list">
                  <h3 className="sub-label">Tests</h3>
                  {!ready.tests.length && (
                    <p className="note">No test requirement verified yet.</p>
                  )}
                  {ready.tests.map((t, i) => (
                    <div className="row" key={i}>
                      <div>
                        <div className="row-title small">{t.label}</div>
                        <div className="row-body small">{t.reason}</div>
                      </div>
                      <span className={"mini " + t.state}>
                        {testTag[t.state]}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="side-list">
                  <h3 className="sub-label">Documents</h3>
                  {ready.documents.some((d) => d.typical) && (
                    <p className="note">
                      Typical documents; this program’s list is not verified
                      yet.
                    </p>
                  )}
                  {!ready.documents.length && (
                    <p className="note">
                      Not yet verified. Check the official page.
                    </p>
                  )}
                  {ready.documents.map((d) => (
                    <div className="row" key={d.label}>
                      <div>
                        <div className="row-title small">{d.label}</div>
                        <div className="row-body small">
                          {d.mandatory ? "Required" : "Optional"}
                        </div>
                      </div>
                      <span className={"mini " + haveText[d.have][1]}>
                        {haveText[d.have][0]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="no-print" style={{ marginTop: 16 }}>
              <Button asChild variant="dark" size="sm">
                <Link
                  href={
                    "/universities/" +
                    program.universityId +
                    "?program=" +
                    program.id
                  }
                >
                  Open Program
                </Link>
              </Button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
