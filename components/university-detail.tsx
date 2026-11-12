"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";
import { Button } from "./ui/button";
import { readProfile, useShortlist } from "./local-store";
import { ShortlistButton } from "./shortlist-button";
import { ReadinessPanel } from "./readiness-panel";
import {
  costFact,
  deadlineFact,
  fundingFact,
  programTrust,
  statusText,
} from "./program-facts";
import {
  defaultProfile,
  type Evidence,
  type Program,
  type Profile,
  type Verification,
} from "@/lib/domain";
import {
  annualCost,
  matchProgram,
  trusted,
  type Check,
  type Truth,
} from "@/lib/matching";
import { actionFor } from "@/lib/actions";
import { arithmetic, money, type Line } from "@/lib/arithmetic";
import { suggestions } from "@/lib/whatif";
import { fxSource } from "@/lib/fx";
import { deadlineParts } from "@/lib/places";
import { ActionLink, shortDate } from "./status";
const tabs = [
  ["req", "Requirements"],
  ["dead", "Deadlines"],
  ["fund", "Funding"],
  ["cost", "Costs"],
] as const;
type Tab = (typeof tabs)[number][0];
type Tone = Truth | "INFO" | "NEUTRAL";
/** Who stands behind a fact, as the words and tone of its tag. */
const trustTag = (status: Verification): [string, Tone] =>
  status === "ADMIN_VERIFIED"
    ? ["Human-reviewed", "PASS"]
    : status === "SOURCE_BACKED"
      ? ["Auto-verified", "INFO"]
      : status === "CONFLICTING"
        ? ["Conflicting sources", "FAIL"]
        : ["Needs verification", "UNKNOWN"];
