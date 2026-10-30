import type { Profile, Program } from "./domain";
import { documentChecklist, type ChecklistItem } from "./documents";
import { matchProgram, trusted, type Check } from "./matching";

const TEST_KINDS = [
  "ENGLISH",
  "IELTS",
  "TOEFL",
  "DUOLINGO",
  "PTE",
  "SAT",
  "ACT",
  "GRE",
  "GMAT",
];

export type Readiness = {
  match: ReturnType<typeof matchProgram>;
  tests: Check[];
  documents: ChecklistItem[];
  /** Earliest verified, still-open deadline for the student's intake (ISO), or null. */
  deadline: string | null;
  testsToComplete: number;
  documentsToPrepare: number;
};

/** What a student still has to do for one program: tests below or missing, documents not yet held, next deadline. */
export function readiness(
  program: Program,
  profile: Profile,
  tracked: Record<string, "HAVE" | "IN_PROGRESS">,
  now = new Date(),
): Readiness {
  const match = matchProgram(program, profile, now);
  const tests = match.academic.filter(
    (c) => c.kind !== undefined && TEST_KINDS.includes(c.kind),
  );
  const documents = documentChecklist(program.documents, profile, tracked);
  const [year, term] = profile.intake.split("-");
  const open = program.intakes
    .filter(
      (i) =>
        i.academicYear === year &&
        i.term.toLowerCase() === term.toLowerCase() &&
        trusted(i.status) &&
        i.deadline &&
        new Date(i.deadline) >= now,
    )
    .map((i) => i.deadline!)
    .sort();
  return {
    match,
    tests,
    documents,
    deadline: open[0] ?? null,
    testsToComplete: tests.filter((t) => t.state !== "PASS").length,
    documentsToPrepare: documents.filter(
      (d) => d.mandatory && (d.have === "MISSING" || d.have === "IN_PROGRESS"),
    ).length,
  };
}
