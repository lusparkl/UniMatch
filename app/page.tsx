import Link from "next/link";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { getPrograms } from "@/lib/catalog";
import { demoMode } from "@/lib/config";
import { countries, defaultProfile } from "@/lib/domain";
import { annualCost } from "@/lib/matching";
export const dynamic = "force-dynamic";
const dims = [
  ["Academic requirements", "Evidence-led"],
  ["Application eligibility", "Deadline-aware"],
  ["Financial feasibility", "Tuition + living"],
];
const features = [
  [
    "Start with your story",
    "Tell us what you want to study, your qualifications and what you can spend. No account, no document uploads.",
  ],
  [
    "Find a meaningful fit",
    "Explore academic requirements, eligibility and financial feasibility as separate dimensions.",
  ],
  [
    "Check the evidence",
    "Follow official sources, understand funding conditions and see what still needs verification.",
  ],
];
export default async function Home() {
  const programs = await getPrograms();
  const intakeYear = defaultProfile.intake.slice(0, 4);
  // Fully checked: reviewed complete requirements and a complete trusted annual cost for the default intake.
  const checked = programs.filter(
    (p) => p.requirementsComplete && annualCost(p, intakeYear).total !== null,
  ).length;
  const latest = programs
    .map((p) => p.lastResearched)
    .filter((d) => d !== null)
    .sort()
    .at(-1);
  const stats = [
    [programs.length, "programmes"],
    [new Set(programs.map((p) => p.universityId)).size, "universities"],
    [checked, "fully checked for " + intakeYear],
  ] as const;
  return (
    <Shell demo={demoMode()}>
      <main className="home">
        <section className="hero wrap">
          <div>
            <div className="eyebrow">Big ambitions. Clearer possibilities.</div>
            <h1>
              Your next chapter. <em>Within reach.</em>
            </h1>
            <p className="hero-copy">
              Find out where you can really get in and afford to study in Asia,
              with every answer traced to an official source.
            </p>
            <div className="actions">
              <Button asChild>
                <Link href="/profile">
                  Find my universities <ArrowRight size={17} />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/results">Explore programs</Link>
              </Button>
            </div>
            <p className="hero-note">
              <LockKeyhole size={14} /> No account needed. Your profile stays in
              your browser.
            </p>
          </div>
          <div className="hero-art" aria-label="How matching works">
            <div className="eyebrow">A better-informed shortlist</div>
            <h2>Three questions, answered separately.</h2>
            {dims.map(([label, tag]) => (
              <div className="dim-row" key={label}>
                <span>{label}</span>
                <span>{tag}</span>
              </div>
            ))}
            <p>Official sources. Clear uncertainties.</p>
          </div>
        </section>
        <div className="band">
          <dl className="home-stats">
            {stats.map(([value, label]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value.toLocaleString("en")}</dd>
              </div>
            ))}
            {latest && (
              <div>
                <dt>sources last retrieved</dt>
                <dd>
                  {new Date(latest).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    timeZone: "UTC",
                  })}
                </dd>
              </div>
            )}
          </dl>
          <div className="destinations">
            <span className="eyebrow">Hong Kong and South Korea</span>
            {countries.map((c) => (
              <Link
                className="dest-pill"
                href={"/results?country=" + encodeURIComponent(c)}
                key={c}
              >
                {c}
              </Link>
            ))}
          </div>
        </div>
        <div className="section-head wrap">
          <div className="eyebrow">From overwhelmed to informed</div>
          <h2>A little clarity goes a long way.</h2>
        </div>
        <section className="feature-grid wrap">
          {features.map(([title, text], i) => (
            <article className="feature" key={title}>
              <span className="feature-num">0{i + 1}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </section>
        <section className="cta-band">
          <div>
            <h2>
              Meeting the published minimums is a starting point, not a
              prediction of admission.
            </h2>
            <p>
              We never estimate your chances. We show what is verified, what is
              not, and where to check the original source.
            </p>
            <Button asChild variant="light">
              <Link href="/results">Explore programs</Link>
            </Button>
          </div>
        </section>
      </main>
    </Shell>
  );
}
