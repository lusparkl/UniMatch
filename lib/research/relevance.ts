// Free, deterministic gates that decide which pages deserve a crawl slot or a model call.
const NOISE_URL =
  /privacy|gdpr|cookie|contact|events?\b|news|press|people|staff|faculty-members|alumni|our-?graduates|student-stories|ambassador|publication|life-at|hear-from|reputation|testimonial|careers|vacanc|research-postgraduate|login|sitemap|\.(jpg|jpeg|png|gif|zip|docx?|xlsx?|pptx?)(\?|$)/i;
const NOISE_TEXT = /privacy|events|news|contact|alumni|stories|ambassador/i;
const LINK_SIGNAL =
  /admission|apply|application|requirement|entry|tuition|fee|scholarship|bursar|deadline|programme|program|major|degree|international|non-?jupas|qualification|curriculum|financial|funding/i;
const STRONG_LINK =
  /admission|requirement|entry|tuition|fee|scholarship|deadline|international|qualification/i;

export const noisyUrl = (url: string) => NOISE_URL.test(url);

/** Higher is better; 0 means do not crawl. */
export function linkScore(url: string, anchor: string) {
  if (noisyUrl(url)) return 0;
  const text = url + " " + anchor;
  let score = 0;
  if (LINK_SIGNAL.test(text)) score += 1;
  if (STRONG_LINK.test(text)) score += 2;
  if (NOISE_TEXT.test(anchor)) score -= 1;
  return Math.max(0, score);
}

const SIGNALS: Record<string, RegExp> = {
  money:
    /(HK\$|HKD|US\$|USD|EUR|€|£|RMB|CNY|¥|S\$|SGD)\s?\d[\d,]{2,}|\d[\d,]{3,}\s?(HKD|USD|EUR|RMB|SGD)/i,
  deadline:
    /deadline|截止|apply by|closing date|application period|application opens|submit.{0,30}by/i,
  year: /\b20[2-3]\d\b/,
  // A test name must sit next to a threshold; a bare "HKDSE students" is not a requirement.
  test: /(?:IELTS|TOEFL|Duolingo|PTE|GPA|SAT|ACT|HKDSE|DSE|A-?[Ll]evels?|IB|JEE|雅思|托福)[^\n.]{0,30}?\b\d{1,3}(?:\.\d+)?\b|[Mm]inimum[^\n.]{0,40}(?:score|grade|level|GPA)[^\n.]{0,15}\b\d/,
  funding: /tuition|scholarship|bursary|stipend|financial aid|fee waiver/i,
  admission:
    /(admission|entry requirement|eligib|applicants?|招生|录取|申请|入学|截止|学费|奖学金)[\s\S]*?(admission|entry requirement|eligib|applicants?|招生|录取|申请|入学|截止|学费|奖学金)/i,
  degree: /\b(BEng|BSc|BA|BBA|BEcon|MSc|MEng|MPhil|MBA|MA|Bachelor|Master)\b/,
};

export type PageAssessment = {
  worthExtracting: boolean;
  reason: string;
  signals: string[];
};

/** Skip pages that cannot contain extractable admission, cost, intake or funding facts. */
export function assessPage(url: string, text: string): PageAssessment {
  if (noisyUrl(url))
    return { worthExtracting: false, reason: "noise URL", signals: [] };
  const signals = Object.entries(SIGNALS)
    .filter(([, re]) => re.test(text))
    .map(([name]) => name);
  // Factual pages combine a topic (money/test/funding/degree) with a date or amount.
  // Wording like "admission" or "tuition" alone is page chrome; a hard fact is an amount, a test
  // threshold or a deadline.
  const factual = signals.filter((s) =>
    ["money", "test", "deadline"].includes(s),
  );
  // Admission, fee and scholarship hub pages can state rules in prose without a bare number.
  const hub =
    STRONG_LINK.test(url) &&
    text.length >= 1000 &&
    signals.some((s) => s === "admission" || s === "funding");
  if (text.length < 100 || (factual.length < 1 && !hub))
    return {
      worthExtracting: false,
      reason:
        "no extractable facts (signals: " + (signals.join(",") || "none") + ")",
      signals,
    };
  return { worthExtracting: true, reason: "ok", signals };
}

