import { z } from "zod";
export const countries = [
  "United States",
  "Hong Kong",
  "Hungary",
  "Germany",
  "Singapore",
] as const;
export const verificationSchema = z.enum([
  "SOURCE_BACKED",
  "NEEDS_REVIEW",
  "ADMIN_VERIFIED",
  "CONFLICTING",
  "OUTDATED",
  "UNKNOWN",
]);
export type Verification = z.infer<typeof verificationSchema>;
const optionalScore = (max: number) => z.number().min(0).max(max).nullable();
export const currencySchema = z.enum(
  Intl.supportedValuesOf("currency") as [string, ...string[]],
);
export const profileSchema = z.object({
  nationality: z.string().min(2).max(80),
  educationCountry: z.string().min(2).max(80),
  degreeLevel: z.enum(["BACHELOR", "MASTER"]),
  fieldOfStudy: z.string().min(2).max(100),
  preferredCountries: z.array(z.enum(countries)).min(1),
  budget: z.number().min(0).max(10000000),
  currency: currencySchema,
  intake: z.string().regex(/^\d{4}-(Fall|Spring|Autumn|Winter|Summer)$/),
  funding: z.enum(["FULL_RIDE", "TUITION", "PARTIAL", "NONE"]),
  qualification: z.string().max(100),
  grade: optionalScore(1000),
  gradingScale: z.string().max(60),
  ielts: optionalScore(9),
  toefl: optionalScore(120),
  // Added after launch: profiles saved earlier lack these fields.
  duolingo: optionalScore(160).default(null),
  pte: optionalScore(90).default(null),
  sat: optionalScore(1600),
  act: optionalScore(36),
  gre: optionalScore(340),
  gmat: optionalScore(805),
  bachelorField: z.string().max(100),
  bachelorGpa: optionalScore(1000),
  otherCredentials: z.string().max(1000),
});
export type Profile = z.infer<typeof profileSchema>;
export const ruleSchema = z.object({
  type: z.enum([
    "IELTS",
    "TOEFL",
    "DUOLINGO",
    "PTE",
    "SAT",
    "ACT",
    "GRE",
    "GMAT",
    "GRADE",
    "QUALIFICATION",
    "NATIONALITY",
    "EDUCATION_COUNTRY",
    "BACHELOR_FIELD",
    "OTHER",
  ]),
  label: z.string().min(1).max(500),
  minimum: z.number().nullable(),
  scale: z.string().nullable(),
  allowed: z.array(z.string()),
  mandatory: z.boolean(),
  appliesToNationalities: z.array(z.string()),
  appliesToQualifications: z.array(z.string()),
});
export type Rule = z.infer<typeof ruleSchema>;
export type Evidence = {
  academicYear?: string | null;
  url: string;
  excerpt: string;
  retrievedAt: string;
  status: Verification;
};
export type Requirement = Rule & { status: Verification; evidence?: Evidence };
export type ScholarshipView = {
  id: string;
  name: string;
  rules: Requirement[];
  tuitionCoverage: number | null;
  stipendAmount: number | null;
  currency: string | null;
  fundingCategory: string;
  status: Verification;
  deadline: string | null;
  renewalConditions: string | null;
  evidence?: Evidence;
};
export type Program = {
  id: string;
  universityId: string;
  university: string;
  country: string;
  city: string;
  title: string;
  degreeLevel: "BACHELOR" | "MASTER";
  fieldOfStudy: string;
  teachingLanguage: string | null;
  officialUrl: string;
  demo: boolean;
  requirementsComplete: boolean;
  requirements: Requirement[];
  intakes: {
    academicYear: string;
    term: string;
    route: string;
    openDate: string | null;
    deadline: string | null;
    timezone: string | null;
    status: Verification;
    evidence?: Evidence;
  }[];
  costs: {
    tuition: number | null;
    living: number | null;
    other: number | null;
    currency: string;
    period: string;
    status: Verification;
    evidence?: Evidence;
  }[];
  sources?: Evidence[];
  scholarships: ScholarshipView[];
  documents: { name: string; mandatory: boolean; evidence?: Evidence }[];
  lastResearched: string | null;
};
export const defaultProfile: Profile = {
  nationality: "",
  educationCountry: "",
  degreeLevel: "BACHELOR",
  fieldOfStudy: "Computer Science",
  preferredCountries: [...countries],
  budget: 15000,
  currency: "USD",
  intake: "2027-Fall",
  funding: "PARTIAL",
  qualification: "",
  grade: null,
  gradingScale: "",
  ielts: null,
  toefl: null,
  duolingo: null,
  pte: null,
  sat: null,
  act: null,
  gre: null,
  gmat: null,
  bachelorField: "",
  bachelorGpa: null,
  otherCredentials: "",
};
