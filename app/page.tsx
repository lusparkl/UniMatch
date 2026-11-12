import Link from "next/link";
import { Check, CircleHelp, LockKeyhole, PlaneTakeoff } from "lucide-react";
import { Shell } from "@/components/shell";
import { PersonaCards } from "@/components/persona-buttons";
import { Button } from "@/components/ui/button";
import { getPrograms } from "@/lib/catalog";
import { demoMode } from "@/lib/config";
import { countries, defaultProfile } from "@/lib/domain";
import { sameTerm, trusted } from "@/lib/matching";
import {
  deadlineParts,
  nativeCity,
  nativeCountry,
  shortUniversity,
} from "@/lib/places";
export const dynamic = "force-dynamic";
const asiaRows = [
  [
    "Admission pages written for local students",
    "International routes and rounds, found for you",
  ],
  [
    "Scholarships scattered across separate pages",
    "Awards judged one at a time, with their conditions",
  ],
  [
    "Deadlines in a time zone that is not yours",
    "Every deadline in local time, with the days left",
  ],
  [
    "Costs in a currency you do not use",
    "Tuition and living costs converted to your own",
  ],
];
const cityOrder = [
  "Hong Kong",
  "Seoul",
  "Daejeon",
  "Pohang",
  "Gwangju",
  "Ulsan",
];
const destinations: Record<
  string,
  { currency: string; points: string[]; cta: string }
