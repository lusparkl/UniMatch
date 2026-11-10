"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  GraduationCap,
  MapPin,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import { Button } from "./ui/button";
import { convert } from "@/lib/fx";
import { money as formatMoney } from "@/lib/arithmetic";
import { readProfile, useShortlist } from "./local-store";
import { ShortlistButton } from "./shortlist-button";
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
  sameTerm,
  type Match,
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
    : formatMoney(amount, currency);
/** A date as the institution states it: in its own time zone, else as stored (UTC). */
export const formatDate = (
  iso: string,
  timezone: string | null,
  options: Intl.DateTimeFormatOptions,
) => {
  try {
    return new Date(iso).toLocaleDateString("en", {
      ...options,
      timeZone: timezone ?? "UTC",
    });
  } catch {
    return new Date(iso).toLocaleDateString("en", {
      ...options,
      timeZone: "UTC",
    });
  }
};
/** Annual cost before aid in the budget currency, for sorting; unknown or unconvertible sorts last. */
const budgetCost = (m: Match, profile: Profile | null) => {
  const s = m.scenarios[0];
  return (
    s.converted ??
    (!profile || s.currency === profile.currency ? s.remaining : null) ??
    Infinity
  );
};
/** " (≈ US$30,590)" when an amount is charged in a currency other than the student's budget currency. */
export const approx = (
  amount: number,
  currency: string | null,
  target: string | null | undefined,
) => {
  const value =
    currency && target && currency !== target
      ? convert(amount, currency, target)
      : null;
  return value === null ? "" : " (≈ " + money(value, target!) + ")";
};
/** Annual cost headline: the full total when known, otherwise only the verified parts, never a guess. */
export const costHeadline = (
  program: Program,
  remaining: number | null,
  currency: string | null,
  target?: string | null,
) => {
  if (remaining !== null)
    return money(remaining, currency) + approx(remaining, currency, target);
  const annual = program.costs.filter(
    (c) => trusted(c.status) && c.period === "ANNUAL",
  );
  // Separate quotes for tuition, living and fees are never added up; only a single tuition figure is surfaced.
  const tuitions = [
    ...new Set(annual.flatMap((c) => (c.tuition === null ? [] : [c.tuition]))),
  ];
  const tuitionCurrency =
    annual.find((c) => c.tuition !== null)?.currency ?? null;
  return tuitions.length === 1
    ? "Partial · tuition " +
        money(tuitions[0], tuitionCurrency) +
        approx(tuitions[0], tuitionCurrency, target) +
        " only; total not verified"
    : "Information unavailable";
};

/**
 * Next verified application deadline for the student's intake (any intake without a profile). A date the
 * source gives without a time zone is still shown, marked as such; the matching engine keeps requiring one.
 */
