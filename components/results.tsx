"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  GraduationCap,
  MapPin,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import { Button } from "./ui/button";
import { readProfile } from "./profile-wizard";
import {
  countries,
  defaultProfile,
  type Profile,
  type Program,
} from "@/lib/domain";
import {
  trusted,
  compareMatches,
  matchProgram,
  type Truth,
} from "@/lib/matching";
export const statusLabel: Record<Truth, string> = {
  PASS: "Published minimums met",
  UNKNOWN: "Needs verification",
  FAIL: "Requirements not met",
};
export const money = (amount: number | null, currency: string | null) =>
  amount === null || !currency
    ? "Information unavailable"
    : new Intl.NumberFormat("en", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(amount);
export function Results({ programs }: { programs: Program[] }) {
  const [profile, setProfile] = useState<Profile | null>(null),
    [ready, setReady] = useState(false),
    [country, setCountry] = useState(""),
    [degree, setDegree] = useState(""),
    [search, setSearch] = useState(""),
    [funding, setFunding] = useState(""),
    [eligibility, setEligibility] = useState(""),
    [sort, setSort] = useState("fit");
  useEffect(() => {
    const saved = readProfile();
    setProfile(saved);
    if (saved) setDegree(saved.degreeLevel);
    setReady(true);
  }, []);
  const results = useMemo(
    () =>
      programs
        .filter(
          (p) =>
            (!country
              ? p.country &&
                (profile?.preferredCountries.includes(
                  p.country as (typeof countries)[number],
                ) ??
                  true)
              : p.country === country) &&
            (!degree || p.degreeLevel === degree) &&
            (!search ||
              (p.title + " " + p.university + " " + p.fieldOfStudy)
                .toLowerCase()
                .includes(search.toLowerCase())),
        )
        .map((p) => matchProgram(p, profile ?? defaultProfile))
        .filter(
          (m) =>
            (!eligibility || m.status === eligibility) &&
            (!funding ||
              (funding === "scholarship" &&
                m.program.scholarships.length > 0) ||
              (funding === "full" &&
                m.scenarios.some(
                  (s) => s.fullRide && s.eligibility !== "FAIL",
                ))),
        )
        .sort(
          sort === "name"
            ? (a, b) => a.program.university.localeCompare(b.program.university)
            : sort === "fresh"
              ? (a, b) =>
                  (b.program.lastResearched ?? "").localeCompare(
                    a.program.lastResearched ?? "",
                  )
              : compareMatches,
        ),
    [programs, profile, country, degree, search, funding, eligibility, sort],
  );
  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Your possibilities, made clearer</div>
          <h1>
            {profile
              ? "A world of possibilities."
              : "Explore your next chapter."}
          </h1>
          <p className="muted">
            Look beyond the name. Find a program that fits your life.
          </p>
        </div>
        <div className="actions">
          <Button asChild variant="outline">
            <Link href="/profile">
              <UserRound size={16} />
              {profile ? "Edit my profile" : "Create my profile"}
            </Link>
          </Button>
        </div>
      </div>
      {ready && !profile && (
        <div className="notice">
          You’re exploring the catalog.{" "}
          <Link href="/profile" style={{ textDecoration: "underline" }}>
            Complete your profile
          </Link>{" "}
          to see personalized eligibility and financial scenarios.
        </div>
      )}
      <div className="layout">
        <aside className="panel filters">
          <h3>
            <SlidersHorizontal size={16} /> Refine your shortlist
          </h3>
          <label>
            Program or university
            <input
              placeholder="Search programs…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label>
            Destination
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            >
              <option value="">All preferred destinations</option>
              {countries.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Degree level
            <select value={degree} onChange={(e) => setDegree(e.target.value)}>
              <option value="">All degrees</option>
              <option value="BACHELOR">Bachelor’s degree</option>
              <option value="MASTER">Master’s degree</option>
            </select>
          </label>
          <label>
            Funding options
            <select
              value={funding}
              onChange={(e) => setFunding(e.target.value)}
            >
              <option value="">All funding options</option>
              <option value="scholarship">Scholarship available</option>
              <option value="full">Potential full coverage</option>
            </select>
          </label>
          <label>
            Eligibility
            <select
              value={eligibility}
              onChange={(e) => setEligibility(e.target.value)}
              disabled={!profile}
            >
              <option value="">All statuses</option>
              {Object.entries(statusLabel).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <button
            className="tiny muted"
            style={{ textAlign: "left", marginTop: 20 }}
            onClick={() => {
              setCountry("");
              setDegree("");
              setSearch("");
              setFunding("");
              setEligibility("");
            }}
          >
            Reset filters
          </button>
        </aside>
        <section>
          <div className="results-bar">
            <span>
              <strong>{results.length} programs</strong> to explore
            </span>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              Sort by
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="fit">Relevant fit</option>
                <option value="name">University name</option>
                <option value="fresh">Recently researched</option>
              </select>
            </label>
          </div>
          {!results.length && (
            <div className="empty">
              <GraduationCap size={32} style={{ margin: "0 auto 15px" }} />
              <h3>No programs found yet.</h3>
              <p className="muted">
                Try broader filters. Real records appear after research and
                administrator review.
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setCountry("");
                  setDegree("");
                  setSearch("");
                  setFunding("");
                  setEligibility("");
                }}
              >
                Clear filters
              </Button>
            </div>
          )}
          {results.map((m) => (
            <article className="program-card" key={m.program.id}>
              <div className="card-top">
                <div className="uni-icon">
                  <GraduationCap size={24} />
                </div>
                <div>
                  <h3>{m.program.university}</h3>
                  <p className="muted">
                    <MapPin size={11} style={{ display: "inline" }} />{" "}
                    {m.program.city}, {m.program.country}
                  </p>
                </div>
                <span className={"tag " + (profile ? m.status : "UNKNOWN")}>
                  {profile ? statusLabel[m.status] : "Profile needed"}
                </span>
              </div>
              <h2 className="program-title">{m.program.title}</h2>
              <div className="actions" style={{ gap: 7, marginBottom: 17 }}>
                <span className="tag">
                  {m.program.degreeLevel === "MASTER"
                    ? "Master’s"
                    : "Bachelor’s"}
                </span>
                <span className="tag">
                  {m.program.teachingLanguage ?? "Language not verified"}
                </span>
                {m.program.demo && (
                  <span className="tag UNKNOWN">Fictional demo</span>
                )}
              </div>
              <div className="card-metrics">
                <div>
                  <div className="metric-label">Academic fit</div>
                  <div className="metric-value">
                    {profile
                      ? statusLabel[m.academicState]
                      : "Add your qualifications"}
                  </div>
                </div>
                <div>
                  <div className="metric-label">Annual cost · before aid</div>
                  <div className="metric-value">
                    {money(m.scenarios[0].remaining, m.scenarios[0].currency)}
                  </div>
                </div>
                <div>
                  <div className="metric-label">Financial assistance</div>
                  <div className="metric-value">
                    {m.program.scholarships.length
                      ? m.program.scholarships.length +
                        " funding option · conditions apply"
                      : "Not verified"}
                  </div>
                </div>
                <div>
                  <div className="metric-label">Application deadline</div>
                  <div className="metric-value">
                    {(() => {
                      const intake = m.program.intakes
                        .filter(
                          (i) =>
                            trusted(i.status) &&
                            i.deadline &&
                            i.timezone &&
                            (!profile ||
                              profile.intake === i.academicYear + "-" + i.term),
                        )
                        .sort((a, b) =>
                          a.deadline!.localeCompare(b.deadline!),
                        )[0];
                      return intake?.deadline
                        ? new Date(intake.deadline).toLocaleDateString("en", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "Not verified";
                    })()}
                  </div>
                </div>
              </div>
              <div className="card-bottom">
                <span>
                  {m.program.lastResearched
                    ? "Researched " +
                      new Date(m.program.lastResearched).toLocaleDateString(
                        "en",
                        { month: "short", day: "numeric", year: "numeric" },
                      )
                    : "Awaiting research"}
                </span>
                <Button asChild variant="ghost" size="sm">
                  <Link
                    href={
                      "/universities/" +
                      m.program.universityId +
                      "?program=" +
                      m.program.id
                    }
                  >
                    View details <ArrowRight size={14} />
                  </Link>
                </Button>
              </div>
            </article>
          ))}
        </section>
      </div>
    </>
  );
}