> = {
  "Hong Kong": {
    currency: "HKD",
    points: [
      "Priority and regular rounds for international qualifications, each with its own deadline",
      "Scholarships for non-local students, such as PolyU’s Cultural Ambassador Scholarship (up to HK$60,000 a year)",
      "Tuition and living costs in HKD, converted to your own currency",
    ],
    cta: "Explore Hong Kong",
  },
  "South Korea": {
    currency: "KRW",
    points: [
      "Guaranteed tuition scholarships listed at KAIST, GIST and POSTECH, with conditions to keep them",
      "POSTECH lists a living allowance of KRW 500,000 a month for international undergraduates",
      "Early and regular international rounds, with Fall and Spring intakes",
    ],
    cta: "Explore South Korea",
  },
};
const features = [
  [
    "International routes, not local ones",
    "We read each university’s international admission pages, so you see the route, round and deadline that apply to you as a non-local applicant.",
  ],
  [
    "Scholarships open to you",
    "Funding is read from official sources and judged one award at a time, never stacked. You see what is guaranteed, what is competitive and what is unknown.",
  ],
  [
    "Deadlines in local time",
    "Every deadline is shown in the university’s own time zone with the days left, so a round never closes before you noticed it.",
  ],
];
const dims = [
  ["Academic requirements", "Evidence-led"],
  ["Application eligibility", "Deadline-aware"],
  ["Financial feasibility", "Tuition + living"],
];
const trustLegend = [
  ["PASS", "Human-reviewed", "Checked by the project owner."],
  ["INFO", "Auto-verified", "Quoted word for word from an official page."],
  [
    "UNKNOWN",
    "Needs verification",
    "Missing, stale or conflicting. Shown as unknown.",
  ],
];
export default async function Home() {
  const programs = (await getPrograms()).filter(
    (p) => p.degreeLevel === "BACHELOR",
  );
  const now = new Date();
  const [year, term] = defaultProfile.intake.split("-");
  const unis = (country?: string) =>
    new Set(
      programs
        .filter((p) => !country || p.country === country)
        .map((p) => p.universityId),
    ).size;
  const stats = [
    [unis(), "universities"],
    [programs.length, "programs"],
    [countries.length, "destinations"],
  ] as const;
  // The next international rounds for the default intake; programmes sharing a round show it once.
  const seen = new Set<string>();
  const board = programs
    .flatMap((p) =>
      p.intakes
        .filter(
          (i) =>
            trusted(i.status) &&
            i.deadline &&
            i.timezone &&
            i.academicYear === year &&
            sameTerm(i.term, term) &&
            new Date(i.deadline) >= now,
        )
        .map((i) => ({ p, i })),
    )
    .sort((a, b) => a.i.deadline!.localeCompare(b.i.deadline!))
    .filter(({ p, i }) => {
      const key = p.universityId + i.route + i.deadline;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5)
    .map(({ p, i }) => ({
      key: p.universityId + i.route + i.deadline,
      native: nativeCity(p.city),
      uni: shortUniversity(p.university),
      route: i.route.length > 46 ? i.route.split(":")[0] : i.route,
      when: deadlineParts(i.deadline!, i.timezone, now),
    }));
  const cities = cityOrder.filter((c) => programs.some((p) => p.city === c));
  return (
    <Shell demo={demoMode()}>
      <main className="home">
        <section className="hero-band">
          <div aria-hidden="true" className="outline-word">
            ASIA
          </div>
          <div className="hero wrap">
            <div>
              <div className="eyebrow">Asia · For international applicants</div>
              <h1>
                Asia’s universities. <em>Open to you.</em>
              </h1>
              <p className="hero-copy">
                UniMatch is built only for students applying to universities in
                Asia from another country. See where you meet the published
                requirements, what it will really cost and which scholarships
                are open to international applicants. Every answer traces back
                to an official source.
              </p>
              <div className="actions">
                <Button asChild size="lg">
                  <Link href="/profile">Find My Universities</Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/results">Explore Programs</Link>
                </Button>
              </div>
              <p className="hero-note">
                <LockKeyhole size={14} aria-hidden /> No account needed. Your
                profile stays in your browser.
              </p>
              <dl className="hero-stats">
                {stats.map(([value, label]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd className="serif">{value.toLocaleString("en")}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="hero-art">
              <div className="hero-art-eyebrow">
                <PlaneTakeoff size={14} aria-hidden /> Closing soon ·{" "}
                {year + " " + term}
              </div>
              <h2>International rounds, in local time.</h2>
              {!board.length && (
                <p className="board-empty">
                  No verified round is open for this intake right now.
                </p>
              )}
              {board.map((b) => (
                <div className="board-row" key={b.key}>
                  <div>
                    <div className="board-uni">
                      {b.native && (
                        <span
                          className="cjk"
                          lang={b.native === "香港" ? "zh-HK" : "ko"}
                        >
                          {b.native}
                        </span>
                      )}{" "}
                      {b.uni}
                    </div>
                    <div className="board-route">{b.route}</div>
                  </div>
                  <div className="board-when">
                    <span>{b.when.days}</span>
                    <div>{b.when.short + " · " + b.when.time}</div>
                  </div>
                </div>
              ))}
              <div className="board-foot">
                <p>Each time is in the university’s own time zone.</p>
                <Button asChild size="sm" variant="light">
                  <Link href="/deadlines">All Deadlines</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section className="asia-band">
          <div className="wrap-inner">
            <div className="split asia-head">
              <div>
                <div className="eyebrow">Why only Asia</div>
                <h2 className="display">
                  Asia’s universities welcome the world.{" "}
                  <em>We make the way in clear.</em>
                </h2>
              </div>
              <p className="lede">
                UniMatch covers one region and nothing else, so we can read
                every international admission page in depth. Our goal is simple:
                give more foreign students a real, informed chance to enter an
                Asian university.
              </p>
            </div>
            <table className="asia-table">
              <thead>
                <tr>
                  <th scope="col">Applying from abroad, usually</th>
                  <th scope="col">With UniMatch</th>
                </tr>
              </thead>
              <tbody>
                {asiaRows.map(([before, after]) => (
                  <tr key={before}>
                    <td>
                      <CircleHelp size={18} aria-hidden />
                      <span>{before}</span>
                    </td>
                    <td>
                      <Check size={18} aria-hidden />
                      <span>{after}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="cities">
              <div className="lbl">Cities covered today</div>
              <ul>
                {cities.map((c) => {
                  const p = programs.find((x) => x.city === c)!;
                  return (
                    <li key={c}>
                      <span
                        className="cjk"
                        lang={c === "Hong Kong" ? "zh-HK" : "ko"}
                      >
                        {nativeCity(c)}
                      </span>
                      <strong>{c}</strong>
                      <span>{p.country}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </section>

        <section className="subtle-band">
          <div className="wrap-inner">
            <div className="eyebrow">Where in Asia</div>
            <h2 className="section-title">
              Start with the place, then the program.
            </h2>
            <p className="section-lede">
              Every program and university in the catalog is in Asia. You see
              all destinations at once, so there is nothing to choose before you
              start.
            </p>
            <div className="dest-grid">
              {countries.map((c) => {
                const d = destinations[c];
                return (
                  <article className="card lift dest-card" key={c}>
                    <div className="dest-top">
                      <div>
                        <div
                          className="cjk dest-native"
                          lang={c === "Hong Kong" ? "zh-HK" : "ko"}
                        >
                          {nativeCountry(c)}
                        </div>
                        <h3>{c}</h3>
                      </div>
                      <span className="chip-outline">{d?.currency}</span>
                    </div>
                    <div className="dest-counts">
                      <div>
                        <div className="serif">{unis(c)}</div>
                        <div>universities</div>
                      </div>
                      <div>
                        <div className="serif">
                          {programs.filter((p) => p.country === c).length}
                        </div>
                        <div>programs</div>
                      </div>
                    </div>
                    <ul className="check-list">
                      {d?.points.map((pt) => (
                        <li key={pt}>
                          <Check size={16} aria-hidden />
                          <span>{pt}</span>
                        </li>
                      ))}
                    </ul>
                    <div>
                      <Button asChild size="sm" variant="outline">
                        <Link
                          href={"/results?country=" + encodeURIComponent(c)}
                        >
                          {d?.cta ?? "Explore " + c}
                        </Link>
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="wrap features">
          <div className="eyebrow">Built for international applicants</div>
          <h2 className="section-title">
            The rules that apply to you, not to locals.
          </h2>
          <div className="feature-grid">
            {features.map(([title, text], i) => (
              <article className="feature" key={title}>
                <span className="feature-num">0{i + 1}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="subtle-band">
          <div className="wrap-inner">
            <div className="eyebrow">Try a sample student</div>
            <h2 className="section-title">
              See the whole picture in a minute.
            </h2>
            <p className="section-lede">
              Pick a typical applicant. UniMatch loads their profile and opens
              the matches. These are examples, not real people.
            </p>
            <PersonaCards />
          </div>
        </section>

        <section className="cta-band">
          <div className="wrap-inner split">
            <div className="cta-copy">
              <div className="cta-eyebrow">Honest by design</div>
              <h2>
                Meeting the published minimums is a starting point, not a
                prediction.
              </h2>
              <p>
                We never estimate your chances. Three questions are answered
                separately, and anything we cannot confirm stays marked as
                unknown.
              </p>
              <Button asChild variant="light">
                <Link href="/results">Explore Programs</Link>
              </Button>
            </div>
            <div>
              {dims.map(([label, tag]) => (
                <div className="dim-row" key={label}>
                  <span>{label}</span>
                  <span>{tag}</span>
                </div>
              ))}
              <ul className="trust-legend">
                {trustLegend.map(([tone, label, body]) => (
                  <li key={label}>
                    <span className={"mini " + tone}>{label}</span>
                    <span>{body}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </main>
    </Shell>
  );
}
