import { db } from "../lib/db";
import { trusted } from "../lib/matching";
import {
  addCost,
  curationJob,
  fetchApproved,
  latestDocument,
  quoter,
  squash,
} from "./curation";
// W4 (2.1, 2.2): non-local tuition, living costs and other mandatory costs for the Hong Kong programmes, each
// quoted from the university's fee page as re-fetched through the guarded crawler (2026-11-10, delegated by
// the project owner). One row per part, so rows combine in matching; nothing ADMIN_VERIFIED is overwritten,
// except the owner-approved supersession of CUHK's living-expenses-only rows (HK$45,000 without the
// HK$17,000 on-campus accommodation quoted on the line above it).
// - CUHK: HK$230,000 for 2027-28, except dual-degree programmes ("may vary"). Living: accommodation about
//   HK$17,000 plus living expenses about HK$45,000. Other: HK$450 caution fee paid on enrolment (owner decision).
// - HKU: STEM HK$280,000, non-STEM HK$250,000, MBBS/BDS HK$590,000, by the FACULTY field on the programme
//   page against the fee page's faculty lists. Unlisted or mixed faculties get no tuition.
// - HKUST: HK$260,000 for 2027/28, all programmes. PolyU: HK$240,000 for government-funded (JUPAS) programmes.
// - HKBU: HK$240,000 for 2027/28, all programmes.
// Ranges (HKU, HKUST and HKBU accommodation) and "up to" figures stay as they are: they give no single cost,
// so those totals stay partial and only tuition bounds them. Dry run by default; APPLY=1 writes.
const apply = process.env.APPLY === "1";
const reviewer =
  "claude-code (HK fee pages re-read on 2026-11-10, delegated by project owner)";
