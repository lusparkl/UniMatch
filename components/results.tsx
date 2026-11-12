"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { MapPin, PlaneTakeoff } from "lucide-react";
import { ProfileDrawer } from "./profile-drawer";
import { fullyChecked } from "@/lib/trust";
import { Button } from "./ui/button";
import { money as formatMoney } from "@/lib/arithmetic";
import {
  readProfile,
  saveProfile,
  useCompare,
  useShortlist,
} from "./local-store";
import { ShortlistButton } from "./shortlist-button";
import {
  costFact,
  deadlineFact,
  fundingFact,
  programTrust,
  routeOf,
  statusLabel,
  statusText,
} from "./program-facts";
import {
  countries,
  defaultProfile,
  type Profile,
  type Program,
} from "@/lib/domain";
import {
  compareMatches,
  matchProgram,
  type Match,
  type Truth,
} from "@/lib/matching";
import { nativeCity, placeName } from "@/lib/places";
/** Annual cost before aid in the budget currency, for sorting; unknown or unconvertible sorts last. */
const budgetCost = (m: Match, profile: Profile | null) => {
  const s = m.scenarios[0];
  return (
    s.converted ??
    (!profile || s.currency === profile.currency ? s.remaining : null) ??
    Infinity
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
    [now, setNow] = useState<Date | null>(null),
    [country, setCountry] = useState(initialCountry),
    [search, setSearch] = useState(""),
    [funding, setFunding] = useState(""),
    [eligibility, setEligibility] = useState(""),
    [sort, setSort] = useState("fit"),
    [filtersOpen, setFiltersOpen] = useState(false),
    [checkedOnly, setCheckedOnly] = useState(false),
    [drawerOpen, setDrawerOpen] = useState(false);
  const shortlist = useShortlist();
  const compare = useCompare();
  useEffect(() => {
    setProfile(readProfile());
    setNow(new Date());
    setReady(true);
  }, []);
  // Drawer edits re-rank at once; storage is written 250 ms after the last change.
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const editProfile = useCallback((next: Profile) => {
    setProfile(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveProfile(next), 250);
  }, []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const intakeYear = (profile ?? defaultProfile).intake.slice(0, 4);
  // Development only: time a full re-rank of the catalog (target under 50 ms for 300 programmes).
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const started = performance.now();
    programs
      .map((p) => matchProgram(p, profile ?? defaultProfile))
      .sort(compareMatches);
    console.debug(
      `Re-ranked ${programs.length} programmes in ${(performance.now() - started).toFixed(1)} ms`,
    );
  }, [programs, profile]);
  const results = useMemo(() => {
    const list = programs
      .filter(
        (p) =>
          // Bachelor's only for now; the engine still supports master's programmes.
          p.degreeLevel === "BACHELOR" &&
          (!country || p.country === country) &&
          (!checkedOnly || fullyChecked(p, intakeYear)) &&
          (!search ||
            (p.title + " " + p.university + " " + p.city + " " + p.fieldOfStudy)
              .toLowerCase()
              .includes(search.toLowerCase())),
      )
      .map((p) => matchProgram(p, profile ?? defaultProfile))
      .filter(
        (m) =>
          (!eligibility || m.status === eligibility) &&
          (!funding ||
            (funding === "scholarship" && m.program.scholarships.length > 0) ||
            (funding === "full" &&
              m.scenarios.some((s) => s.fullRide && s.eligibility !== "FAIL"))),
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
      );
    return list;
  }, [
    programs,
    profile,
    country,
    search,
    funding,
    eligibility,
    sort,
    checkedOnly,
    intakeYear,
  ]);
  const resetFilters = () => {
    setCountry("");
    setSearch("");
    setFunding("");
    setEligibility("");
    setCheckedOnly(false);
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
    checkedOnly && {
      label: "Fully checked only",
      clear: () => setCheckedOnly(false),
    },
  ].filter((c) => typeof c === "object");
  return (
    <>
      <div className="page-head">
        <div className="eyebrow">
          Hong Kong · South Korea · International routes
        </div>
        <h1>
          {profile
            ? "Programs for applicants from " +
              (profile.nationality || "abroad") +
              "."
            : "Explore Asia’s universities."}
        </h1>
        <p>
          {profile
            ? "Results re-rank as you adjust your profile. Statuses show published minimums, never your chances."
            : "Create a profile to see which programs you meet the published minimums for, and what each would cost you."}
        </p>
      </div>
      {ready && (
        <div className="profile-bar">
          <span>
            {profile
              ? [
                  "From " + (profile.nationality || "—"),
                  profile.fieldOfStudy,
                  profile.intake,
                  profile.budget > 0
                    ? formatMoney(profile.budget, profile.currency) + " budget"
                    : "no budget set",
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "You’re exploring the catalog. Complete a profile for personalised eligibility and funding scenarios."}
          </span>
          <div className="actions" style={{ gap: 10 }}>
            {profile && (
              <Button
                variant="outline"
                size="sm"
                aria-expanded={drawerOpen}
                onClick={() => setDrawerOpen(true)}
              >
                Adjust Scores And Budget
              </Button>
            )}
            <Button asChild variant="outline" size="sm">
              <Link href="/profile">
                {profile ? "Edit My Profile" : "Create My Profile"}
              </Link>
            </Button>
          </div>
        </div>
      )}
      {drawerOpen && profile && (
        <ProfileDrawer
          profile={profile}
          count={results.length}
          onChange={editProfile}
          onClose={closeDrawer}
        />
      )}
      <div className="layout">
        <aside
          className={"card filters" + (filtersOpen ? " open" : "")}
          aria-label="Filters"
        >
          <h2>Refine your shortlist</h2>
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
            {"Eligibility" + (profile ? "" : " (needs profile)")}
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
          <label className="filter-check">
            <input
              type="checkbox"
              checked={checkedOnly}
              onChange={(e) => setCheckedOnly(e.target.checked)}
            />
            <span>
              Fully checked only
              <small>
                Requirements reviewed and a complete {intakeYear} annual cost.
              </small>
            </span>
          </label>
          <button type="button" className="link-btn" onClick={resetFilters}>
            Reset filters
          </button>
        </aside>
        <section style={{ minWidth: 0 }}>
          <div className="results-bar">
            <div className="actions">
              <Button
                variant="outline"
                size="sm"
                className="filter-toggle"
                aria-expanded={filtersOpen}
                onClick={() => setFiltersOpen((o) => !o)}
              >
                {(filtersOpen ? "Hide Filters" : "Filters") +
                  (chips.length ? " (" + chips.length + ")" : "")}
              </Button>
              <span>
                <strong>{results.length}</strong> programs to explore
              </span>
            </div>
            <label>
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
              <h3>No programs match these filters.</h3>
              <p>
                Try broader filters. Programs appear here only after their facts
                have been reviewed.
              </p>
              <Button variant="outline" onClick={resetFilters}>
                Clear Filters
              </Button>
            </div>
          )}
          <div className="program-list">
            {results.map((m) => (
              <ProgramCard
                key={m.program.id}
                match={m}
                profile={profile}
                now={now}
                intakeYear={intakeYear}
                compared={compare.ids.includes(m.program.id)}
                compareFull={compare.full}
                onCompare={() => compare.toggle(m.program.id)}
                saved={shortlist.ids.includes(m.program.id)}
                savedReady={shortlist.ready}
                onSave={() => shortlist.toggle(m.program.id)}
              />
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
function ProgramCard({
  match: m,
  profile,
  now,
  intakeYear,
  compared,
  compareFull,
  onCompare,
  saved,
  savedReady,
  onSave,
}: {
  match: Match;
  profile: Profile | null;
  now: Date | null;
  intakeYear: string;
  compared: boolean;
  compareFull: boolean;
  onCompare: () => void;
  saved: boolean;
  savedReady: boolean;
  onSave: () => void;
}) {
  const p = m.program;
  const cost = costFact(p, intakeYear, profile?.currency);
  const fund = fundingFact(p);
  const deadline = deadlineFact(p, profile, now);
  const trust = programTrust(p);
  const issue = profile && m.academic.find((c) => c.state !== "PASS");
  const status = profile ? m.status : "UNKNOWN";
  const native = nativeCity(p.city);
  return (
    <article className="card lift program-card">
      <div className="card-top">
        <div className="card-id">
          <span className="uni-avatar cjk" aria-hidden="true">
            {native.slice(0, 2) || p.university.charAt(0)}
          </span>
          <div>
            <p className="card-uni">{p.university}</p>
            <p className="card-place">
              <MapPin size={13} aria-hidden />
              {placeName(p)}
            </p>
          </div>
        </div>
        <span className={"tag " + status}>
          {profile ? statusText(m) : "Profile needed"}
        </span>
      </div>
      <h2 className="program-title">{p.title}</h2>
      <div className="card-tags">
        <span className="chip-outline">
          {p.degreeLevel === "MASTER" ? "Master’s" : "Bachelor’s"}
        </span>
        <span className="chip-outline">
          {p.teachingLanguage ?? "Language not verified"}
        </span>
        <span className="chip-outline">
          {p.duration ?? "Duration not verified"}
        </span>
        {p.demo && <span className="tag UNKNOWN">Fictional demo</span>}
      </div>
      <p className="card-route">
        <PlaneTakeoff size={15} aria-hidden />
        <span>
          <strong>International route:</strong> {routeOf(p, profile)}
        </span>
      </p>
      <div className="card-metrics">
        <div>
          <div className="metric-label">Academic fit</div>
          <div className="metric-value">
            {profile ? statusLabel[m.academicState] : "Add your qualifications"}
          </div>
          {issue && <div className="metric-sub">{issue.reason}</div>}
        </div>
        <div>
          <div className="metric-label">Annual cost · before aid</div>
          <div className="metric-value">{cost.value}</div>
          <div className="metric-sub">{cost.sub}</div>
        </div>
        <div>
          <div className="metric-label">Financial assistance</div>
          <div className="metric-value">{fund.value}</div>
          <div className="metric-sub">{fund.sub}</div>
        </div>
        <div>
          <div className="metric-label">Application deadline</div>
          <div className="metric-value">{deadline.value}</div>
          <div className="metric-sub">{deadline.sub}</div>
        </div>
      </div>
      <div className="card-bottom">
        <span className={"trust trust-" + trust.tier}>
          <trust.Icon size={15} aria-hidden />
          {trust.label}
        </span>
        <div className="actions">
          <Button
            variant="outline"
            size="sm"
            aria-pressed={compared}
            disabled={compareFull && !compared}
            aria-label={"Compare " + p.title + " at " + p.university}
            onClick={onCompare}
          >
            {compared ? "Selected" : "Compare"}
          </Button>
          <ShortlistButton saved={saved} ready={savedReady} onToggle={onSave} />
          <Button asChild variant="dark" size="sm">
            <Link href={"/universities/" + p.universityId + "?program=" + p.id}>
              View Details
            </Link>
          </Button>
        </div>
      </div>
    </article>
  );
}
