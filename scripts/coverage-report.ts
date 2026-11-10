import { getPrograms } from "../lib/catalog";
import { db } from "../lib/db";
import { annualCost, trusted } from "../lib/matching";
import type { Program } from "../lib/domain";
// Read-only coverage audit of the published catalog, as students see it (read-time freshness applied).
// Prints Markdown: per university and intake, how much of the data matching needs is verified.
// INTAKE (default 2027-Fall) is the intake the year-mismatch table is computed for.
const [year, term] = (process.env.INTAKE ?? "2027-Fall").split("-");
const season = (t: string) =>
  t.toLowerCase() === "autumn" ? "fall" : t.toLowerCase();
// Rows combine by part (tuition, living, other), as in matching.
const completeCost = (p: Program, y: string) => annualCost(p, y).total !== null;
const otherYear = (y: string, evidenceYear?: string | null) =>
  !!evidenceYear && evidenceYear !== y;
try {
  const programs = await getPrograms(true);
  const lines: string[] = [];
  lines.push("# Catalog coverage", "");
  lines.push(
    "Generated " +
      new Date().toISOString() +
      " by `npm run coverage`. Published programmes only; statuses after read-time freshness.",
    "",
  );
  lines.push("## Per university and intake", "");
  lines.push(
    "| University | Country | Intake | Programmes | Verified deadline | Requirement evidence for this year | requirementsComplete | Complete cost (this year) |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  );
  const byUni = new Map<string, Program[]>();
  for (const p of programs)
    byUni.set(p.university, [...(byUni.get(p.university) ?? []), p]);
  for (const [uni, list] of [...byUni].sort(
    (a, b) => b[1].length - a[1].length,
  )) {
    const intakes = new Set<string>();
    for (const p of list)
      for (const i of p.intakes)
        intakes.add(i.academicYear + "-" + season(i.term));
    const rows = intakes.size ? [...intakes].sort() : ["(none)"];
    for (const key of rows) {
      const [y, t] = key.split("-");
      const has = list.filter((p) =>
        p.intakes.some((i) => i.academicYear === y && season(i.term) === t),
      );
      const verified = has.filter((p) =>
        p.intakes.some(
          (i) =>
            i.academicYear === y &&
            season(i.term) === t &&
            trusted(i.status) &&
            i.deadline &&
            i.timezone,
        ),
      );
      const yearEvidence = has.filter((p) =>
        p.requirements.some(
          (r) =>
            r.mandatory && trusted(r.status) && r.evidence?.academicYear === y,
        ),
      );
      lines.push(
        [
          uni,
          list[0].country,
          key === "(none)" ? key : y + " " + t,
          key === "(none)" ? list.length : has.length,
          verified.length,
          yearEvidence.length,
          (key === "(none)" ? list : has).filter((p) => p.requirementsComplete)
            .length,
          (key === "(none)" ? list : has).filter((p) => completeCost(p, y))
            .length,
        ]
          .join(" | ")
          .replace(/^/, "| ") + " |",
      );
    }
  }
  lines.push("", "## Year mismatch for intake " + year + "-" + term, "");
  lines.push(
    "Matching returns UNKNOWN for a rule or cost whose evidence names another academic year, and for an intake that is not published.",
    "",
    "| University | Programmes | No " +
      year +
      " " +
      term +
      " intake | Mandatory rule from another year | Cost from another year | Only year-blocked |",
    "| --- | --- | --- | --- | --- | --- |",
  );
  let total = 0,
    blocked = 0;
  for (const [uni, list] of byUni) {
    const noIntake = list.filter(
      (p) =>
        !p.intakes.some(
          (i) => i.academicYear === year && season(i.term) === season(term),
        ),
    );
    const ruleYear = list.filter((p) =>
      p.requirements.some(
        (r) => r.mandatory && otherYear(year, r.evidence?.academicYear),
      ),
    );
    const costYear = list.filter((p) =>
      p.costs.some(
        (c) => trusted(c.status) && otherYear(year, c.evidence?.academicYear),
      ),
    );
    // Every intake, rule and cost the programme has is trusted, and the only gaps are other-year evidence or a missing intake for this year.
    const onlyYear = list.filter((p) => {
      const yearGap =
        noIntake.includes(p) || ruleYear.includes(p) || costYear.includes(p);
      const otherGap =
        p.requirements.some((r) => r.mandatory && !trusted(r.status)) ||
        !p.requirementsComplete;
      return yearGap && !otherGap;
    });
    total += list.length;
    blocked += onlyYear.length;
    lines.push(
      `| ${uni} | ${list.length} | ${noIntake.length} | ${ruleYear.length} | ${costYear.length} | ${onlyYear.length} |`,
    );
  }
  lines.push(
    "",
    `Total published: ${total}. UNKNOWN only because of the year (requirements otherwise complete and trusted): ${blocked}.`,
  );
  console.log(lines.join("\n"));
} finally {
  await db.$disconnect();
}