export const nextDeadline = (program: Program, profile: Profile | null) => {
  const [year, term] = profile ? profile.intake.split("-") : [];
  const dated = program.intakes
    .filter(
      (i) =>
        trusted(i.status) &&
        i.deadline &&
        (!profile ||
          (i.academicYear === year &&
            (i.term.toUpperCase() === "UNKNOWN" || sameTerm(i.term, term)))),
    )
    .sort((a, b) => a.deadline!.localeCompare(b.deadline!));
  const now = new Date().toISOString();
  const intake = dated.find((i) => i.deadline! >= now) ?? dated.at(-1);
  if (!intake?.deadline) return "Not verified";
  const label = formatDate(intake.deadline, intake.timezone, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return (
    label +
    (intake.deadline < now ? " (passed)" : "") +
    (intake.timezone ? "" : " · time zone not stated")
  );
};
export function Results({
  programs,
  initialCountry = "",
}: {
  programs: Program[];
  initialCountry?: string;
}) {
  const [profile, setProfile] = useState<Profile | null>(null),
    [ready, setReady] = useState(false),
    [country, setCountry] = useState(initialCountry),
    [search, setSearch] = useState(""),
    [funding, setFunding] = useState(""),
    [eligibility, setEligibility] = useState(""),
    [sort, setSort] = useState("fit"),
    [filtersOpen, setFiltersOpen] = useState(false);
  const shortlist = useShortlist();
  useEffect(() => {
    setProfile(readProfile());
    setReady(true);
  }, []);
  const results = useMemo(
    () =>
      programs
        .filter(
          (p) =>
            // Bachelor's only for now; the engine still supports master's programmes.
            p.degreeLevel === "BACHELOR" &&
            (!country || p.country === country) &&
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
            : sort === "cost"
              ? (a, b) => budgetCost(a, profile) - budgetCost(b, profile)
              : sort === "fresh"
                ? (a, b) =>
                    (b.program.lastResearched ?? "").localeCompare(
                      a.program.lastResearched ?? "",
                    )
                : compareMatches,
        ),
    [programs, profile, country, search, funding, eligibility, sort],
  );
  const resetFilters = () => {
    setCountry("");
    setSearch("");
    setFunding("");
    setEligibility("");
  };
  const chips = [
    country && { label: country, clear: () => setCountry("") },
    funding && {
      label:
        funding === "full"
          ? "Potential full coverage"
          : "Scholarship available",
      clear: () => setFunding(""),
    },
    eligibility && {
      label: statusLabel[eligibility as Truth],
      clear: () => setEligibility(""),
    },
    search && { label: "“" + search + "”", clear: () => setSearch("") },
  ].filter((c) => typeof c === "object");
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
      </div>
      {ready && (
        <div className="profile-bar">
          <span>
            {profile
              ? [
                  "Bachelor’s",
                  profile.fieldOfStudy,
                  profile.intake,
                  profile.budget > 0
                    ? money(profile.budget, profile.currency) + " budget"
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "You’re exploring the catalog. Complete a profile for personalised eligibility and funding scenarios."}
          </span>
          <Button asChild variant="outline" size="sm">
            <Link href="/profile">
              <UserRound size={16} />
              {profile ? "Edit my profile" : "Create my profile"}
            </Link>
          </Button>
        </div>
      )}
      <div className="layout">
        <aside
          className={"panel filters" + (filtersOpen ? " open" : "")}
          aria-label="Filters"
        >
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
          <fieldset className="segmented">
            <legend>Destination</legend>
            {[["", "Both"], ...countries.map((c) => [c, c])].map(
              ([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={country === value}
                  onClick={() => setCountry(value)}
                >
                  {label}
                </button>
              ),
            )}
          </fieldset>
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
          <button className="link-btn" onClick={resetFilters}>
            Reset filters
          </button>
        </aside>
        <section>
          <div className="results-bar">
            <div className="actions">
              <Button
                variant="outline"
                size="sm"
                className="filter-toggle"
                aria-expanded={filtersOpen}
                onClick={() => setFiltersOpen((o) => !o)}
              >
                <SlidersHorizontal size={14} />
                {(filtersOpen ? "Hide filters" : "Filters") +
                  (chips.length ? " (" + chips.length + ")" : "")}
              </Button>
              <span>
                <strong>{results.length}</strong> programs to explore
              </span>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              Sort by
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="fit">Relevant fit</option>
                <option value="name">University name</option>
                <option value="cost">Lowest cost</option>
                <option value="fresh">Recently researched</option>
              </select>
            </label>
          </div>
          {chips.length > 0 && (
            <div className="chips">
              {chips.map((c) => (
                <button
                  key={c.label}
                  className="chip"
                  aria-label={"Remove filter " + c.label}
                  onClick={c.clear}
                >
                  {c.label} ×
                </button>
              ))}
            </div>
          )}
          {!results.length && (
            <div className="empty">
              <GraduationCap size={32} style={{ margin: "0 auto 15px" }} />
              <h3>No programs found yet.</h3>
              <p className="muted">
                Try broader filters. Real records appear after research and
                administrator review.
              </p>
              <Button variant="outline" onClick={resetFilters}>
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
                <span className="tag">
                  {m.program.duration ?? "Duration not verified"}
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
                    {costHeadline(
                      m.program,
                      m.scenarios[0].remaining,
                      m.scenarios[0].currency,
                      profile?.currency,
                    )}
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
                    {nextDeadline(m.program, profile)}
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
                <div className="actions" style={{ gap: 8 }}>
                  <ShortlistButton
                    saved={shortlist.ids.includes(m.program.id)}
                    ready={shortlist.ready}
                    onToggle={() => shortlist.toggle(m.program.id)}
                  />
                  <Button asChild variant="dark" size="sm">
                    <Link
                      href={
                        "/universities/" +
                        m.program.universityId +
                        "?program=" +
                        m.program.id
                      }
                    >
                      View details
                    </Link>
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </section>
      </div>
    </>
  );
}
