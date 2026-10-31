import type { Extraction } from "./extraction";
import { salvageExcerpt, widenExcerpt } from "./relevance";

// Strict, deterministic selection of the claims in an extraction candidate that are safe to publish
// as SOURCE_BACKED. Anything doubtful is left out: an unknown value is shown as unknown, never guessed.
const TYPED_TESTS = ["IELTS", "TOEFL", "PTE", "DUOLINGO"];
const NUMERIC_TYPES = [...TYPED_TESTS, "SAT", "ACT", "GRADE"];
const squash = (value: string) => value.replace(/\s+/g, " ").trim();
const DEADLINE_WORDS = /\b(deadline|closes?|closing|due|apply by|submit)\b/i;
const OPEN_WORDS = /\b(opens?|opening|starts?)\b/i;
const NOT_A_DEADLINE =
  /\b(announce\w*|notif\w*|results?)\b|\boffers? (are|will)\b/i;
const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

/**
 * The words that label a date inside a multi-row quote (a schedule table lists several dates side by side).
 * Pages print dates as "20261125", "25 Nov 2026" or "Nov 25, 2026"; labels sit before the compact form and
 * around the written forms. Returns null when the date cannot be located in the quote.
 */
export function labelWindow(quote: string, iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-");
  const compact = quote.indexOf(y + m + d);
  if (compact >= 0) return quote.slice(Math.max(0, compact - 90), compact);
  const mon = MONTHS[Number(m) - 1];
  const day = String(Number(d));
  const written = new RegExp(
    `(\\b${day}\\s*(?:st|nd|rd|th)?\\s+${mon}\\w*\\.?,?\\s+(?:Year\\s+)?${y}\\b|\\b${mon}\\w*\\.?\\s+${day}(?:st|nd|rd|th)?,?\\s+${y}\\b)`,
    "i",
  ).exec(quote);
  if (!written) return null;
  // Schedule tables put the label after the date; stop at the next date so a neighbouring row cannot leak in.
  const after = quote.slice(
    written.index + written[0].length,
    written.index + written[0].length + 110,
  );
  const next = after.search(
    /\b\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\.?\s+\d{1,2}\b|\b20\d{6}\b/i,
  );
  return next > 0 ? after.slice(0, next) : after;
}

export type Curated = { payload: Extraction; dropped: string[] };

const unique = <T>(list: T[], key: (item: T) => string) => [
  ...new Map(list.map((item) => [key(item), item])).values(),
];