const WINDOW_LINE = new RegExp(
  Object.values(SIGNALS)
    .map((re) => re.source)
    .join("|") +
    "|admission|require|eligib|apply|application|fee|programme|major",
  "i",
);

/** Contiguous windows around signal lines, ranked so dense regions survive the size cap. */
export function selectWindows(text: string, cap = 18000) {
  const lines = text.split("\n");
  const hit = lines.map((l) => WINDOW_LINE.test(l));
  const selected = new Set<number>();
  hit.forEach((h, i) => {
    if (h)
      for (
        let j = Math.max(0, i - 1);
        j <= Math.min(lines.length - 1, i + 2);
        j++
      )
        selected.add(j);
  });
  const ordered = [...selected].sort((a, b) => a - b).map((i) => lines[i]);
  const joined = ordered.join("\n");
  if (!joined) return text.slice(0, cap);
  if (joined.length <= cap) return joined;
  // Over the cap: keep the densest lines instead of simply the page's first lines.
  const weight = (line: string) =>
    Object.values(SIGNALS).filter((re) => re.test(line)).length;
  const keep = new Set<number>();
  let size = 0;
  [...selected]
    .map((i) => ({ i, w: weight(lines[i]) }))
    .sort((a, b) => b.w - a.w || a.i - b.i)
    .forEach(({ i }) => {
      if (size + lines[i].length + 1 <= cap) {
        keep.add(i);
        size += lines[i].length + 1;
      }
    });
  return [...keep]
    .sort((a, b) => a - b)
    .map((i) => lines[i])
    .join("\n");
}

const GENERIC_TITLE =
  /^(engineering|undergraduate|postgraduate|graduate|local|international|applicants?|admissions?|programmes?|programs?|courses?|degrees?|majors?)\b.*\b(program(me)?s?|applicants?|admissions?|qualifications?|students?)$|applicants? with|^(local|non-local|international)\b/i;

/** Issues for a program candidate whose title is not a concrete degree or is absent from the source. */
export function programTitleIssues(title: string, sourceText: string) {
  const issues: string[] = [];
  if (GENERIC_TITLE.test(title.trim()))
    issues.push(
      "Program title looks like an admission category, not a degree: " + title,
    );
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  if (!norm(sourceText).includes(norm(title)))
    issues.push(
      "Program title does not appear verbatim in the source: " + title,
    );
  return issues;
}

const DEGREE_WORDS: Record<string, string> = {
  beng: "engineering",
  meng: "engineering",
  bsc: "science",
  msc: "science",
  ba: "arts",
  ma: "arts",
  bba: "business administration",
  bacc: "",
};
const FILLER = new Set(
  "bachelor master of in the and with honours hons degree programme program scheme".split(
    " ",
  ),
);
const programTokens = (title: string) =>
  new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .flatMap((w) => (w in DEGREE_WORDS ? DEGREE_WORDS[w].split(" ") : [w]))
      .filter((w) => w && !FILLER.has(w)),
  );
/** True when two titles name the same degree despite abbreviation and word-order differences. */
export function sameProgram(a: string, b: string) {
  const x = programTokens(a);
  const y = programTokens(b);
  return x.size > 0 && x.size === y.size && [...x].every((w) => y.has(w));
}

/** Registry sources are "registry" (every program) or "registry:<program title>" (one program). */
export const isRegistry = (purpose: string) =>
  purpose === "registry" || purpose.startsWith("registry:");
export const registryScope = (purpose: string) =>
  purpose.startsWith("registry:") ? purpose.slice("registry:".length) : null;

const INTERNATIONAL_URL =
  /international|non-?local|non-?jupas|overseas|other-?qualifications|qualification/i;