type Part = "tuition" | "living" | "other";
type Plan = {
  universityId: string;
  url: string;
  // Returns the parts that apply to one programme, or a reason it gets none.
  parts: (
    program: { title: string; officialUrl: string },
    q: ReturnType<typeof quoter>,
  ) => Promise<
    | {
        part: Part;
        amount: number;
        year: string | null;
        quote: { excerpt: string; sourceUrl: string };
        note: string;
      }[]
    | string
  >;
};
const hkuStem = [
  "Faculty of Engineering",
  "Faculty of Medicine",
  "Faculty of Science",
  "School of Biomedical Engineering",
  "School of Computing and Data Science",
  "School of Innovation",
];
const hkuNonStem = [
  "Faculty of Architecture",
  "Faculty of Arts",
  "Faculty of Business and Economics",
  "Faculty of Education",
  "Faculty of Law",
  "Faculty of Social Sciences",
  "School of Future Media",
  "School of Governance and Policy",
];
const plans: Plan[] = [
  {
    universityId: "cuhk",
    url: "https://admission.cuhk.edu.hk/fees-financing-your-studies/fees/",
    async parts(p, q) {
      const living = {
        part: "living" as const,
        amount: 62000,
        year: null,
        quote: q(
          "On-Campus Accommodation: about HK$17,000",
          "Living Expenses: about HK$45,000",
        ),
        note: "Estimate: on-campus accommodation about HK$17,000 plus living expenses about HK$45,000",
      };
      const other = {
        part: "other" as const,
        amount: 450,
        year: "2027",
        quote: q(
          "A caution fee of HK$450 must be paid upon enrolment.",
          "usually used as a graduation fee.",
        ),
        note: "Caution fee paid on enrolment (first year); refundable on withdrawal",
      };
      if (/dual undergraduate degree|double degree/i.test(p.title))
        return [living, other];
      return [
        {
          part: "tuition",
          amount: 230000,
          year: "2027",
          quote: q(
            "2027-2028 annual tuition fees for non-local students",
            "HK$230,000 per annum",
          ),
          note: "Non-local tuition 2027-28 for all programmes except dual-degree programmes",
        },
        living,
        other,
      ];
    },
  },
  {
    universityId: "hku",
    url: "https://www.admissions.hku.hk/fees-and-scholarships/fees",
    async parts(p, q) {
      const head = "Annual Tuition Fees for Local Students not Eligible";
      if (
        /MBBS|Bachelor of Medicine and Bachelor of Surgery|Dental Surgery/.test(
          p.title,
        )
      )
        return [
          {
            part: "tuition",
            amount: 590000,
            year: "2027",
            quote: q(head, "HK$ 590,000"),
            note: "MBBS / BDS tuition 2027/28",
          },
        ];
      const page = await latestDocument("hku", p.officialUrl);
      const field = page?.text.match(/\n\s*FACULTY\s*\n\s*([^\n]+)/)?.[1];
      if (!field) return "no FACULTY field on the programme page";
      const units = squash(field)
        .split(/,\s*|\s+and the\s+|\s+and\s+(?=Faculty|School)/)
        .map((u) => u.replace(/^(the|Li Ka Shing)\s+/i, "").trim())
        .filter(Boolean);
      const stem = units.every((u) => hkuStem.includes(u));
      const nonStem = units.every((u) => hkuNonStem.includes(u));
      if (stem === nonStem)
        return `faculty "${field.trim()}" is not one fee category on the fee page`;
      return [
        stem
          ? {
              part: "tuition",
              amount: 280000,
              year: "2027",
              quote: q(head, "Computing and Data Science*, and Innovation"),
              note: `STEM tuition 2027/28: programme page lists ${field.trim()}`,
            }
          : {
              part: "tuition",
              amount: 250000,
              year: "2027",
              quote: q(
                head,
                "Schools of Future Media, and Governance and Policy",
              ),
              note: `Non-STEM tuition 2027/28: programme page lists ${field.trim()}`,
            },
      ];
    },
  },
  {
    universityId: "hkust",
    url: "https://join.hkust.edu.hk/fees-and-scholarships",
    async parts(_, q) {
      return [
        {
          part: "tuition",
          amount: 260000,
          year: "2027",
          quote: q(
            "Tuition Fee (Non-local Students)*",
            "in 2027/28 academic year",
          ),
          note: "Non-local tuition 2027/28, all programmes",
        },
      ];
    },
  },
  {
    universityId: "polyu",
    url: "https://www.polyu.edu.hk/study/ug/admissions/international-other-qualifications/international-other-qualifications-tuition-fees",
    async parts(p, q) {
      if (!/\/jupas\//.test(p.officialUrl))
        return "not a government-funded (JUPAS-listed) programme page";
      return [
        {
          part: "tuition",
          amount: 240000,
          year: "2027",
          quote: q(
            "The following tuition fee is charged for full-time government-funded Bachelor's Degree programmes",
            "per academic year",
          ),
          note: "Tuition 2027/28 for full-time government-funded bachelor's programmes",
        },
      ];
    },
  },
  {
    universityId: "hkbu",
    url: "https://admissions.hkbu.edu.hk/fees-and-scholarships.html",
    async parts(_, q) {
      return [
        {
          part: "tuition",
          amount: 240000,
          year: "2027",
          quote: q(
            "Tuition fees for academic year 2027/28",
            "Non-local students: HK$240,000",
          ),
          note: "Non-local tuition 2027/28, all programmes",
        },
      ];
    },
  },
];
const key = {
  tuition: "tuitionAmount",
  living: "livingCostAmount",
  other: "additionalCosts",
} as const;
const summary: string[] = [];
for (const plan of plans) {
  const page = await fetchApproved(plan.universityId, plan.url);
  const q = quoter(page.url, page.text);
  const job = apply
    ? await curationJob(plan.universityId, "HK fees 2026-11-10")
    : null;
  const programs = await db.degreeProgram.findMany({
    where: { universityId: plan.universityId, published: true },
    include: { costs: { include: { evidence: true } } },
    orderBy: { title: "asc" },
  });
  const counts = { added: 0, present: 0, kept: 0, superseded: 0, skipped: 0 };
  for (const p of programs) {
    const parts = await plan.parts(p, q);
    if (typeof parts === "string") {
      counts.skipped++;
      console.log(`   skip ${plan.universityId} ${p.title}: ${parts}`);
      continue;
    }
    for (const part of parts) {
      const rows = p.costs.filter(
        (c) =>
          c.currency === "HKD" &&
          c.period === "ANNUAL" &&
          trusted(c.verificationStatus) &&
          c[key[part.part]] !== null,
      );
      if (rows.some((c) => c[key[part.part]] === part.amount)) {
        counts.present++;
        continue;
      }
      // Owner decision 2026-11-10: CUHK's living-expenses-only figure is superseded by the full estimate.
      const superseded = rows.filter(
        (c) =>
          plan.universityId === "cuhk" &&
          part.part === "living" &&
          c.livingCostAmount === 45000 &&
          c.tuitionAmount === null &&
          c.additionalCosts === null,
      );
      if (rows.length > superseded.length) {
        counts.kept++;
        console.log(
          `   keep ${plan.universityId} ${p.title}: ${part.part} ${rows.map((r) => `${r[key[part.part]]} (${r.verificationStatus})`).join(", ")} already published; quoted ${part.amount}`,
        );
        continue;
      }
      if (superseded.length) counts.superseded++;
      counts.added++;
      if (!apply) continue;
      await addCost({
        jobId: job!.id,
        programId: p.id,
        universityId: plan.universityId,
        page,
        cost: {
          tuition: part.part === "tuition" ? part.amount : null,
          living: part.part === "living" ? part.amount : null,
          other: part.part === "other" ? part.amount : null,
          currency: "HKD",
          period: "ANNUAL",
          ...part.quote,
        },
        academicYear: part.year,
        estimateType: part.part === "living" ? "ESTIMATE" : "PUBLISHED_FEE",
        reviewer,
        action: superseded.length ? "CURATED_COST_SUPERSEDE" : "CURATED_COST",
        note: part.note,
        superseded,
      });
    }
  }
  summary.push(
    `${plan.universityId}: ${programs.length} programmes; rows to add ${counts.added} (superseding ${counts.superseded}), already present ${counts.present}, different value kept ${counts.kept}, programmes skipped ${counts.skipped}`,
  );
}
console.log(summary.join("\n"));
if (!apply) console.log("Dry run. Set APPLY=1 to write.");
process.exit(0);
