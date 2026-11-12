"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { readProfile, useCompare } from "./local-store";
import {
  costFact,
  fundingFact,
  nextRound,
  programTrust,
  routeOf,
  statusLabel,
} from "./program-facts";
import { defaultProfile, type Profile, type Program } from "@/lib/domain";
import { matchProgram } from "@/lib/matching";
import { placeName } from "@/lib/places";

/** Two or three programmes side by side, matched in the browser against the stored profile. */
export function Compare({ programs }: { programs: Program[] }) {
  const [profile, setProfile] = useState<Profile | null>(null),
    [now, setNow] = useState<Date | null>(null);
  const compare = useCompare();
  const router = useRouter();
  useEffect(() => {
    setProfile(readProfile());
    setNow(new Date());
  }, []);
  // Opened without IDs (the footer link): show the programmes picked on this device.
  useEffect(() => {
    if (!programs.length && compare.ids.length)
      router.replace("/compare?ids=" + compare.ids.join(","));
  }, [programs.length, compare.ids, router]);
  const student = profile ?? defaultProfile;
  const year = student.intake.slice(0, 4);
  const remove = (id: string) => {
    if (compare.ids.includes(id)) compare.toggle(id);
    const rest = programs.filter((p) => p.id !== id).map((p) => p.id);
    router.replace(rest.length ? "/compare?ids=" + rest.join(",") : "/compare");
  };
  const rows: [string, (p: Program) => string][] = [
    ["Destination", (p) => placeName(p)],
    ["International route", (p) => routeOf(p, profile)],
    [
      "Academic fit",
      (p) =>
        profile
          ? statusLabel[matchProgram(p, student).academicState]
          : "Add your qualifications",
    ],
    [
      "Annual cost · before aid",
      (p) => costFact(p, year, profile?.currency).value,
    ],
    [
      "Financial assistance",
      (p) => {
        const f = fundingFact(p);
        return f.value + " · " + f.sub;
      },
    ],
    [
      "Next deadline",
      (p) => {
        const n = now && nextRound(p, profile, now);
        return n ? n.when.date + " · " + n.when.time : "Not verified";
      },
    ],
    ["Teaching language", (p) => p.teachingLanguage ?? "Not verified"],
    ["Duration", (p) => p.duration ?? "Not verified"],
    ["Evidence", (p) => programTrust(p).label],
  ];
  return (
    <>
      <div className="eyebrow">Side by side</div>
      <h1>Compare programs</h1>
      <p className="page-lede" style={{ marginBottom: 24 }}>
        Two or three programs on the same facts. Anything unverified is shown as
        unknown, never filled in.
      </p>
      {programs.length < 2 ? (
        <div className="empty">
          <h2>
            {programs.length
              ? "Choose one more program to compare."
              : "Nothing to compare yet."}
          </h2>
          <p>Choose “Compare” on two or three programs in your results.</p>
          <Button asChild>
            <Link href="/results">Explore Programs</Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="card compare-scroll">
            <table
              className="compare"
              style={{ minWidth: 170 + programs.length * 260 }}
            >
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sr-only">Fact</span>
                  </th>
                  {programs.map((p) => (
                    <th scope="col" key={p.id}>
                      <div className="eyebrow">{placeName(p)}</div>
                      <div className="serif compare-uni">{p.university}</div>
                      <div className="compare-title">{p.title}</div>
                      <button
                        type="button"
                        className="link-btn"
                        aria-label={
                          "Remove " + p.title + " from the comparison"
                        }
                        onClick={() => remove(p.id)}
                      >
                        Remove
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(([label, cell]) => (
                  <tr key={label}>
                    <th scope="row">
                      <span className="lbl">{label}</span>
                    </th>
                    {programs.map((p) => (
                      <td key={p.id}>{cell(p)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note">
            Two to three programs at a time. Costs are before any scholarship.
          </p>
        </>
      )}
    </>
  );
}