/** Ranks stored pages by how likely they carry facts for one registered program. */
export function programDocScore(
  program: { title: string; officialUrl: string },
  doc: { url: string; title: string; text: string },
  registryUrls: Set<string> = new Set(),
  ownUrls: Set<string> = new Set(),
) {
  if (doc.url === program.officialUrl) return 100;
  // Pages registered for this program alone (for example its subject requirements).
  if (ownUrls.has(doc.url)) return 80;
  // Administrator-registered institution pages (international admission, fees, scholarships).
  // Filtered requirement pages rank below whole-institution pages (fees, scholarships) when space runs out.
  if (registryUrls.has(doc.url)) return doc.url.includes("?") ? 40 : 50;
  if (noisyUrl(doc.url)) return 0;
  const assessment = assessPage(doc.url, doc.text);
  const programWords = [...programTokens(program.title)].filter(
    (w) => w.length > 3 && w !== "engineering" && w !== "science",
  );
  const head = (
    doc.url +
    " " +
    doc.title +
    " " +
    doc.text.slice(0, 800)
  ).toLowerCase();
  const named = programWords.filter((w) => head.includes(w)).length;
  let score = 0;
  if (assessment.worthExtracting) score += 4;
  if (STRONG_LINK.test(doc.url)) score += 2;
  if (INTERNATIONAL_URL.test(doc.url)) score += 3;
  if (programWords.length && named === programWords.length) score += 3;
  else if (named > 0) score += 1;
  return assessment.worthExtracting || named > 0 ? score : 0;
}

const squashSpace = (value: string) =>
  value.replace(/[\s  -​ 　]+/g, " ").trim();

/**
 * Models often quote a block of label/value lines slightly wrong (a skipped word, a changed space).
 * Returns the real source passage the excerpt points at, or null when no passage matches closely.
 * The returned text is always copied from the source, so it is verbatim by construction.
 */
export function snapExcerpt(excerpt: string, sourceText: string) {
  const source = squashSpace(sourceText);
  const wanted = squashSpace(excerpt);
  if (source.includes(wanted)) return wanted;
  const words = wanted.split(" ");
  if (words.length < 4) return null;
  const head = words.slice(0, 3).join(" ");
  const tail = words.slice(-3).join(" ");
  let from = source.indexOf(head);
  while (from >= 0) {
    const tailAt = source.indexOf(tail, from + head.length);
    if (tailAt >= 0) {
      const end = tailAt + tail.length;
      const passage = source.slice(from, end);
      // Reject passages much longer than the claim, and require the quoted words to appear in order.
      if (
        passage.length <= wanted.length * 1.6 + 80 &&
        passage.length <= 1200
      ) {
        const hay = passage.split(" ");
        let at = 0;
        let found = 0;
        for (const word of words) {
          const idx = hay.indexOf(word, at);
          if (idx >= 0) {
            found++;
            at = idx + 1;
          }
        }
        if (found / words.length >= 0.85) return passage;
      }
    }
    from = source.indexOf(head, from + 1);
  }
  return null;
}

const digits = (value: string) => value.replace(/[,\s ]/g, "");
/** True when the amount's digits appear in the excerpt (thousands separators ignored). */
const amountIn = (amount: number, excerpt: string) =>
  digits(excerpt).includes(String(amount));
const HEDGED = /\bup to\b|\bmaximum\b|\bmay be\b|\bcompetitive\b/i;
const TRANSFER_PAGE =
  /post-secondary|visiting|taught-postgraduate|research-postgraduate/i;

type Prunable = {
  requirements: {
    type: string;
    allowed: string[];
    minimum: number | null;
    appliesToQualifications: string[];
    excerpt: string;
    sourceUrl: string | null;
  }[];
  intakes: {
    academicYear: string;
    term: string;
    openDate: string | null;
    deadline: string | null;
    sourceUrl: string | null;
  }[];
  costs: {
    tuition: number | null;
    living: number | null;
    other: number | null;
    excerpt: string;
  }[];
  scholarships: {
    name: string;
    tuitionCoverage: number | null;
    stipendAmount: number | null;
    deadline: string | null;
    excerpt: string;
    sourceUrl: string | null;
  }[];
};

/**
 * Free post-checks on a model payload. Removes or nulls any value its own excerpt does not support,
 * so a candidate holds only facts the quoted text can back up. Returns what was dropped.
 */
