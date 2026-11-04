import type { Verification } from "../domain";
import type { Extraction } from "./extraction";
import { labelWindow } from "./curate";
import { snapExcerpt } from "./relevance";
import { allowedUrl, type SourcePolicy } from "./security";

// Automated review (hackathon plan section 3). Every rule is re-checked here rather than trusted from the
// earlier pruning, and every result is SOURCE_BACKED at most: a person alone sets ADMIN_VERIFIED.
export const AUTO_REVIEWER = "claude-code-auto";

const squash = (value: string) => value.replace(/\s+/g, " ").trim();
const digits = (value: string) => value.replace(/[,\s ]/g, "");
const HEDGES =
  /\b(up to|maximum|minimum|may|might|not|no|except|unless|excluding|only|competitive|subject to)\b/gi;
const hedges = (text: string) =>
  [...new Set((text.match(HEDGES) ?? []).map((w) => w.toLowerCase()))]
    .sort()
    .join("|");

/**
 * Rule 1: the quotation is on the cited page. A near miss is repaired with `snapExcerpt` only when the
 * real passage carries exactly the same hedges and negations, so a repair can never firm up a claim.
 * Returns the quotation to publish, or null.
 */
export function verbatim(excerpt: string, page: string): string | null {
  if (squash(page).includes(squash(excerpt))) return excerpt;
  const snapped = snapExcerpt(excerpt, page);
  return snapped && hedges(snapped) === hedges(excerpt) ? snapped : null;
}

/** Rule 2 helpers: a number or date the claim states must be printed in its own quotation. */
export const numberQuoted = (value: number, quote: string) =>
  digits(quote).includes(String(value)) ||
  digits(quote).includes(value.toLocaleString("en").replace(/,/g, ""));
export const dateQuoted = (iso: string, quote: string) =>
  labelWindow(quote, iso) !== null;
const coverageQuoted = (coverage: number, quote: string) =>
  coverage === 1
    ? /\b(full|100\s?%|entire|whole)\b/i.test(quote)
    : new RegExp("\\b" + Math.round(coverage * 100) + "\\s?%").test(quote);

/** Rule 3: an HTTPS page on an approved host. */
export const approvedHttps = (url: string, sources: SourcePolicy[]) =>
  url.startsWith("https://") && allowedUrl(url, sources);

// --- Published facts: protection of human review and contradiction checks (rule 6) ---

export type PublishedRequirement = {
  id: string;
  type: string;
  label: string;
  minimum: number | null;
  scope: string;
  status: Verification;
};
export type PublishedIntake = {
  id: string;
  key: string;
  deadline: string | null;
  status: Verification;
};
export type PublishedCost = {
  id: string;
  key: string;
  tuition: number | null;
  living: number | null;
  other: number | null;
  status: Verification;
};
export type PublishedScholarship = {
  id: string;
  name: string;
  tuitionCoverage: number | null;
  stipendAmount: number | null;
  status: Verification;
};
export type Published = {
  requirements: PublishedRequirement[];
  intakes: PublishedIntake[];
  costs: PublishedCost[];
  scholarships: PublishedScholarship[];
  teachingLanguage: string | null;
  duration: string | null;
};
export const nothingPublished: Published = {
  requirements: [],
  intakes: [],
  costs: [],
  scholarships: [],
  teachingLanguage: null,
  duration: null,
};
const trustedStatus = (s: Verification) =>
  s === "ADMIN_VERIFIED" || s === "SOURCE_BACKED";
// The keys under which reviewCandidate replaces an earlier row; a human-reviewed row there is never replaced.
export const ruleScope = (r: {
  appliesToQualifications: string[];
  appliesToNationalities: string[];
}) =>
  [...r.appliesToQualifications].sort().join(",") +
  "|" +
  [...r.appliesToNationalities].sort().join(",");
const season = (term: string) =>
  /^\s*(autumn|fall|sept(ember)?)\b/i.test(term) ? "fall" : term.toLowerCase();
