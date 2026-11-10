"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { readProfile } from "./local-store";
import { costHeadline, nextDeadline, statusLabel } from "./results";
import { StatusTag, TrustBadge } from "./status";
import { arithmetic } from "@/lib/arithmetic";
import { defaultProfile, type Profile, type Program } from "@/lib/domain";
import { matchProgram } from "@/lib/matching";
import { programTier } from "@/lib/trust";

/** Two or three programmes side by side, matched in the browser against the stored profile. */
export function Compare({ programs }: { programs: Program[] }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  useEffect(() => setProfile(readProfile()), []);
  const student = profile ?? defaultProfile;
  const cols = programs.map((p) => {
    const match = matchProgram(p, student);
    return { p, match, sums: arithmetic(p, student, match) };
  });
  const rows: [string, (c: (typeof cols)[number]) => React.ReactNode][] = [
    [
      "Overall",
      ({ match }) =>
        profile ? (
          <StatusTag state={match.status}>
            {statusLabel[match.status]}
          </StatusTag>
        ) : (
          "Add a profile"
        ),
    ],
    [
      "Academic",
      ({ match }) => (
        <StatusTag state={match.academicState}>
          {statusLabel[match.academicState]}
        </StatusTag>
      ),
    ],
    [
      "Application",
      ({ match }) => (
        <StatusTag state={match.applicationState}>
          {statusLabel[match.applicationState]}
        </StatusTag>
      ),
    ],
    [
      "Financial",
      ({ match }) => (
        <StatusTag state={match.financial}>
          {statusLabel[match.financial]}
        </StatusTag>
      ),
    ],
    [
      "Annual cost before aid",
      ({ p, match }) =>
        costHeadline(
          p,
          match.scenarios[0].remaining,
          match.scenarios[0].currency,
          profile?.currency,
        ),
    ],
    [
      "Cost arithmetic",
      ({ sums }) =>
        sums.scenarios[0].lines.map((l) => <div key={l.label}>{l.value}</div>),
    ],
    [
      "Scholarships",
      ({ p }) =>
        p.scholarships.length
          ? p.scholarships.map((s) => (
              <div key={s.id}>
                {s.name} (
                {s.fundingCategory === "GUARANTEED"
                  ? "guaranteed"
                  : "competitive"}
                )
              </div>
            ))
          : "None verified",
    ],
    ["Next deadline", ({ p }) => nextDeadline(p, profile)],
    [
      profile?.qualification
        ? "Requirements for " + profile.qualification
        : "Requirements",
      ({ p }) => {
        const rules = p.requirements.filter(
          (r) =>
            r.mandatory &&
            (!r.appliesToQualifications.length ||
              r.appliesToQualifications.some(
                (q) => q.toLowerCase() === student.qualification.toLowerCase(),
              )),
        );
        return rules.length ? (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {rules.map((r, i) => (
              <li key={i}>{r.label}</li>
            ))}
          </ul>
        ) : (
          "None verified"
        );
      },
    ],
    [
      "Checked by",
      ({ p }) => (
        <TrustBadge programme tier={programTier(p)} date={p.lastResearched} />
      ),
    ],
  ];
  return (
    <>
      <Link href="/results" className="back">
        <ArrowLeft size={14} /> Back to results
      </Link>
      <h1>Compare programmes</h1>
      {programs.length < 2 ? (
        <div className="empty">
          <h3>Pick two or three programmes to compare.</h3>
          <p className="muted">
            Use “Compare” on the results or on your shortlist.
          </p>
        </div>
      ) : (
        <div className="compare-scroll panel">
          <table className="compare">
            <thead>
              <tr>
                <th scope="col">
                  <span className="sr-only">Field</span>
                </th>
                {cols.map(({ p }) => (
                  <th scope="col" key={p.id}>
                    <Link
                      href={
                        "/universities/" + p.universityId + "?program=" + p.id
                      }
                    >
                      {p.title}
                    </Link>
                    <div className="tiny muted">{p.university}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, cell]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  {cols.map((c) => (
                    <td key={c.p.id}>{cell(c)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="tiny muted">
        Meeting the published minimums is a starting point, not a prediction of
        admission.
      </p>
    </>
  );
}