export function pruneClaims<T extends Prunable>(payload: T) {
  const dropped: string[] = [];
  payload.costs = payload.costs.filter((cost) => {
    for (const field of ["tuition", "living", "other"] as const) {
      const value = cost[field];
      if (value !== null && !amountIn(value, cost.excerpt)) {
        dropped.push(`cost ${field} ${value}: amount not in its excerpt`);
        cost[field] = null;
      }
    }
    // Several amounts in one quote are ambiguous (tuition, rent and meals share a block): keep tuition only.
    const present = (["tuition", "living", "other"] as const).filter(
      (f) => cost[f] !== null,
    );
    for (const field of present.slice(1)) {
      dropped.push(
        `cost ${field}: several amounts in one entry; kept ${present[0]}`,
      );
      cost[field] = null;
    }
    if (
      cost.living !== null &&
      !/living|accommodation|housing|board|expenses/i.test(cost.excerpt)
    ) {
      dropped.push("cost living: excerpt does not say it is a living cost");
      cost.living = null;
    }
    if (
      cost.other !== null &&
      !/fee|charge|insurance|deposit|levy/i.test(cost.excerpt)
    ) {
      dropped.push("cost other: excerpt does not say it is a fee");
      cost.other = null;
    }
    return cost.tuition !== null || cost.living !== null || cost.other !== null;
  }) as T["costs"];
  payload.scholarships = payload.scholarships.filter((s) => {
    // The award's name must come from its quote; invented names mislabel real programmes.
    const words = s.name.toLowerCase().match(/[a-z]{4,}/g) ?? [];
    const missing = words.filter((w) => !s.excerpt.toLowerCase().includes(w));
    if (missing.length) {
      dropped.push(
        `scholarship ${s.name}: name words not in excerpt (${missing.join(", ")})`,
      );
      return false;
    }
    return true;
  }) as T["scholarships"];
  for (const s of payload.scholarships) {
    if (s.tuitionCoverage !== null && HEDGED.test(s.excerpt)) {
      dropped.push(
        `scholarship ${s.name}: coverage ${s.tuitionCoverage} is "up to", not guaranteed`,
      );
      s.tuitionCoverage = null;
    }
    // "up to HK$X" is a ceiling for a competitive award, not an amount a student will receive.
    if (s.stipendAmount !== null && HEDGED.test(s.excerpt)) {
      dropped.push(
        `scholarship ${s.name}: stipend ${s.stipendAmount} is a ceiling ("up to")`,
      );
      s.stipendAmount = null;
    }
    if (s.stipendAmount !== null && !amountIn(s.stipendAmount, s.excerpt)) {
      dropped.push(
        `scholarship ${s.name}: stipend ${s.stipendAmount} not in excerpt`,
      );
      s.stipendAmount = null;
    }
    if (
      s.deadline &&
      !new RegExp(`\\b${s.deadline.slice(0, 4)}\\b`).test(s.excerpt)
    ) {
      dropped.push(`scholarship ${s.name}: deadline year not in excerpt`);
      s.deadline = null;
    }
  }
  payload.requirements = payload.requirements.filter((r) => {
    // A list of accepted qualifications with no score or grade is not a matchable requirement.
    if (r.type === "OTHER" && r.allowed.length > 8 && r.minimum === null) {
      dropped.push("requirement: long qualification list without a threshold");
      return false;
    }
    // A threshold must be printed in its own quote, and a test whose scale changed over time is ambiguous.
    if (r.minimum !== null && !amountIn(r.minimum, r.excerpt)) {
      dropped.push(
        `requirement ${r.type}: minimum ${r.minimum} not in excerpt`,
      );
      r.minimum = null;
    }
    if (
      r.minimum !== null &&
      /\b(prior to|before|from)\b.{0,40}\b(onwards?|2\d{3})\b/i.test(
        r.excerpt,
      ) &&
      ["IELTS", "TOEFL", "SAT", "ACT"].includes(r.type)
    ) {
      dropped.push(`requirement ${r.type}: score scale changes by date`);
      r.minimum = null;
      r.type = "OTHER";
    }
    const text = r.excerpt.trim();
    if (text.length < 30 || /\b(and|or)$/i.test(text)) {
      dropped.push("requirement: fragmentary excerpt");
      return false;
    }
    // JUPAS is the local HKDSE route; this product serves international applicants.
    const routes = r.appliesToQualifications;
    if (
      routes.some((q) => /jupas/i.test(q)) &&
      !routes.some((q) => /non-?jupas/i.test(q))
    ) {
      dropped.push("requirement: local JUPAS route");
      return false;
    }
    if (r.sourceUrl && TRANSFER_PAGE.test(r.sourceUrl)) {
      dropped.push(
        "requirement from a transfer/postgraduate page: " + r.sourceUrl,
      );
      return false;
    }
    return true;
  }) as T["requirements"];
  payload.intakes = payload.intakes.filter((i) => {
    // An autumn intake cannot close or open after it starts: the year was mislabelled.
    const autumn = !/spring|winter|jan|feb|mar/i.test(i.term);
    const start = Date.parse(i.academicYear + "-09-01T00:00:00Z");
    if (
      autumn &&
      [i.openDate, i.deadline].some((d) => d !== null && Date.parse(d) > start)
    ) {
      dropped.push(
        `intake ${i.academicYear} ${i.term}: dates fall after the intake starts`,
      );
      return false;
    }
    if (i.sourceUrl && TRANSFER_PAGE.test(i.sourceUrl)) {
      dropped.push("intake from a transfer/postgraduate page: " + i.sourceUrl);
      return false;
    }
    return true;
  }) as T["intakes"];
  return dropped;
}