export const intakeKey = (i: {
  academicYear: string;
  term: string;
  route: string;
}) => i.academicYear + "|" + season(i.term) + "|" + i.route.toLowerCase();
export const costKey = (c: { currency: string; period: string }) =>
  c.currency + "|" + c.period;
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : null);

export type Conflict = { kind: string; id: string; reason: string };
export type Rejection = { kind: string; label: string; reason: string };
export type AutoReview = {
  payload: Extraction;
  approved: number;
  rejected: Rejection[];
  /** Earlier SOURCE_BACKED rows a new official quotation contradicts: set CONFLICTING, new claim withheld. */
  conflicts: Conflict[];
  notes: string[];
};

/**
 * Applies rules 1–6 of plan section 3.1 to a (curated) candidate. Claims that fail any rule are left out;
 * the rest keep a verbatim quotation. `issues` are the candidate's stored issues (for `Pruned:` records).
 */
export function autoReview(
  input: Extraction,
  context: {
    pages: Map<string, string>;
    fallbackUrl: string;
    sources: SourcePolicy[];
    issues: string[];
    published: Published;
  },
): AutoReview {
  const payload: Extraction = structuredClone(input);
  const rejected: Rejection[] = [];
  const conflicts: Conflict[] = [];
  const notes: string[] = [];
  const pruned = context.issues
    .filter((i) => i.startsWith("Pruned:"))
    .map((i) => squash(i).toLowerCase());
  const { published } = context;

  // Rules 1, 3 and 5 for one quoted claim; rule 2 runs with the claim's own values.
  function check(
    kind: string,
    label: string,
    claim: { excerpt: string; sourceUrl: string | null },
    values: (quote: string) => string | null,
  ): boolean {
    const url = claim.sourceUrl ?? context.fallbackUrl;
    const reject = (reason: string) => {
      rejected.push({ kind, label, reason });
      return false;
    };
    if (!approvedHttps(url, context.sources))
      return reject("source is not an approved HTTPS page: " + url);
    const page = context.pages.get(url);
    if (page === undefined) return reject("cited page is not stored: " + url);
    const quote = verbatim(claim.excerpt, page);
    if (!quote) return reject("quotation is not verbatim on " + url);
    const head = squash(quote).toLowerCase().slice(0, 60);
    if (pruned.some((p) => p.includes(head)))
      return reject("a Pruned: issue marks it unsupported");
    const missing = values(quote);
    if (missing) return reject(missing + " is not in its quotation");
    claim.excerpt = quote;
    claim.sourceUrl = url;
    return true;
  }
  const num = (name: string, value: number | null, quote: string) =>
    value !== null && !numberQuoted(value, quote) ? name + " " + value : null;
  const date = (name: string, value: string | null, quote: string) =>
    value && !dateQuoted(value, quote) ? name + " " + value.slice(0, 10) : null;

  // The programme claim anchors every other row; without it nothing in the candidate can be published.
  if (
    payload.program &&
    (!approvedHttps(payload.program.officialUrl, context.sources) ||
      !check("program", payload.program.title, payload.program, () => null))
  ) {
    rejected.push({
      kind: "candidate",
      label: payload.program.title,
      reason: "programme claim failed; nothing in this candidate is published",
    });
    return {
      payload: {
        ...payload,
        requirements: [],
        intakes: [],
        costs: [],
        documents: [],
        scholarships: [],
      },
      approved: 0,
      rejected,
      conflicts,
      notes,
    };
  }
  if (payload.academicYear)
    for (const i of payload.intakes)
      if (i.academicYear !== payload.academicYear)
        notes.push(
          `intake ${i.academicYear} ${i.term}: evidence is for the ${payload.academicYear} cycle (recorded, rule 4)`,
        );

  payload.requirements = payload.requirements.filter((r) => {
    if (!check("requirement", r.label, r, (q) => num("minimum", r.minimum, q)))
      return false;
    const scope = ruleScope(r);
    const human = published.requirements.find(
      (p) =>
        p.status === "ADMIN_VERIFIED" &&
        p.type === r.type &&
        (p.label === r.label || p.scope === scope),
    );
    if (human) {
      rejected.push({
        kind: "requirement",
        label: r.label,
        reason: "a human-reviewed rule already covers it",
      });
      return false;
    }
    const clash = published.requirements.filter(
      (p) =>
        trustedStatus(p.status) &&
        p.type === r.type &&
        p.scope === scope &&
        p.minimum !== null &&
        r.minimum !== null &&
        p.minimum !== r.minimum,
    );
    for (const p of clash)
      conflicts.push({
        kind: "requirement",
        id: p.id,
        reason: `${r.type} minimum ${p.minimum} published, ${r.minimum} now quoted`,
      });
    return !clash.length;
  });

  payload.intakes = payload.intakes.filter((i) => {
    const label = `${i.academicYear} ${i.term} ${i.route}`;
    if (
      !check(
        "intake",
        label,
        i,
        (q) =>
          (new RegExp("\\b" + i.academicYear + "\\b").test(q)
            ? null
            : "academic year " + i.academicYear) ??
          date("deadline", i.deadline, q) ??
          date("opening", i.openDate, q),
      )
    )
      return false;
    const same = published.intakes.filter((p) => p.key === intakeKey(i));
    if (same.some((p) => p.status === "ADMIN_VERIFIED")) {
      rejected.push({
        kind: "intake",
        label,
        reason: "a human-reviewed intake already covers it",
      });
      return false;
    }
    const clash = same.filter(
      (p) =>
        trustedStatus(p.status) &&
        p.deadline &&
        i.deadline &&
        day(p.deadline) !== day(i.deadline),
    );
    for (const p of clash)
      conflicts.push({
        kind: "intake",
        id: p.id,
        reason: `deadline ${day(p.deadline)} published, ${day(i.deadline)} now quoted`,
      });
    return !clash.length;
  });

  payload.costs = payload.costs.filter((c) => {
    const label = `${c.currency} ${c.period}`;
    if (
      !check(
        "cost",
        label,
        c,
        (q) =>
          num("tuition", c.tuition, q) ??
          num("living", c.living, q) ??
          num("other", c.other, q),
      )
    )
      return false;
    const same = published.costs.filter((p) => p.key === costKey(c));
    // reviewCandidate replaces every cost row of one currency and period.
    if (same.some((p) => p.status === "ADMIN_VERIFIED")) {
      rejected.push({
        kind: "cost",
        label,
        reason: "a human-reviewed cost row already covers it",
      });
      return false;
    }
    const clash = same.filter(
      (p) =>
        trustedStatus(p.status) &&
        (["tuition", "living", "other"] as const).some(
          (k) => p[k] !== null && c[k] !== null && p[k] !== c[k],
        ),
    );
    for (const p of clash)
      conflicts.push({
        kind: "cost",
        id: p.id,
        reason: `published tuition ${p.tuition} living ${p.living} other ${p.other}; quoted ${c.tuition}/${c.living}/${c.other}`,
      });
    return !clash.length;
  });

  payload.documents = payload.documents.filter((d) =>
    check("document", d.name, d, () => null),
  );

  payload.scholarships = payload.scholarships.filter((s) => {
    if (!approvedHttps(s.officialUrl, context.sources)) {
      rejected.push({
        kind: "scholarship",
        label: s.name,
        reason: "official URL is not an approved HTTPS page: " + s.officialUrl,
      });
      return false;
    }
    if (
      !check(
        "scholarship",
        s.name,
        s,
        (q) =>
          num("stipend", s.stipendAmount, q) ??
          (s.tuitionCoverage !== null && !coverageQuoted(s.tuitionCoverage, q)
            ? "coverage " + s.tuitionCoverage
            : null) ??
          date("deadline", s.deadline, q),
      )
    )
      return false;
    s.rules = s.rules.filter((r) =>
      check("scholarship rule", s.name + ": " + r.label, r, (q) =>
        num("minimum", r.minimum, q),
      ),
    );
    const same = published.scholarships.filter(
      (p) => p.name.toLowerCase() === s.name.toLowerCase(),
    );
    if (same.some((p) => p.status === "ADMIN_VERIFIED")) {
      rejected.push({
        kind: "scholarship",
        label: s.name,
        reason: "a human-reviewed scholarship already covers it",
      });
      return false;
    }
    const clash = same.filter(
      (p) =>
        trustedStatus(p.status) &&
        ((p.tuitionCoverage !== null &&
          s.tuitionCoverage !== null &&
          p.tuitionCoverage !== s.tuitionCoverage) ||
          (p.stipendAmount !== null &&
            s.stipendAmount !== null &&
            p.stipendAmount !== s.stipendAmount)),
    );
    for (const p of clash)
      conflicts.push({
        kind: "scholarship",
        id: p.id,
        reason: `${s.name}: published coverage ${p.tuitionCoverage} stipend ${p.stipendAmount}; quoted ${s.tuitionCoverage} / ${s.stipendAmount}`,
      });
    return !clash.length;
  });

  // Program fields only fill gaps; a stored value (possibly human-reviewed) is never overwritten.
  if (payload.program) {
    if (published.teachingLanguage) payload.program.teachingLanguage = null;
    if (published.duration) payload.program.duration = null;
  }

  const approved =
    payload.requirements.length +
    payload.intakes.length +
    payload.costs.length +
    payload.documents.length +
    payload.scholarships.length;
  return { payload, approved, rejected, conflicts, notes };
}

