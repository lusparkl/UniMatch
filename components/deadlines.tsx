"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { readProfile } from "./local-store";
import { rounds } from "./program-facts";
import { defaultProfile, type Profile, type Program } from "@/lib/domain";
import { deadlineParts, nativeCity, shortUniversity } from "@/lib/places";

/** Verified application deadlines for one intake, grouped by month in each institution's own time zone. */
export function Deadlines({ programs }: { programs: Program[] }) {
  const [profile, setProfile] = useState<Profile | null>(null),
    [showPassed, setShowPassed] = useState(false),
    [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setProfile(readProfile());
    setNow(new Date());
  }, []);
  // Without a profile, the intake every new profile starts with.
  const student = profile ?? defaultProfile;
  const months = useMemo(() => {
    if (!now) return [];
    const items = programs
      .filter((p) => p.degreeLevel === "BACHELOR")
      .flatMap((p) =>
        rounds(p, student).map((i) => ({
          p,
          i,
          when: deadlineParts(i.deadline!, i.timezone, now),
        })),
      )
      .filter(({ when }) => showPassed || !when.passed)
      .sort((a, b) => a.i.deadline!.localeCompare(b.i.deadline!));
    const groups = new Map<string, typeof items>();
    for (const item of items)
      groups.set(item.when.month, [
        ...(groups.get(item.when.month) ?? []),
        item,
      ]);
    return [...groups];
  }, [programs, student, showPassed, now]);
  return (
    <div className="page-1000">
      <div className="eyebrow">International rounds</div>
      <h1>Application deadlines</h1>
      <p className="page-lede" style={{ maxWidth: "62ch" }}>
        Verified deadlines for your intake ({student.intake.replace("-", " ")}),
        each in the university’s own time zone. Hong Kong runs on HKT (UTC+8),
        Korea on KST (UTC+9).
      </p>
      <label className="dl-check">
        <input
          type="checkbox"
          checked={showPassed}
          onChange={(e) => setShowPassed(e.target.checked)}
        />
        Show passed deadlines
      </label>
      {now && !months.length && (
        <div className="empty" style={{ padding: "40px 24px" }}>
          No verified deadlines for this intake yet.
        </div>
      )}
      {months.map(([month, items]) => (
        <section className="month-group" key={month}>
          <h2>{month}</h2>
          {items.map(({ p, i, when }) => {
            const native = nativeCity(p.city);
            return (
              <div className="dl-row" key={p.id + i.route + i.deadline}>
                <div>
                  <Link
                    className="dl-title"
                    href={
                      "/universities/" + p.universityId + "?program=" + p.id
                    }
                  >
                    {p.title}
                  </Link>
                  <div className="dl-meta">
                    {native && (
                      <span
                        className="cjk"
                        lang={p.city === "Hong Kong" ? "zh-HK" : "ko"}
                      >
                        {native}
                      </span>
                    )}{" "}
                    {shortUniversity(p.university)} · {i.route}
                  </div>
                </div>
                <div className="dl-when">
                  <span className="chip-outline">
                    {when.short} · {when.time}
                  </span>
                  <span
                    className={
                      "pill " +
                      (when.passed
                        ? "NEUTRAL"
                        : when.daysLeft <= 7
                          ? "UNKNOWN"
                          : "INFO")
                    }
                  >
                    {when.days}
                  </span>
                </div>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
