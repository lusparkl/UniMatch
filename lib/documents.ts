import type { Profile } from "./domain";

export type DocumentKind = { id: string; label: string; pattern: RegExp };

/** Documents a student can track. Programs name their documents in free text; `pattern` maps that text to a kind. */
export const documentKinds: DocumentKind[] = [
  {
    id: "passport",
    label: "Passport or national ID",
    pattern: /passport|identity|national id|id card/i,
  },
  {
    id: "transcript",
    label: "Academic transcripts",
    pattern:
      /transcript|academic (record|certificate)|mark ?sheet|grade report|academic result/i,
  },
  {
    id: "diploma",
    label: "School-leaving or degree certificate",
    pattern:
      /diploma|school.?leaving|degree certificate|graduation certificate|certificate of (graduation|completion)|high school (certificate|diploma)/i,
  },
  {
    id: "english",
    label: "English test result",
    pattern:
      /english|ielts|toefl|duolingo|\bpte\b|language (proficiency|test)/i,
  },
  {
    id: "standardized",
    label: "SAT, ACT or AP score report",
    pattern: /\bsat\b|\bact\b|advanced placement|\bAP\b|standardi[sz]ed/i,
  },
  {
    id: "recommendation",
    label: "Recommendation letters",
    pattern: /recommend|referee|reference letter/i,
  },
  {
    id: "motivation",
    label: "Motivation or personal statement",
    pattern:
      /motivation|personal statement|statement of purpose|essay|cover letter/i,
  },
  {
    id: "cv",
    label: "CV or résumé",
    pattern: /\bcv\b|curriculum vitae|resume|résumé/i,
  },
  {
    id: "portfolio",
    label: "Portfolio or work samples",
    pattern: /portfolio|work sample/i,
  },
  {
    id: "financial",
    label: "Proof of funds",
    pattern:
      /financ|bank statement|proof of funds|sponsor|affidavit of support/i,
  },
  {
    id: "photo",
    label: "Passport-size photo",
    pattern: /photo/i,
  },
  {
    id: "translation",
    label: "Certified translations or apostille",
    pattern: /translat|notari|apostille|legali[sz]/i,
  },
  {
    id: "fee",
    label: "Application fee payment",
    pattern: /application fee|fee payment|payment of/i,
  },
];

export const documentKindIds = documentKinds.map((k) => k.id);

/** Kind of a program-listed document name, or null when it fits no known kind. */
export function classifyDocument(name: string) {
  return documentKinds.find((k) => k.pattern.test(name)) ?? null;
}

/** Common to almost every application; shown, clearly marked unverified, when a program lists no documents. */
export const typicalKinds = ["passport", "transcript", "diploma", "english"];

export type HaveStatus = "HAVE" | "IN_PROGRESS" | "MISSING" | "UNTRACKED";
export type ChecklistItem = {
  name: string;
  kind: string | null;
  label: string;
  mandatory: boolean;
  have: HaveStatus;
  typical: boolean;
};
type Owned = Record<string, "HAVE" | "IN_PROGRESS">;

/** Documents implied by what the profile already records (test scores count as a held result). */
export function ownedFromProfile(profile: Profile): Owned {
  const owned: Owned = {};
  if (
    [profile.ielts, profile.toefl, profile.duolingo, profile.pte].some(
      (v) => v !== null,
    )
  )
    owned.english = "HAVE";
  if (profile.sat !== null || profile.act !== null) owned.standardized = "HAVE";
  return owned;
}

export function documentChecklist(
  listed: { name: string; mandatory: boolean }[],
  profile: Profile,
  tracked: Owned,
): ChecklistItem[] {
  const owned: Owned = { ...ownedFromProfile(profile), ...tracked };
  const typical = !listed.length;
  const rows = typical
    ? typicalKinds.map((id) => ({
        name: documentKinds.find((k) => k.id === id)!.label,
        mandatory: true,
      }))
    : listed;
  const seen = new Set<string>();
  const items: ChecklistItem[] = [];
  for (const row of rows) {
    const kind = classifyDocument(row.name);
    // Two listed documents of one kind (for example two transcripts) are one thing to prepare.
    if (kind && seen.has(kind.id)) continue;
    if (kind) seen.add(kind.id);
    items.push({
      name: row.name,
      kind: kind?.id ?? null,
      label: kind?.label ?? row.name,
      mandatory: row.mandatory,
      have: kind ? (owned[kind.id] ?? "MISSING") : "UNTRACKED",
      typical,
    });
  }
  return items;
}
