import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Check,
  CircleCheck,
  Globe2,
  GraduationCap,
  Search,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { demoMode } from "@/lib/config";
export default function Home() {
  return (
    <Shell demo={demoMode()}>
      <main className="container">
        <section className="hero">
          <div>
            <div className="eyebrow">Big ambitions. Clearer possibilities.</div>
            <h1>
              Your next chapter.
              <br />
              <em>Within reach.</em>
            </h1>
            <p className="hero-copy">
              Find universities that fit your ambitions, your qualifications,
              and your budget. Make your next move with evidence you can trust.
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
            <p className="tiny muted" style={{ marginTop: 18 }}>
              No account needed. Your profile stays on your device.
            </p>
          </div>
          <div className="hero-art" aria-label="How matching works">
            <div className="orbit" />
            <div className="eyebrow">A better-informed shortlist</div>
            <div className="mini-card">
              <div className="mini-header">
                <span className="uni-icon">
                  <GraduationCap />
                </span>
                <div>
                  <h3 style={{ marginBottom: 5 }}>Your ambition, in focus</h3>
                  <span className="tiny muted">
                    Computer Science · Study abroad
                  </span>
                </div>
              </div>
              <div className="rule-line">
                <span>Academic requirements</span>
                <span className="tag PASS">
                  <Check size={11} /> Evidence-led
                </span>
              </div>
              <div className="rule-line">
                <span>Tuition + living costs</span>
                <Wallet size={16} />
              </div>
            </div>
            <div className="mini-card">
              <div className="mini-header">
                <ShieldCheck color="#578265" />
                <div>
                  <h3 style={{ fontSize: 14, marginBottom: 4 }}>
                    Know what’s verified
                  </h3>
                  <span className="tiny muted">
                    Official sources. Clear uncertainties.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
        <div className="destinations">
          <span className="eyebrow" style={{ margin: 0 }}>
            Five destinations. More possibilities.
          </span>
          <span>🇺🇸 United States</span>
          <span>🇭🇰 Hong Kong</span>
          <span>🇭🇺 Hungary</span>
          <span>🇩🇪 Germany</span>
          <span>🇸🇬 Singapore</span>
        </div>
        <div className="section-head">
          <div>
            <div className="eyebrow">From overwhelmed to informed</div>
            <h2 style={{ marginBottom: 0 }}>
              A little clarity goes a long way.
            </h2>
          </div>
          <span className="tiny muted">Built for international students</span>
        </div>
        <section className="feature-grid">
          <article className="feature">
            <BookOpen size={26} />
            <h3>Start with your story</h3>
            <p>
              Tell us what you want to study, your qualifications, and what you
              can spend. No document uploads.
            </p>
          </article>
          <article className="feature">
            <Search size={26} />
            <h3>Find a meaningful fit</h3>
            <p>
              Explore academic requirements, application eligibility, and
              financial feasibility as separate dimensions.
            </p>
          </article>
          <article className="feature">
            <Globe2 size={26} />
            <h3>Check the evidence</h3>
            <p>
              Follow official sources, understand funding conditions, and see
              where information still needs verification.
            </p>
          </article>
        </section>
        <div
          className="notice"
          style={{ marginTop: 28, display: "flex", gap: 10 }}
        >
          <CircleCheck size={19} style={{ flexShrink: 0 }} /> Meeting published
          minimum requirements is a starting point, not a prediction of
          admission. We make that distinction clear.
        </div>
      </main>
    </Shell>
  );
}