/**
 * Grows an excerpt (as a real, contiguous run of the page) until it also contains every needle,
 * e.g. the entry year printed in a header next to a deadline. Returns null when that cannot fit.
 */
export function widenExcerpt(
  excerpt: string,
  sourceText: string,
  needles: string[],
  max = 1200,
) {
  const source = squashSpace(sourceText);
  const wanted = squashSpace(excerpt);
  const at = source.indexOf(wanted);
  if (at < 0) return null;
  let start = at;
  let end = at + wanted.length;
  for (const needle of needles) {
    if (wanted.includes(needle)) continue;
    // Nearest occurrence to the excerpt, before or after.
    const before = source.lastIndexOf(needle, at);
    const after = source.indexOf(needle, end - needle.length);
    const candidates = [before, after].filter((i) => i >= 0);
    if (!candidates.length) return null;
    const i = candidates.sort(
      (a, b) => Math.abs(a - (at + end) / 2) - Math.abs(b - (at + end) / 2),
    )[0];
    start = Math.min(start, i);
    end = Math.max(end, i + needle.length);
  }
  return end - start <= max ? source.slice(start, end) : null;
}

type Quoted = { excerpt: string; sourceUrl: string | null };
/** Removes every claim whose excerpt is not an exact run of the page it cites. */
export function dropUnquoted(
  payload: {
    requirements: Quoted[];
    intakes: Quoted[];
    costs: Quoted[];
    documents: Quoted[];
    scholarships: (Quoted & { rules: Quoted[] })[];
  },
  sources: Map<string, string>,
) {
  const dropped: string[] = [];
  const squashed = new Map([...sources].map(([u, t]) => [u, squashSpace(t)]));
  const ok = (c: Quoted, kind: string) => {
    const page = c.sourceUrl ? squashed.get(c.sourceUrl) : undefined;
    const good = page !== undefined && page.includes(squashSpace(c.excerpt));
    if (!good)
      dropped.push(`${kind} dropped: excerpt not verbatim in its cited page`);
    return good;
  };
  payload.requirements = payload.requirements.filter((c) =>
    ok(c, "requirement"),
  );
  payload.intakes = payload.intakes.filter((c) => ok(c, "intake"));
  payload.costs = payload.costs.filter((c) => ok(c, "cost"));
  payload.documents = payload.documents.filter((c) => ok(c, "document"));
  payload.scholarships = payload.scholarships.filter((c) =>
    ok(c, "scholarship"),
  );
  for (const s of payload.scholarships)
    s.rules = s.rules.filter((c) => ok(c, "scholarship rule"));
  return dropped;
}

const MERGE_KINDS = [
  ["requirements", 30],
  ["intakes", 10],
  ["costs", 5],
  ["documents", 20],
  ["scholarships", 10],
] as const;
type Mergeable = Record<(typeof MERGE_KINDS)[number][0], { excerpt: string }[]>;

/**
 * Model output varies between runs. Adds claims from earlier candidates of the same program whose quote
 * the newest run did not return. Callers must re-check the merged payload against the current pages.
 */