export function curate(
  input: Extraction,
  pageTexts: Map<string, string>,
): Curated {
  const payload: Extraction = JSON.parse(JSON.stringify(input));
  const dropped: string[] = [];
  const drop = (kind: string, why: string) =>
    dropped.push(`${kind} left out: ${why}`);

  // Program: a duration is kept only if the cited page prints it.
  if (payload.program?.duration) {
    const page = squash(
      pageTexts.get(payload.program.sourceUrl ?? "") ??
        [...pageTexts.values()].join(" "),
    ).toLowerCase();
    if (!page.includes(squash(payload.program.duration).toLowerCase())) {
      drop("duration", `"${payload.program.duration}" not printed on the page`);
      payload.program.duration = null;
    }
  }

  // The program quote must be copied from its page; fall back to the longest verbatim run, then the title.
  if (payload.program) {
    const own = pageTexts.get(payload.program.sourceUrl ?? "");
    const haystack = squash(own ?? [...pageTexts.values()].join(" "));
    if (!haystack.includes(squash(payload.program.excerpt))) {
      const fixed =
        salvageExcerpt(payload.program.excerpt, haystack) ??
        (haystack.includes(payload.program.title)
          ? payload.program.title
          : null);
      if (fixed && fixed.length >= 12) payload.program.excerpt = fixed;
      else drop("program quote", "not found on the page");
    }
  }

  // Requirements: typed numeric rules need their number in their own quote; free-text rules need substance.
  const kept = payload.requirements.filter((r) => {
    const quote = squash(r.excerpt);
    // Types the matcher compares with a number must really be that score (an SAT section cut-off is not the total).
    if (
      (r.type === "SAT" && (r.minimum ?? 0) < 800) ||
      (["SAT", "ACT", "GRADE"].includes(r.type) && /english/i.test(r.label)) ||
      (r.type === "QUALIFICATION" && r.minimum !== null)
    ) {
      drop(`requirement ${r.type}`, "type does not match the quoted score");
      return false;
    }
    if (NUMERIC_TYPES.includes(r.type)) {
      if (r.minimum === null) {
        drop(`requirement ${r.type}`, "no numeric minimum");
        return false;
      }
      const number = String(r.minimum);
      if (!new RegExp(`(^|[^\\d.])${number}([^\\d]|$)`).test(quote)) {
        drop(`requirement ${r.type}`, `${number} not in its quote`);
        return false;
      }
      return true;
    }
    if (quote.length < 60) {
      drop(`requirement ${r.type}`, "quote too short to stand alone");
      return false;
    }
    if (/^(from|prior to|preferred|please|see)\b/i.test(quote)) {
      drop(`requirement ${r.type}`, "quote is a fragment");
      return false;
    }
    return true;
  });
  // The same test with different minimums is an unresolved conflict; publish neither.
  const conflicting = new Set<string>();
  for (const r of kept) {
    const rivals = kept.filter(
      (o) =>
        o.type === r.type &&
        TYPED_TESTS.includes(r.type) &&
        o.minimum !== r.minimum &&
        JSON.stringify(o.appliesToQualifications) ===
          JSON.stringify(r.appliesToQualifications),
    );
    if (rivals.length) conflicting.add(r.type);
  }
  payload.requirements = unique(
    kept.filter((r) => {
      if (!conflicting.has(r.type)) return true;
      drop(`requirement ${r.type}`, "conflicting minimums in the sources");
      return false;
    }),
    (r) =>
      [
        r.type,
        r.minimum,
        r.label,
        JSON.stringify(r.appliesToQualifications),
      ].join("|"),
  );

  // Intakes: a date needs a matching keyword in its own quote, and offer dates are never deadlines.
  payload.intakes = unique(
    payload.intakes.flatMap((i) => {
      const quote = squash(i.excerpt);
      const intake = { ...i };
      // JUPAS is the local-student route; this site serves international applicants.
      if (/^\s*jupas\s*$/i.test(i.route)) {
        drop(`intake ${i.academicYear}`, "JUPAS is the local-student route");
        return [];
      }
      const labels = (date: string) => labelWindow(quote, date) ?? quote;
      if (
        intake.deadline &&
        (!DEADLINE_WORDS.test(labels(intake.deadline)) ||
          NOT_A_DEADLINE.test(labels(intake.deadline)))
      ) {
        drop(
          `intake ${i.academicYear} deadline`,
          "quote does not label the date as a deadline",
        );
        intake.deadline = null;
      }
      if (intake.openDate && !OPEN_WORDS.test(labels(intake.openDate))) {
        drop(
          `intake ${i.academicYear} opening`,
          "quote does not label the date as an opening",
        );
        intake.openDate = null;
      }
      // The approval check wants every year of the intake inside its quote; widen the quote or drop the claim.
      const page = i.sourceUrl ? pageTexts.get(i.sourceUrl) : undefined;
      const yearsOf = () => [
        intake.academicYear,
        ...[intake.openDate, intake.deadline]
          .filter((v): v is string => v !== null)
          .map((v) => v.slice(0, 4)),
      ];
      if (
        !yearsOf().every((y) => new RegExp(`\\b${y}\\b`).test(intake.excerpt))
      ) {
        const widened = page && widenExcerpt(intake.excerpt, page, yearsOf());
        if (widened) intake.excerpt = widened;
        else {
          drop(
            `intake ${i.academicYear}`,
            "its years are not all inside the quote",
          );
          return [];
        }
      }
      return intake.deadline || intake.openDate ? [intake] : [];
    }),
    (i) => [i.academicYear, i.route, i.deadline, i.openDate].join("|"),
  );

  payload.costs = unique(payload.costs, (c) =>
    [c.tuition, c.living, c.other, c.currency, c.period].join("|"),
  );
  payload.documents = unique(payload.documents, (d) =>
    squash(d.name).toLowerCase(),
  );
  // Scholarship terms in these pages are vague and competitive; they stay "not verified" rather than half-described.
  if (payload.scholarships.length) {
    drop(
      "scholarships",
      `${payload.scholarships.length} left for manual review`,
    );
    payload.scholarships = [];
  }
  return { payload, dropped };
}