export function Source({
  evidence,
  label,
}: {
  evidence?: Evidence;
  /** Summary text; defaults to who stands behind the evidence. */
  label?: string;
}) {
  if (!evidence) return null;
  return (
    <details className="evidence">
      <summary>{label ?? "Evidence · " + trustTag(evidence.status)[0]}</summary>
      <blockquote>
        “{evidence.excerpt}”
        <div>
          Retrieved {shortDate(evidence.retrievedAt)} ·{" "}
          <a href={evidence.url} target="_blank" rel="noopener noreferrer">
            Official source ↗
          </a>
        </div>
      </blockquote>
    </details>
  );
}
function Row({
  title,
  tag,
  evidence,
  children,
}: {
  title: React.ReactNode;
  tag?: [string, Tone];
  evidence?: Evidence;
  children?: React.ReactNode;
}) {
  return (
    <div className="detail-row">
      <div className="row">
        <div>
          <div className="row-title">{title}</div>
          <div className="row-body">{children}</div>
        </div>
        {tag && <span className={"mini " + tag[1]}>{tag[0]}</span>}
      </div>
      <Source evidence={evidence} />
    </div>
  );
}
const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};
const affordWords: Record<Truth, string> = {
  PASS: "Within budget",
  UNKNOWN: "Needs verification",
  FAIL: "Above budget",
};
const checkWords: Record<Truth, string> = {
  PASS: "Met",
  UNKNOWN: "Unknown",
  FAIL: "Not met",
};
function ArithLine({ line, strong }: { line: Line; strong?: boolean }) {
  return (
    <div className={"row" + (strong ? " strong" : "")}>
      <span>
        {line.label}
        {line.detail && <span className="detail">{line.detail}</span>}
      </span>
      <span>{line.value}</span>
    </div>
  );
}
export function UniversityDetail({
  programs,
  initialId,
}: {
  programs: Program[];
  initialId?: string;
}) {
  const [selected, setSelected] = useState(initialId ?? programs[0].id),
    [tab, setTab] = useState<Tab>("req"),
    [profile, setProfile] = useState<Profile | null>(null),
    [now, setNow] = useState<Date | null>(null);
  const shortlist = useShortlist();
  useEffect(() => {
    setProfile(readProfile());
    setNow(new Date());
  }, []);
  // The programme chips scroll sideways; keep the selected one in view.
  useEffect(() => {
    document
      .querySelector('.pick-chip[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [selected]);
  const p = programs.find((p) => p.id === selected) ?? programs[0],
    match = profile ? matchProgram(p, profile) : null,
    sums = match && profile ? arithmetic(p, profile, match) : null,
    ideas = match && profile ? suggestions(p, profile) : [],
    student = profile ?? defaultProfile,
    intakeYear = student.intake.slice(0, 4),
    degree = p.degreeLevel === "MASTER" ? "Master’s" : "Bachelor’s",
    cost = costFact(p, intakeYear, profile?.currency),
    fund = fundingFact(p),
    deadline = deadlineFact(p, profile, now),
    trust = programTrust(p),
    status = match ? match.status : "UNKNOWN";
  const host = hostOf(p.officialUrl);
  const totals = annualCost(p, intakeYear);
  return (
    <>
      <Link href="/results" className="back">
        <ArrowLeft size={14} aria-hidden /> Back to results
      </Link>
      <div className="eyebrow">
        {p.country} · {p.city}
      </div>
      <h1>{p.university}</h1>
      <p className="detail-sub">
        {p.title} · {p.teachingLanguage ?? "Teaching language not verified"} ·{" "}
        {p.duration ?? "Duration not verified"} · {degree} program
      </p>
      {p.demo && (
        <div className="notice">
          Fictional demo institution. These scenarios demonstrate the matching
          engine and are not university advice.
        </div>
      )}
      {programs.length > 1 && (
        <div className="chip-row" role="tablist" aria-label="Programs">
          {programs.map((o) => (
            <button
              key={o.id}
              role="tab"
              aria-selected={o.id === p.id}
              className="pick-chip"
              onClick={() => {
                setSelected(o.id);
                setTab("req");
              }}
            >
              {o.title}
            </button>
          ))}
        </div>
      )}
      <section className="summary">
        <div className="summary-top">
          <span className={"tag " + status}>
            {match ? statusText(match) : "Profile needed"}
          </span>
          <span className={"trust trust-" + trust.tier}>
            <trust.Icon size={15} aria-hidden />
            {trust.label}
          </span>
          <ShortlistButton
            saved={shortlist.ids.includes(p.id)}
            ready={shortlist.ready}
            onToggle={() => shortlist.toggle(p.id)}
          />
          {p.officialUrl && (
            <a href={p.officialUrl} target="_blank" rel="noopener noreferrer">
              Official program page{host && " · " + host}
              <ExternalLink size={13} aria-hidden />
            </a>
          )}
        </div>
        <div className="card-metrics">
          <div>
            <div className="metric-label">Annual cost · before aid</div>
            <div className="metric-value">{cost.value}</div>
            <div className="metric-sub">{cost.sub}</div>
          </div>
          <div>
            <div className="metric-label">Funding</div>
            <div className="metric-value">{fund.value}</div>
            <div className="metric-sub">{fund.sub}</div>
          </div>
          <div>
            <div className="metric-label">Next deadline</div>
            <div className="metric-value">{deadline.value}</div>
            <div className="metric-sub">{deadline.sub}</div>
          </div>
          <div>
            <div className="metric-label">Last researched</div>
            <div className="metric-value">
              {p.lastResearched
                ? shortDate(p.lastResearched)
                : "Awaiting research"}
            </div>
            <div className="metric-sub">Official sources only</div>
          </div>
        </div>
      </section>
      <div className="detail-grid">
        <div style={{ minWidth: 0 }}>
          <div className="tab-row" role="tablist" aria-label="Program sections">
            {tabs.map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === "req" && (
            <>
              {!p.requirements.length && !p.documents.length && (
                <p className="detail-row">
                  Information unavailable. Nothing here can be confirmed yet.
                </p>
              )}
              {p.requirements.map((r, i) => (
                <Row
                  key={i}
                  title={r.label}
                  tag={trustTag(r.status)}
                  evidence={r.evidence}
                >
                  {r.minimum !== null
                    ? "Minimum: " +
                      r.minimum +
                      (r.scale ? " (" + r.scale + ")" : "")
                    : r.allowed.length
                      ? r.allowed.join(", ")
                      : "Manual verification needed"}
                </Row>
              ))}
              {p.documents.map((d, i) => (
                <Row
                  key={"d" + i}
                  title={d.name}
                  tag={[d.mandatory ? "Required" : "Conditional", "NEUTRAL"]}
                  evidence={d.evidence}
                >
                  {d.mandatory ? "Required document" : "Conditional document"}
                </Row>
              ))}
              {(p.sources?.length ?? 0) > 0 && (
                <>
                  <h3 className="section-label">Retrieved research sources</h3>
                  <p className="note">
                    Retrieved pages are not reviewed admission claims. Follow
                    these links to check the original information.
                  </p>
                  {p.sources?.map((e, i) => (
                    <Source
                      key={i}
                      evidence={e}
                      label={
                        "Source · " +
                        hostOf(e.url) +
                        " · retrieved " +
                        shortDate(e.retrievedAt)
                      }
                    />
                  ))}
                </>
              )}
            </>
          )}
          {tab === "dead" && (
            <>
              {!p.intakes.length && (
                <Row title="Deadline not verified">
                  No verified round for {student.intake.replace("-", " ")}.
                  Check the official page before planning.
                </Row>
              )}
              {p.intakes.map((i, index) => {
                const when =
                  trusted(i.status) && i.deadline && now
                    ? deadlineParts(i.deadline, i.timezone, now)
                    : null;
                return (
                  <Row
                    key={index}
                    title={i.route}
                    tag={trustTag(i.status)}
                    evidence={i.evidence}
                  >
                    {i.academicYear + " " + i.term + " · "}
                    {when
                      ? [
                          when.date,
                          when.time +
                            (i.timezone ? "" : " · time zone not stated"),
                          when.days,
                        ].join(" · ")
                      : "Deadline not verified"}
                  </Row>
                );
              })}
            </>
          )}
          {tab === "fund" && (
            <>
              {!p.scholarships.length && (
                <p className="detail-row">
                  Information unavailable. Nothing here can be confirmed yet.
                </p>
              )}
              {p.scholarships.map((s) => (
                <Row
                  key={s.id}
                  title={s.name}
                  tag={
                    s.fundingCategory === "GUARANTEED"
                      ? ["Guaranteed", "PASS"]
                      : s.fundingCategory === "COMPETITIVE"
                        ? ["Competitive", "UNKNOWN"]
                        : ["Terms unverified", "UNKNOWN"]
                  }
                  evidence={s.evidence}
                >
                  {(s.tuitionCoverage === 1
                    ? "Covers tuition in full"
                    : s.tuitionCoverage !== null
                      ? "Covers " +
                        Math.round(s.tuitionCoverage * 100) +
                        "% of tuition"
                      : s.stipendAmount !== null && s.currency
                        ? money(s.stipendAmount, s.currency) + " a year"
                        : "Amount not published") +
                    (s.renewalConditions ? " · " + s.renewalConditions : "")}
                  {s.rules.map((r, index) => (
                    <span
                      key={index}
                      className="row-body small"
                      style={{ display: "block" }}
                    >
                      {r.label}:{" "}
                      {r.minimum !== null
                        ? "minimum " + r.minimum
                        : r.allowed.length
                          ? r.allowed.join(", ")
                          : "requires individual verification"}
                    </span>
                  ))}
                </Row>
              ))}
            </>
          )}
          {tab === "cost" && (
            <>
              {!p.costs.length && (
                <p className="detail-row">
                  Information unavailable. Nothing here can be confirmed yet.
                </p>
              )}
              {p.costs.map((c, i) => (
                <Row
                  key={i}
                  title={
                    c.period === "SEMESTER"
                      ? "Published cost · per semester"
                      : "Published cost · per year"
                  }
                  tag={trustTag(c.status)}
                  evidence={c.evidence}
                >
                  {[
                    c.tuition !== null &&
                      "Tuition " + money(c.tuition, c.currency),
                    c.living !== null &&
                      "Living " + money(c.living, c.currency),
                    c.other !== null &&
                      "Other mandatory " + money(c.other, c.currency),
                  ]
                    .filter(Boolean)
                    .join(" · ") || "No amounts"}
                </Row>
              ))}
              {p.costs.length > 0 && (
                <Row title="Total per year">
                  {totals.total !== null && totals.currency
                    ? cost.value
                    : "Incomplete: " +
                      (cost.kind === "conflict"
                        ? "sources disagree"
                        : cost.kind === "partial"
                          ? "only part of the cost is verified"
                          : "no verified annual costs")}
                </Row>
              )}
            </>
          )}
        </div>
        <aside>
          <section className="card side-card">
            <div className="eyebrow">The complete picture</div>
            <h2>Your financial scenarios</h2>
            {!match || !sums ? (
              <>
                <p style={{ margin: "8px 0 16px", fontSize: 15 }}>
                  Add your budget to compare scenarios in your own currency.
                </p>
                <Button asChild>
                  <Link href="/profile">Complete My Profile</Link>
                </Button>
              </>
            ) : (
              <>
                {match.scenarios.map((s, i) => {
                  const amount = s.remaining ?? s.ceiling ?? s.lowerBound;
                  const inBudget =
                    s.remaining !== null
                      ? s.converted
                      : s.ceiling !== null
                        ? s.ceilingConverted
                        : s.lowerBoundConverted;
                  return (
                    <div className="scenario" key={i}>
                      <div className="scenario-name">
                        {i === 0 ? "Without financial aid" : "With " + s.name}
                      </div>
                      <div className="scenario-amount serif">
                        {amount !== null && s.currency
                          ? money(amount, s.currency)
                          : "Not verified"}
                      </div>
                      <div className="scenario-caption">
                        {amount === null
                          ? "No verified amount"
                          : (s.remaining !== null
                              ? "Estimated remaining annual cost"
                              : s.ceiling !== null
                                ? "At most · the stipend is not counted"
                                : "Lower bound · only part of the cost is verified") +
                            (inBudget !== null && profile
                              ? " · " + money(inBudget, profile.currency)
                              : "")}
                      </div>
                      <span className={"mini " + s.affordable}>
                        {affordWords[s.affordable]}
                      </span>
                      <p className="scenario-reason">
                        {(s.award === "GUARANTEED"
                          ? "Guaranteed terms · verify conditions. "
                          : s.award === "COMPETITIVE"
                            ? "Potential funding · not awarded. "
                            : "") + s.reason}
                      </p>
                      <details className="arith">
                        <summary>Show the arithmetic</summary>
                        <div className="arith-lines">
                          {sums.parts.map((l) => (
                            <ArithLine key={l.label} line={l} />
                          ))}
                          <ArithLine line={sums.total} strong />
                          {sums.scenarios[i].lines.map((l) => (
                            <ArithLine key={l.label} line={l} strong />
                          ))}
                          <ArithLine line={sums.budget} />
                          <div className="fx">
                            {sums.exchange
                              ? sums.exchange.value +
                                " · " +
                                sums.exchange.detail
                              : "No currency conversion needed."}
                          </div>
                        </div>
                      </details>
                    </div>
                  );
                })}
                <p className="note">
                  Awards are evaluated one at a time and never stacked.
                  Reference rates: {fxSource.name},{" "}
                  {shortDate(fxSource.date + "T12:00:00Z")}.
                </p>
              </>
            )}
          </section>
          {match && (
            <section className="card side-card">
              <h2>Why this result?</h2>
              {[
                ...match.academic,
                ...match.application,
                {
                  label: "Financial feasibility",
                  state: match.financial,
                  reason: (
                    match.scenarios.find(
                      (s) => s.affordable === match.financial,
                    ) ?? match.scenarios[0]
                  ).reason,
                },
              ].map((c, i) => {
                const action =
                  i < match.academic.length + match.application.length
                    ? actionFor(c as Check, p, profile!)
                    : null;
                return (
                  <div className="row side-row" key={i}>
                    <div>
                      <div className="row-title small">{c.label}</div>
                      <div className="row-body small">{c.reason}</div>
                      {action && <ActionLink action={action} />}
                    </div>
                    <span className={"mini " + c.state}>
                      {checkWords[c.state]}
                    </span>
                  </div>
                );
              })}
              <p className="note">
                Meeting minimum requirements does not predict admission.
              </p>
            </section>
          )}
          {match && ideas.length > 0 && (
            <section className="card side-card subtle">
              <h2>What would change this?</h2>
              <p style={{ margin: "0 0 8px", fontSize: 13 }}>
                One hypothetical change at a time. Shown only when it would
                improve a result.
              </p>
              {ideas.map((idea, i) => (
                <div className="whatif-row" key={i}>
                  <ArrowRight size={15} aria-hidden />
                  <span>
                    {idea.text}{" "}
                    {idea.action && <ActionLink action={idea.action} />}
                  </span>
                </div>
              ))}
            </section>
          )}
          <ReadinessPanel program={p} profile={profile} now={now} />
        </aside>
      </div>
    </>
  );
}