export function mergeClaims<T extends Mergeable>(target: T, others: T[]) {
  let added = 0;
  for (const [kind, max] of MERGE_KINDS) {
    const list = target[kind] as { excerpt: string }[];
    const seen = new Set(list.map((c) => squashSpace(c.excerpt)));
    for (const other of others)
      for (const claim of other[kind]) {
        const key = squashSpace(claim.excerpt);
        if (seen.has(key) || list.length >= max) continue;
        seen.add(key);
        list.push(claim);
        added++;
      }
  }
  return added;
}

const MAX_DOCS = 14;
const PER_DOC_CHARS = 9000;
// Registry pages hold whole requirement tables; send them whole up to this size.
const REGISTRY_DOC_CHARS = 14000;
const FILTER_DOC_CHARS = 7000;
const BUNDLE_CHARS = 80000;

type Page = {
  id: string;
  url: string;
  title: string;
  text: string;
  contentHash: string;
};

/** Stored pages worth sending for one program, best first. */
export function rankPages<P extends Page>(
  program: { title: string; officialUrl: string },
  documents: P[],
  registryUrls: Set<string>,
  scoped: Map<string, string>,
  otherProgramUrls: string[] = [],
) {
  const otherPrograms = new Set(
    otherProgramUrls.filter((u) => u !== program.officialUrl),
  );
  const ownUrls = new Set(
    [...scoped].filter(([, title]) => title === program.title).map(([u]) => u),
  );
  const ranked = documents
    // A page registered for another program never informs this one.
    .filter((doc) => !scoped.has(doc.url) || ownUrls.has(doc.url))
    .filter((doc) => !otherPrograms.has(doc.url))
    // Filtered pages reach the pipeline only through the registry; stale ones stored earlier are ignored.
    .filter(
      (doc) =>
        !doc.url.includes("?") ||
        registryUrls.has(doc.url) ||
        ownUrls.has(doc.url),
    )
    .map((doc) => ({
      doc,
      score: programDocScore(program, doc, registryUrls, ownUrls),
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_DOCS);
  return { ranked, ownUrls };
}

/** Model input: labelled pages, shared lines sent once, and a size budget that sheds large shared pages first. */
export function assembleBundle<P extends Page>(
  ranked: { doc: P; score: number }[],
  registryUrls: Set<string>,
  ownUrls: Set<string>,
) {
  const sources = new Map<string, string>();
  let text = "";
  // Pages that share boilerplate (menus, a requirement table repeated under each filter) are sent once.
  const seen = new Set<string>();
  const novel = (value: string) =>
    value
      .split("\n")
      .filter((line) => {
        const key = line.trim();
        if (key.length < 40) return true;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .join("\n");
  const parts = ranked.map(({ doc, score }) => {
    // Targeted pages are short; send them whole so label/value blocks keep their dates and amounts.
    const registry = registryUrls.has(doc.url) || ownUrls.has(doc.url);
    // Filtered requirement pages carry a table for every school; the quoted rows are a small part.
    const cap = !registry
      ? PER_DOC_CHARS
      : doc.url.includes("?")
        ? FILTER_DOC_CHARS
        : REGISTRY_DOC_CHARS;
    const whole = novel(doc.text);
    return {
      doc,
      score,
      part: whole.length <= cap ? whole : selectWindows(whole, cap),
    };
  });
  // Over budget: shed the lowest-ranked shared pages first (largest first on ties), never the program's own or its scoped pages.
  const shed: string[] = [];
  let total = parts.reduce((n, p) => n + p.part.length, 0);
  while (total > BUNDLE_CHARS) {
    const droppable = parts
      .filter((p) => p.score < 80)
      .sort((a, b) => a.score - b.score || b.part.length - a.part.length)[0];
    if (!droppable) break;
    parts.splice(parts.indexOf(droppable), 1);
    total -= droppable.part.length;
    shed.push(droppable.doc.url);
  }
  for (const { doc, part } of parts) {
    sources.set(doc.url, doc.text);
    text += "### SOURCE: " + doc.url + "\n" + part + "\n\n";
  }
  return {
    text,
    sources,
    shed,
    sizes: parts.map((p) => [p.doc.url, p.part.length] as const),
  };
}
