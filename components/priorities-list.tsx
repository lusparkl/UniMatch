"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { api } from "./account-client";
import type { Truth } from "@/lib/matching";
import type { HaveStatus } from "@/lib/documents";

export type PriorityRow = {
  programId: string;
  universityId: string;
  university: string;
  title: string;
  country: string;
  status: Truth | null;
  deadline: string | null;
  tests: { label: string; state: Truth; reason: string }[];
  documents: {
    label: string;
    mandatory: boolean;
    have: HaveStatus;
    typical: boolean;
  }[];
};

const haveText: Record<HaveStatus, string> = {
  HAVE: "Have it",
  IN_PROGRESS: "In progress",
  MISSING: "Still to prepare",
  UNTRACKED: "Check official page",
};

/** Documents still to prepare, with the number of priority programs that ask for each. */
function sharedTodo(rows: PriorityRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows)
    for (const d of row.documents)
      if (d.mandatory && (d.have === "MISSING" || d.have === "IN_PROGRESS"))
        counts.set(d.label, (counts.get(d.label) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]);
}

export function PrioritiesList({
  rows,
  hasProfile,
}: {
  rows: PriorityRow[];
  hasProfile: boolean;
}) {
  const router = useRouter();
  async function act(path: string, method: string, body?: unknown) {
    await api(path, method, body);
    router.refresh();
  }
  const todo = sharedTodo(rows);
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Your plan</div>
          <h1>My priorities</h1>
          <p className="muted">
            Programs you want most, in order. For each one: the tests and
            documents you still need before you can apply.
          </p>
        </div>
      </div>
      {!hasProfile && (
        <div className="notice">
          <Link href="/profile">Complete your profile</Link> to compare your
          test results with these programs.
        </div>
      )}
      {!rows.length && (
        <div className="empty">
          <h3>No priorities yet.</h3>
          <p className="muted">
            Find programs in your matches and choose “Add to priorities”.
          </p>
          <Button asChild>
            <Link href="/results">Explore programs</Link>
          </Button>
        </div>
      )}
      {todo.length > 0 && (
        <section className="panel">
          <h3>Documents to prepare across your priorities</h3>
          {todo.map(([label, count]) => (
            <div className="check" key={label}>
              <strong className="tiny">{label}</strong>
              <span className="tag UNKNOWN">
                {count} {count === 1 ? "program" : "programs"}
              </span>
            </div>
          ))}
        </section>
      )}
      {rows.map((row, index) => (
        <section className="panel" key={row.programId}>
          <div className="card-top">
            <div>
              <div className="eyebrow">
                #{index + 1} · {row.country}
              </div>
              <h2>{row.university}</h2>
              <p className="muted">{row.title}</p>
            </div>
            <div className="actions" style={{ gap: 6 }}>
              <Button
                variant="outline"
                size="sm"
                aria-label={"Move " + row.title + " up"}
                disabled={index === 0}
                onClick={() =>
                  void act(
                    "/api/account/priorities/" +
                      encodeURIComponent(row.programId),
                    "POST",
                    { move: "up" },
                  )
                }
              >
                <ArrowUp size={14} />
              </Button>
              <Button
                variant="outline"
                size="sm"
                aria-label={"Move " + row.title + " down"}
                disabled={index === rows.length - 1}
                onClick={() =>
                  void act(
                    "/api/account/priorities/" +
                      encodeURIComponent(row.programId),
                    "POST",
                    { move: "down" },
                  )
                }
              >
                <ArrowDown size={14} />
              </Button>
              <Button
                variant="outline"
                size="sm"
                aria-label={"Remove " + row.title}
                onClick={() =>
                  void act(
                    "/api/account/priorities/" +
                      encodeURIComponent(row.programId),
                    "DELETE",
                  )
                }
              >
                <Trash2 size={14} />
              </Button>
            </div>
          </div>
          {row.deadline && (
            <p className="muted">
              Next verified deadline:{" "}
              <strong>{new Date(row.deadline).toLocaleDateString()}</strong>
            </p>
          )}
          {hasProfile && (
            <>
              <h4>Tests</h4>
              {!row.tests.length && (
                <p className="muted">No test requirement verified yet.</p>
              )}
              {row.tests.map((t, i) => (
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
              {row.documents.some((d) => d.typical) && (
                <p className="muted">
                  Typical documents; this program’s list is not verified yet.
                </p>
              )}
              {row.documents.map((d) => (
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
                  row.universityId +
                  "?program=" +
                  row.programId
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
