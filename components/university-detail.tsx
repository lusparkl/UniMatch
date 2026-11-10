"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Button } from "./ui/button";
import { readProfile, useShortlist } from "./local-store";
import { ShortlistButton } from "./shortlist-button";
import { ReadinessPanel } from "./readiness-panel";
import {
  costHeadline,
  formatDate,
  money,
  nextDeadline,
  statusLabel,
} from "./results";
import {
  defaultProfile,
  type Evidence,
  type Program,
  type Profile,
} from "@/lib/domain";
import { matchProgram, trusted, type Truth } from "@/lib/matching";
import { actionFor } from "@/lib/actions";
import { arithmetic, type Line } from "@/lib/arithmetic";
import { suggestions } from "@/lib/whatif";
import { trustTier } from "@/lib/trust";
import { fxSource } from "@/lib/fx";
import { ActionLink, StatusTag, TrustBadge, shortDate } from "./status";
const tabs = [
  ["req", "Requirements"],
  ["dead", "Deadlines"],
  ["fund", "Funding"],
  ["cost", "Costs"],
] as const;
type Tab = (typeof tabs)[number][0];
const verification = (status: string) => status.replaceAll("_", " ");
export function Source({ evidence }: { evidence?: Evidence }) {
  return evidence ? (
    <details className="source">
      <summary>
        <TrustBadge
          tier={trustTier(evidence.status)}
          date={evidence.retrievedAt}
        />
        {(evidence.status === "OUTDATED" ||
          evidence.status === "CONFLICTING") &&
          " (" + verification(evidence.status).toLowerCase() + ")"}
      </summary>
      <blockquote>
        {evidence.excerpt}
        <div className="tiny muted">
          Retrieved {shortDate(evidence.retrievedAt)} ·{" "}
          <a href={evidence.url} target="_blank" rel="noopener noreferrer">
            Official source ↗
          </a>
        </div>
      </blockquote>
    </details>
  ) : (
    <span className="source">Not verified from an official source</span>
  );
}
const stateWords: Record<Truth, string> = {
  PASS: "Within budget",
  UNKNOWN: "Not certain",
  FAIL: "Over budget",
};
function LedgerLine({ line, total }: { line: Line; total?: boolean }) {
  return (
    <div
      className={
        "ledger-line" +
        (total ? " total" : "") +
        (line.state ? " state-" + line.state : "")
      }
    >
      <span>
        {line.label}
        {line.url && (
          <a
            className="ledger-source"
            href={line.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Source
            {line.retrievedAt && ", read " + shortDate(line.retrievedAt)} ↗
          </a>
        )}
        {line.detail && <span className="ledger-source">{line.detail}</span>}
      </span>
      <span className="value">{line.value}</span>
    </div>
  );
}
function Row({
  title,
  tag,
  tone,
  children,
}: {
  title: React.ReactNode;
  tag?: string;
  tone?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="check">
      <div>
        <strong className="tiny">{title}</strong>
        {children}
      </div>
      {tag && (
        <span className={"tag " + (tone ?? "")} style={{ alignSelf: "start" }}>
          {tag}
        </span>
      )}
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
    [profile, setProfile] = useState<Profile | null>(null);
  const shortlist = useShortlist();
  useEffect(() => setProfile(readProfile()), []);
  // The programme chips scroll sideways; keep the selected one in view.
  useEffect(() => {
    document
      .querySelector('.pick-chip[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [selected]);
  const p = programs.find((p) => p.id === selected) ?? programs[0],
    match = profile ? matchProgram(p, profile) : null,
    base = match ?? matchProgram(p, defaultProfile),
    sums = match && profile ? arithmetic(p, profile, match) : null,
    ideas = match && profile ? suggestions(p, profile) : [],
    degree = p.degreeLevel === "MASTER" ? "Master’s" : "Bachelor’s";
  return (
    <>
      <Link href="/results" className="back">
        <ArrowLeft size={14} /> Back to results
      </Link>
      <div className="eyebrow">
        {p.country} · {p.city}
      </div>
      <h1>{p.university}</h1>
      <p className="muted">
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
        <div className="actions">
          <StatusTag state={match ? match.status : "UNKNOWN"}>
            {match ? statusLabel[match.status] : "Profile needed"}
          </StatusTag>
          <ShortlistButton
            saved={shortlist.ids.includes(p.id)}
            ready={shortlist.ready}
            onToggle={() => shortlist.toggle(p.id)}
          />
          {p.officialUrl && (
            <a href={p.officialUrl} target="_blank" rel="noopener noreferrer">
              Official program page <ExternalLink size={13} />
            </a>
          )}
        </div>
        <div className="card-metrics">
          <div>
            <div className="metric-label">Annual cost · before aid</div>
            <div className="metric-value">
              {costHeadline(
                p,
                base.scenarios[0].remaining,
                base.scenarios[0].currency,
                profile?.currency,
              )}
            </div>
          </div>
          <div>
            <div className="metric-label">Funding</div>
            <div className="metric-value">
              {p.scholarships.length
                ? p.scholarships.length +
                  " option" +
                  (p.scholarships.length > 1 ? "s" : "")
                : "Not verified"}
            </div>
          </div>
          <div>
            <div className="metric-label">Next deadline</div>
            <div className="metric-value">{nextDeadline(p, profile)}</div>
          </div>
          <div>
            <div className="metric-label">Last researched</div>
            <div className="metric-value">
              {p.lastResearched
                ? new Date(p.lastResearched).toLocaleDateString("en", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : "Awaiting research"}
            </div>
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
              {!p.requirements.length && (
                <p className="muted">
                  Information unavailable. Eligibility cannot be confirmed.
                </p>
              )}
              {p.requirements.map((r, i) => (
                <Row
                  key={i}
                  title={r.label}
                  // Trusted rules carry a trust badge on their evidence; anything else is flagged here.
                  tag={trusted(r.status) ? undefined : verification(r.status)}
                  tone="UNKNOWN"
                >
                  <p>
                    {r.minimum !== null
                      ? "Minimum: " +
                        r.minimum +
                        (r.scale ? " (" + r.scale + ")" : "")
                      : r.allowed.length
                        ? r.allowed.join(", ")
                        : "Manual verification needed"}
                  </p>
                  <Source evidence={r.evidence} />
                </Row>
              ))}
              {p.documents.map((d, i) => (
                <Row
                  key={"d" + i}
                  title={d.name}
                  tag={d.mandatory ? "Required" : "Conditional"}
                >
                  <p>
                    {d.mandatory ? "Required document" : "Conditional document"}
                  </p>
                  <Source evidence={d.evidence} />
                </Row>
              ))}
              {(p.sources?.length ?? 0) > 0 && (
                <>
                  <h3 className="section-label">Retrieved research sources</h3>
                  <p className="tiny muted">
                    Retrieved pages are not reviewed admission claims. Follow
                    these links to check the original information.
                  </p>
                  {p.sources?.map((e, i) => (
                    <Source key={i} evidence={e} />
                  ))}
                </>
              )}
            </>
          )}
          {tab === "dead" && (
            <>
              {!p.intakes.length && (
                <p className="muted">
                  No verified intake or deadline available. Check the official
                  page before planning.
                </p>
              )}
              {p.intakes.map((i, index) => (
                <Row
                  key={index}
                  title={i.academicYear + " " + i.term + " · " + i.route}
                  tag={trusted(i.status) ? undefined : verification(i.status)}
                  tone="UNKNOWN"
                >
                  <p>
                    {trusted(i.status) && i.deadline
                      ? formatDate(i.deadline, i.timezone, {
                          dateStyle: "long",
                        }) +
                        " · " +
                        (i.timezone ?? "Timezone not verified")
                      : "Deadline not verified"}
                  </p>
                  <Source evidence={i.evidence} />
                </Row>
              ))}
            </>
          )}
          {tab === "fund" && (
            <>
              {!p.scholarships.length && (
                <p className="muted">
                  No verified scholarship information yet.
                </p>
              )}
              {p.scholarships.map((s) => (
                <Row
                  key={s.id}
                  title={s.name}
                  tag={
                    s.fundingCategory === "GUARANTEED"
                      ? "Guaranteed"
                      : "Competitive · not awarded"
                  }
                  tone={s.fundingCategory === "GUARANTEED" ? "PASS" : "UNKNOWN"}
                >
                  <p>
                    Tuition coverage:{" "}
                    {s.tuitionCoverage === null
                      ? "Not verified"
                      : Math.round(s.tuitionCoverage * 100) + "%"}
                    <br />
                    Annual stipend: {money(s.stipendAmount, s.currency)}
                    <br />
                    {s.renewalConditions ?? "Renewal conditions not verified"}
                  </p>
                  {s.rules.map((r, index) => (
                    <div key={index} className="tiny" style={{ marginTop: 10 }}>
                      <strong>{r.label}</strong>
                      <p>
                        {r.minimum !== null
                          ? "Minimum: " + r.minimum
                          : r.allowed.length
                            ? "Accepted: " + r.allowed.join(", ")
                            : "Requires individual verification"}
                      </p>
                      {r.evidence && <Source evidence={r.evidence} />}
                    </div>
                  ))}
                  <Source evidence={s.evidence} />
                </Row>
              ))}
            </>
          )}
          {tab === "cost" && (
            <>
              {!p.costs.length && (
                <p className="muted">Costs are not verified.</p>
              )}
              {p.costs.map((c, i) => {
                const total =
                  c.tuition === null || c.living === null || c.other === null
                    ? null
                    : c.tuition + c.living + c.other;
                return (
                  <div key={i}>
                    <div className="rule-line">
                      <span>Tuition</span>
                      <strong>{money(c.tuition, c.currency)}</strong>
                    </div>
                    <div className="rule-line">
                      <span>Living expenses</span>
                      <strong>{money(c.living, c.currency)}</strong>
                    </div>
                    <div className="rule-line">
                      <span>Other mandatory costs</span>
                      <strong>{money(c.other, c.currency)}</strong>
                    </div>
                    <div className="rule-line">
                      <span>Total per year</span>
                      <strong>{money(total, c.currency)}</strong>
                    </div>
                    <Source evidence={c.evidence} />
                  </div>
                );
              })}
            </>
          )}
        </div>
        <aside>
          <section className="panel">
            <div className="eyebrow">The complete picture</div>
            <h2>Your financial scenarios</h2>
            {!match ? (
              <>
                <p className="muted">
                  Add your budget and qualifications to compare funding
                  scenarios.
                </p>
                <Button asChild>
                  <Link href="/profile">Complete my profile</Link>
                </Button>
              </>
            ) : (
              <>
                <div className="ledger">
                  {sums!.parts.map((l) => (
                    <LedgerLine key={l.label} line={l} />
                  ))}
                  <LedgerLine line={sums!.total} total />
                  {sums!.exchange && <LedgerLine line={sums!.exchange} />}
                  <LedgerLine line={sums!.budget} />
                  {match.scenarios.map((s, i) => (
                    <div className="ledger-scenario" key={i}>
                      <h3>
                        {s.name}
                        <StatusTag state={s.affordable}>
                          {stateWords[s.affordable]}
                        </StatusTag>
                      </h3>
                      <p className="tiny" style={{ margin: "4px 0" }}>
                        {s.award === "COMPETITIVE"
                          ? "Competitive award: eligibility to apply is not an award."
                          : s.award === "GUARANTEED"
                            ? "Guaranteed terms: confirm the conditions on the official page."
                            : "Without any financial aid."}
                      </p>
                      {sums!.scenarios[i].lines.map((l) => (
                        <LedgerLine key={l.label} line={l} />
                      ))}
                      {s.fullRide && (
                        <StatusTag state="PASS">
                          Tuition, living and other costs covered
                        </StatusTag>
                      )}
                    </div>
                  ))}
                </div>
                <p className="tiny muted" style={{ marginTop: 18 }}>
                  Awards are evaluated separately. Scholarships are never
                  automatically stacked. Other currencies are converted at{" "}
                  {fxSource.name} reference rates of {fxSource.date}; treat
                  converted amounts as estimates.
                </p>
              </>
            )}
          </section>
          {match && (
            <section className="panel">
              <h2>Why this result?</h2>
              {[...match.academic, ...match.application].map((c, i) => {
                const action = actionFor(c, p, profile!);
                return (
                  <div className="check" key={i}>
                    <div>
                      <strong className="tiny">{c.label}</strong>
                      <p>{c.reason}</p>
                      {action && <ActionLink action={action} />}
                    </div>
                    <span style={{ alignSelf: "start" }}>
                      <StatusTag state={c.state}>
                        {c.state === "PASS"
                          ? "Met"
                          : c.state === "FAIL"
                            ? "Not met"
                            : "Unknown"}
                      </StatusTag>
                    </span>
                  </div>
                );
              })}
              <p className="tiny muted">
                Meeting minimum requirements does not predict admission.
              </p>
            </section>
          )}
          {match && ideas.length > 0 && (
            <section className="panel">
              <h2>What would change this?</h2>
              <ul className="whatif">
                {ideas.map((idea, i) => (
                  <li key={i}>
                    {idea.text}{" "}
                    {idea.action && <ActionLink action={idea.action} />}
                  </li>
                ))}
              </ul>
              <p className="tiny muted">
                Each line changes one thing and runs the same checks again. It
                describes the published rules, not your chances.
              </p>
            </section>
          )}
          <ReadinessPanel program={p} profile={profile} />
        </aside>
      </div>
    </>
  );
}
