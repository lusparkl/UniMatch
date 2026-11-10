"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { readProfile } from "./local-store";
import { formatDate } from "./results";
import type { Profile, Program } from "@/lib/domain";
import { sameTerm, trusted } from "@/lib/matching";

/** Verified application deadlines, grouped by month in each institution's own time zone. */
export function Deadlines({ programs }: { programs: Program[] }) {
  const [profile, setProfile] = useState<Profile | null>(null),
    [showPassed, setShowPassed] = useState(false),
    [now, setNow] = useState<string | null>(null);
  useEffect(() => {
    setProfile(readProfile());
    setNow(new Date().toISOString());
  }, []);
  const months = useMemo(() => {
    const [year, term] = profile ? profile.intake.split("-") : [];
    const items = programs
      .filter((p) => p.degreeLevel === "BACHELOR")
      .flatMap((p) =>
        p.intakes
          .filter(
            (i) =>
              trusted(i.status) &&
              i.deadline &&
              (!profile ||
                (i.academicYear === year &&
                  (i.term.toUpperCase() === "UNKNOWN" ||
                    sameTerm(i.term, term)))) &&
              (showPassed || !now || i.deadline >= now),
          )
          .map((i) => ({ p, i })),
      )
      .sort((a, b) => a.i.deadline!.localeCompare(b.i.deadline!));
    const groups = new Map<string, typeof items>();
    for (const item of items) {
      const month = formatDate(item.i.deadline!, item.i.timezone, {
        month: "long",
        year: "numeric",
      });
      groups.set(month, [...(groups.get(month) ?? []), item]);
    }
    return [...groups];
  }, [programs, profile, showPassed, now]);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Application deadlines</h1>
          <p className="muted">
            {profile
              ? "Verified deadlines for your intake (" +
                profile.intake.replace("-", " ") +
                "), in each university’s own time zone."
              : "Verified deadlines for every intake. Create a profile to see only your intake."}
          </p>
        </div>
      </div>
      <label className="filter-check" style={{ marginBottom: 12 }}>
        <input
          type="checkbox"
          checked={showPassed}
          onChange={(e) => setShowPassed(e.target.checked)}
        />
        Show passed deadlines
      </label>
      {!months.length && (
        <div className="empty">
          <h3>No verified upcoming deadlines.</h3>
          <p className="muted">
            Deadlines appear here once they are checked against the official
            page. Programmes without one say so on their page.
          </p>
          <Link href="/results">Explore programmes</Link>
        </div>
      )}
      {months.map(([month, items]) => (
        <section className="month-group" key={month}>
          <h2>{month}</h2>
          {items.map(({ p, i }) => (
            <div className="check" key={p.id + i.route + i.deadline}>
              <div>
                <strong className="tiny">
                  <Link
                    href={
                      "/universities/" + p.universityId + "?program=" + p.id
                    }
                  >
                    {p.title}
                  </Link>
                </strong>
                <p>
                  {p.university} · {i.route}
                </p>
              </div>
              <span className="tag" style={{ alignSelf: "start" }}>
                {formatDate(i.deadline!, i.timezone, {
                  month: "short",
                  day: "numeric",
                })}
                {now && i.deadline! < now ? " (passed)" : ""}
              </span>
            </div>
          ))}
        </section>
      ))}
    </>
  );
}
