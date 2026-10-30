import Link from "next/link";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { demoMode } from "@/lib/config";
const dims = [
  ["Academic requirements", "Evidence-led"],
  ["Application eligibility", "Deadline-aware"],
  ["Financial feasibility", "Tuition + living"],
];
const countries = [
  "United States",
  "Hong Kong",
  "Hungary",
  "Germany",
  "Singapore",
];
const features = [
  [
    "Start with your story",
    "Tell us what you want to study, your qualifications and what you can spend. No document uploads.",
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
export default function Home() {
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
              Find universities that fit your ambitions, your qualifications and
              your budget. Make your next move with evidence you can trust.
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
              <LockKeyhole size={14} /> No account needed. Your profile stays on
              your device.
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
          <div className="destinations">
            <span className="eyebrow">Five destinations</span>
            {countries.map((c) => (
              <Link className="dest-pill" href="/results" key={c}>
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