// --- requirementsComplete checklist (plan section 3.2) ---

const ENGLISH = ["IELTS", "TOEFL", "DUOLINGO", "PTE"];
const NOT_REQUIRED =
  /english[^.]{0,120}\b(not required|not necessary|exempt(ed)?)\b|\b(exempt(ed)?|waived?)\b[^.]{0,80}english/i;
export type CompletenessRule = {
  type: string;
  label: string;
  minimum: number | null;
  allowed: string[];
  mandatory: boolean;
  appliesToQualifications: string[];
  appliesToNationalities: string[];
  excerpt: string;
  status: Verification;
};
export type CitedPage = { url: string; text: string | null };

/**
 * Whether a programme's requirement set may be marked complete. `requirementsComplete` turns UNKNOWN into a
 * possible PASS, so every item must hold. The qualification item requires an allow-list rule that applies to
 * everyone: qualifications it does not list stay UNKNOWN ("equivalency not verified"), so a route encoded for
 * IB students can never pass an A-level student.
 */
export function completeness(input: {
  degreeLevel: string | null;
  rules: CompletenessRule[];
  statuses: Verification[];
  pages: CitedPage[];
  byteCap: number;
}): { complete: boolean; missing: string[] } {
  const missing: string[] = [];
  const rules = input.rules.filter((r) => trustedStatus(r.status));
  if (!input.degreeLevel) missing.push("degree level unknown");
  const english =
    rules.some(
      (r) => r.mandatory && ENGLISH.includes(r.type) && r.minimum !== null,
    ) || rules.some((r) => NOT_REQUIRED.test(r.excerpt));
  if (!english)
    missing.push(
      "no English test rule with a minimum, nor an explicit exemption",
    );
  const route = rules.some(
    (r) =>
      r.mandatory &&
      r.type === "QUALIFICATION" &&
      r.allowed.length > 0 &&
      !r.appliesToQualifications.length &&
      !r.appliesToNationalities.length,
  );
  if (!route)
    missing.push(
      "no accepted-qualification list that applies to every applicant",
    );
  if (!input.pages.length) missing.push("no cited page");
  for (const p of input.pages) {
    if (p.text === null) missing.push("cited page not stored: " + p.url);
    else if (p.text.trim().length < 400)
      missing.push(
        "cited page is nearly empty (script shell or image): " + p.url,
      );
    else if (Buffer.byteLength(p.text) >= input.byteCap * 0.95)
      missing.push("cited page may be truncated at the download cap: " + p.url);
  }
  const bad = input.statuses.filter(
    (s) => s === "CONFLICTING" || s === "OUTDATED",
  );
  if (bad.length) missing.push(bad.length + " conflicting or outdated rows");
  return { complete: !missing.length, missing };
}
