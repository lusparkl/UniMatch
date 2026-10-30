"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, GraduationCap } from "lucide-react";
import { Button } from "./ui/button";
import { loadProfile, usePriorities } from "./account-client";
import { PriorityButton } from "./priority-button";
import { ReadinessPanel } from "./readiness-panel";
import { money, statusLabel } from "./results";
import { matchProgram, trusted } from "@/lib/matching";
import type { Evidence, Program, Profile } from "@/lib/domain";
export function Source({ evidence }: { evidence?: Evidence }) {
  return evidence ? (
    <div className="source">
      <a href={evidence.url} target="_blank" rel="noopener noreferrer">
        Official evidence ↗ · {evidence.status.replaceAll("_", " ")}
      </a>
      <blockquote>{evidence.excerpt}</blockquote>Retrieved{" "}
      {new Date(evidence.retrievedAt).toLocaleDateString()}
    </div>
  ) : (
    <span className="source">Not verified from an official source</span>
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
    [profile, setProfile] = useState<Profile | null>(null);
  const priorities = usePriorities();
  useEffect(() => {
    void loadProfile().then(setProfile);
  }, []);
  const p = programs.find((p) => p.id === selected) ?? programs[0],
    match = profile ? matchProgram(p, profile) : null;
  return (
    <>
      <Link href="/results" className="back">
        <ArrowLeft size={14} /> Back to your shortlist
      </Link>
      <div className="page-head">
        <div>
          <div className="eyebrow">
            {p.country} · {p.city}
          </div>
          <h1>{p.university}</h1>
          <p className="muted">
            Understand the requirements. Follow the evidence. Plan your next
            move.
          </p>
        </div>
        <span className="uni-icon">
          <GraduationCap />
        </span>
      </div>
      {p.demo && (
        <div className="notice">
          Fictional demo institution. These scenarios demonstrate the matching
          engine and are not university advice.
        </div>
      )}
      <label style={{ maxWidth: 500, marginBottom: 25 }}>
        Explore a program
        <select value={p.id} onChange={(e) => setSelected(e.target.value)}>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </label>
      <div className="detail-grid">
        <div>
          <section className="panel">
            <h2>{p.title}</h2>
            <p className="muted">
              {p.teachingLanguage ?? "Teaching language not verified"} ·{" "}
              {p.degreeLevel === "MASTER" ? "Master’s" : "Bachelor’s"} program
            </p>
            <div style={{ margin: "10px 0" }}>
              <PriorityButton
                programId={p.id}
                saved={priorities.ids.includes(p.id)}
                signedIn={priorities.signedIn}
                toggle={priorities.toggle}
              />
            </div>
            {p.officialUrl && (
              <a
                href={p.officialUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="source"
              >
                Visit the official program page{" "}
                <ExternalLink size={12} style={{ display: "inline" }} />
              </a>
            )}
          </section>
          <ReadinessPanel
            program={p}
            profile={profile}
            signedIn={priorities.signedIn}
          />
          <section className="panel">
            <h3>Admission & language requirements</h3>
            {!p.requirements.length && (
              <p className="muted">
                Information unavailable. Eligibility cannot be confirmed.
              </p>
            )}
            {p.requirements.map((r, i) => (
              <div className="check" key={i}>
                <div>
                  <strong className="tiny">{r.label}</strong>
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
                </div>
                <span
                  className={"tag " + (trusted(r.status) ? "PASS" : "UNKNOWN")}
                  style={{ alignSelf: "start" }}
                >
                  {r.status.replaceAll("_", " ")}
                </span>
              </div>
            ))}
          </section>
          <section className="panel">
            <h3>Application routes & deadlines</h3>
            {!p.intakes.length && (
              <p className="muted">No verified intake or deadline available.</p>
            )}
            {p.intakes.map((i, index) => (
              <div className="check" key={index}>
                <div>
                  <strong>
                    {i.academicYear} {i.term} · {i.route}
                  </strong>
                  <p>
                    {trusted(i.status) && i.deadline
                      ? new Date(i.deadline).toLocaleString() +
                        " · " +
                        (i.timezone ?? "Timezone not verified")
                      : "Deadline not verified"}
                  </p>
                  <Source evidence={i.evidence} />
                </div>
              </div>
            ))}
          </section>
          {(p.sources?.length ?? 0) > 0 && (
            <section className="panel">
              <h3>Retrieved research sources</h3>
              <p className="tiny muted">
                Retrieved pages are not reviewed admission claims. Follow these
                links to check the original information.
              </p>
              {p.sources?.map((e, i) => (
                <Source key={i} evidence={e} />
              ))}
            </section>
          )}
          <section className="panel">
            <h3>Required documents</h3>
            {!p.documents.length && (
              <p className="muted">Information unavailable.</p>
            )}
            {p.documents.map((d, i) => (
              <div className="check" key={i}>
                <div>
                  {d.name}
                  <Source evidence={d.evidence} />
                </div>
                <span className="tag" style={{ alignSelf: "start" }}>
                  {d.mandatory ? "Required" : "Conditional"}
                </span>
              </div>
            ))}
          </section>
          <section className="panel">
            <h3>Scholarships & financial assistance</h3>
            {!p.scholarships.length && (
              <p className="muted">No verified scholarship information yet.</p>
            )}
            {p.scholarships.map((s) => (
              <div className="check" key={s.id}>
                <div>
                  <h3 style={{ fontSize: 15 }}>{s.name}</h3>
                  <span className="tag UNKNOWN">
                    {s.fundingCategory === "GUARANTEED"
                      ? "Published guaranteed funding"
                      : "Competitive · not awarded"}
                  </span>
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
                </div>
              </div>
            ))}
          </section>
        </div>
        <aside>
          <section className="panel">
            <div className="eyebrow">The complete picture</div>
            <h3>Your financial scenarios</h3>
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
                {match.scenarios.map((s, i) => (
                  <div className="check" key={i}>
                    <div>
                      <strong className="tiny">{s.name}</strong>
                      <h2 style={{ fontSize: 25, margin: "10px 0 5px" }}>
                        {money(s.remaining, s.currency)}
                      </h2>
                      <p>Estimated remaining annual cost</p>
                      <span className={"tag " + s.affordable}>
                        {s.award === "COMPETITIVE"
                          ? "Potential funding · not awarded"
                          : s.award === "GUARANTEED"
                            ? "Guaranteed terms · verify conditions"
                            : "Without financial aid"}
                      </span>
                      <p>{s.reason}</p>
                      {s.fullRide && (
                        <span className="tag PASS">
                          Tuition + living + other costs covered
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                <p className="tiny muted" style={{ marginTop: 18 }}>
                  Awards are evaluated separately. Scholarships are never
                  automatically stacked. No currency conversion is assumed.
                </p>
              </>
            )}
          </section>
          <section className="panel">
            <h3>Annual cost breakdown</h3>
            {!p.costs.length && (
              <p className="muted">Costs are not verified.</p>
            )}
            {p.costs.map((c, i) => (
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
                <Source evidence={c.evidence} />
              </div>
            ))}
          </section>
          {match && (
            <section className="panel">
              <h3>Why this result?</h3>
              <span className={"tag " + match.status}>
                {statusLabel[match.status]}
              </span>
              {[...match.academic, ...match.application].map((c, i) => (
                <div className="check" key={i}>
                  <div>
                    <strong className="tiny">{c.label}</strong>
                    <p>{c.reason}</p>
                  </div>
                  <span
                    className={"tag " + c.state}
                    style={{ alignSelf: "start" }}
                  >
                    {c.state}
                  </span>
                </div>
              ))}
              <p className="tiny muted">
                Meeting minimum requirements does not predict admission.
              </p>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
