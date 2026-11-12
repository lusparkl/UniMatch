"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, LockKeyhole, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { deleteProfile, readProfile, saveProfile } from "./local-store";
import { defaultProfile, profileSchema, type Profile } from "@/lib/domain";
import { PersonaPicker } from "./persona-buttons";
import { budgetCurrencies } from "./profile-drawer";
import { ComboBox } from "./combo-box";
import {
  COUNTRY_OPTIONS,
  QUALIFICATION_OPTIONS,
  canonical,
} from "@/lib/profile-options";
// Fields the engine compares by name: only listed values are accepted, so a typo cannot hide a rule.
const listed: [keyof Profile, readonly string[], string][] = [
  ["nationality", COUNTRY_OPTIONS, "Choose a country from the list."],
  ["educationCountry", COUNTRY_OPTIONS, "Choose a country from the list."],
  [
    "qualification",
    QUALIFICATION_OPTIONS,
    "Choose a qualification from the list, or “Other qualification”.",
  ],
];
// Fields on the second and third steps; /profile#ielts opens the step and focuses the field.
const stepOf = (field: string) =>
  [
    "qualification",
    "gradingScale",
    "grade",
    "ielts",
    "toefl",
    "duolingo",
    "pte",
    "sat",
    "act",
  ].includes(field)
    ? 1
    : ["budget", "currency", "funding"].includes(field)
      ? 2
      : 0;
const intakes = [
  "2027-Fall",
  "2027-Spring",
  "2028-Fall",
  "2028-Spring",
  "2029-Fall",
];
// Highest valid value of each score; anything above it is a typo, not a result.
const maxima: [keyof Profile, number][] = [
  ["ielts", 9],
  ["toefl", 120],
  ["duolingo", 160],
  ["pte", 90],
  ["sat", 1600],
  ["act", 36],
  ["grade", 1000],
  ["bachelorGpa", 1000],
  ["gre", 340],
  ["gmat", 805],
];
const steps = ["Direction", "Qualifications", "Budget"];
const titles = [
  "Where are you applying from?",
  "What are you bringing with you?",
  "What can you spend?",
];
const hints = [
  "International admission rules depend on your nationality and the country where you studied. Required fields only; you can change everything later.",
  "All optional. Missing information stays unknown, and grades are only compared on a matching scale.",
  "Budget is compared with costs after conversion at dated reference rates. Scholarships are checked separately, one at a time.",
];
// A new profile starts blank where the student must answer, not with the matching defaults.
const blank: Profile = { ...defaultProfile, fieldOfStudy: "" };
type Errors = Partial<Record<keyof Profile | "form", string>>;
export function ProfileWizard() {
  const [profile, setProfile] = useState<Profile>(blank),
    [step, setStep] = useState(0),
    [errors, setErrors] = useState<Errors>({}),
    [notice, setNotice] = useState(""),
    // Blank until the student enters a budget; a saved profile restores its own.
    [budget, setBudget] = useState(""),
    [focusField, setFocusField] = useState("");
  const router = useRouter();
  useEffect(() => {
    const saved = readProfile();
    if (saved) {
      setProfile(saved);
      setBudget(String(saved.budget));
    }
    const field = window.location.hash.slice(1);
    if (!field) return;
    setStep(stepOf(field));
    setFocusField(field);
  }, []);
  // Focus a linked field once its step has rendered.
  useEffect(() => {
    const el = focusField && document.getElementById(focusField);
    if (el) el.focus();
  }, [focusField, step]);
  const set = <K extends keyof Profile>(key: K, value: Profile[K]) => {
    setProfile((p) => ({ ...p, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const goTo = (to: number) => {
    setErrors({});
    setNotice("");
    setStep(to);
  };
  const field = (
    key: keyof Profile,
    label: string,
    control: React.ReactNode,
    { optional = false, full = false } = {},
  ) => (
    <label className={"field" + (full ? " full" : "")} key={key}>
      {label}
      {optional && <span className="field-opt">Optional</span>}
      {control}
      {errors[key] && (
        <span className="field-error" id={key + "-error"}>
          {errors[key]}
        </span>
      )}
    </label>
  );
  const invalid = (key: keyof Profile) =>
    errors[key]
      ? { "aria-invalid": true, "aria-describedby": key + "-error" }
      : {};
  const picker = (
    key: "nationality" | "educationCountry" | "qualification",
    label: string,
    options: readonly string[],
    placeholder: string,
    { optional = false, required = false } = {},
  ) => (
    <div className="field" key={key}>
      <label htmlFor={key}>
        {label}
        {optional && <span className="field-opt">Optional</span>}
      </label>
      <ComboBox
        id={key}
        value={profile[key]}
        options={options}
        placeholder={placeholder}
        required={required}
        invalid={!!errors[key]}
        describedBy={errors[key] ? key + "-error" : undefined}
        onChange={(v) => set(key, v)}
      />
      {errors[key] && (
        <span className="field-error" id={key + "-error"}>
          {errors[key]}
        </span>
      )}
    </div>
  );
  const text = (
    key: keyof Profile,
    label: string,
    placeholder = "",
    { optional = false, full = false, required = false } = {},
  ) =>
    field(
      key,
      label,
      <input
        id={key}
        value={String(profile[key] ?? "")}
        placeholder={placeholder}
        required={required}
        onChange={(e) => set(key, e.target.value as never)}
        {...invalid(key)}
      />,
      { optional, full },
    );
  const number = (key: keyof Profile, label: string) =>
    field(
      key,
      label,
      <input
        id={key}
        type="number"
        inputMode="decimal"
        min="0"
        step="any"
        value={profile[key] === null ? "" : String(profile[key])}
        onChange={(e) =>
          set(
            key,
            (e.target.value === "" ? null : Number(e.target.value)) as never,
          )
        }
        {...invalid(key)}
      />,
      { optional: true },
    );
  function validate(): Errors {
    const e: Errors = {};
    if (step === 0)
      for (const key of [
        "nationality",
        "educationCountry",
        "fieldOfStudy",
      ] as const)
        if (!profile[key].trim()) e[key] = "Required.";
    for (const [key, options, message] of listed) {
      const v = String(profile[key] ?? "");
      if (step === stepOf(key) && v.trim() && !canonical(options, v))
        e[key] = message;
    }
    if (step === 1)
      for (const [key, max] of maxima) {
        const v = profile[key];
        if (typeof v === "number" && (Number.isNaN(v) || v < 0 || v > max))
          e[key] = "Enter a number from 0 to " + max + ".";
      }
    if (step === 2 && (budget.trim() === "" || !(Number(budget) >= 0)))
      e.budget =
        budget.trim() === ""
          ? "Enter your available annual budget."
          : "Enter a positive amount.";
    return e;
  }
  function next() {
    setNotice("");
    const e = validate();
    if (Object.keys(e).length) {
      setErrors(e);
      document.getElementById(Object.keys(e)[0])?.focus();
      return;
    }
    // Store the listed spelling of anything typed in another case ("india" becomes "India").
    const fixed = { ...profile };
    for (const [key, options] of listed) {
      const v = canonical(options, String(fixed[key] ?? ""));
      if (v) fixed[key] = v as never;
    }
    setProfile(fixed);
    if (step < 2) {
      goTo(step + 1);
      window.scrollTo(0, 0);
      return;
    }
    const result = profileSchema.safeParse({
      ...fixed,
      budget: Number(budget),
    });
    if (!result.success) {
      setErrors({
        form: result.error.issues
          .map((i) => i.path.join(".") + ": " + i.message)
          .join("; "),
      });
      return;
    }
    if (saveProfile(result.data)) router.push("/results");
    else
      setErrors({
        form: "Browser storage is unavailable. Enable local storage to save your profile.",
      });
  }
  return (
    <div className="wizard">
      <div className="eyebrow">Your profile · International applicant</div>
      <h1>Let’s find your fit.</h1>
      <p className="lede-sm" style={{ margin: "0 0 16px" }}>
        A few details turn thousands of rules into a short, honest list. About
        two minutes, and every field after the first step is optional.
      </p>
      <div className="match-chips">
        <span>Matching against</span>
        <span className="chip-outline">
          <span className="cjk" lang="zh-HK">
            香港
          </span>{" "}
          Hong Kong
        </span>
        <span className="chip-outline">
          <span className="cjk" lang="ko">
            한국
          </span>{" "}
          South Korea
        </span>
      </div>
      <ol className="steps" aria-label="Progress">
        {steps.map((s, i) => (
          <li key={s} className={i <= step ? "done" : undefined}>
            <button
              type="button"
              disabled={i > step}
              aria-current={i === step ? "step" : undefined}
              onClick={() => goTo(i)}
            >
              <div className="step-bar" />
              <div className="step-label">
                {i + 1}
                <span className="step-name"> · {s}</span>
              </div>
            </button>
          </li>
        ))}
      </ol>
      <form
        className="card wizard-card"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          next();
        }}
      >
        <h2>{titles[step]}</h2>
        <p className="hint">{hints[step]}</p>
        {step === 0 && (
          <div className="form-grid">
            {picker(
              "nationality",
              "Nationality / citizenship",
              COUNTRY_OPTIONS,
              "Start typing, e.g. India",
              { required: true },
            )}
            {picker(
              "educationCountry",
              "Country of education",
              COUNTRY_OPTIONS,
              "Start typing, e.g. India",
              { required: true },
            )}
            {text("fieldOfStudy", "Field of study", "e.g. Computer Science", {
              required: true,
            })}
            {field(
              "intake",
              "Desired intake",
              <select
                id="intake"
                value={profile.intake}
                onChange={(e) => set("intake", e.target.value)}
              >
                {[...new Set([...intakes, profile.intake])].map((i) => (
                  <option key={i}>{i}</option>
                ))}
              </select>,
            )}
          </div>
        )}
        {step === 1 && (
          <div className="form-grid">
            {picker(
              "qualification",
              "Current qualification",
              QUALIFICATION_OPTIONS,
              "e.g. IB Diploma, GCE A-Level",
              { optional: true },
            )}
            {text("gradingScale", "Grading scale", "e.g. IB Diploma points", {
              optional: true,
            })}
            {number("grade", "Academic grade")}
            {number("ielts", "IELTS overall")}
            {number("toefl", "TOEFL iBT")}
            {number("duolingo", "Duolingo")}
            {number("pte", "PTE Academic")}
            {number("sat", "SAT")}
            {number("act", "ACT")}
            {profile.degreeLevel === "MASTER" && (
              <>
                {text(
                  "bachelorField",
                  "Previous bachelor’s field",
                  "Computer Science",
                  { optional: true },
                )}
                {number("bachelorGpa", "Bachelor’s GPA / average")}
                {number("gre", "GRE")}
                {number("gmat", "GMAT")}
              </>
            )}
            {text(
              "otherCredentials",
              "Other credentials or language scores",
              "",
              {
                optional: true,
                full: true,
              },
            )}
          </div>
        )}
        {step === 2 && (
          <div className="form-grid">
            {field(
              "budget",
              "Available annual budget",
              <input
                id="budget"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                required
                value={budget}
                onChange={(e) => {
                  setBudget(e.target.value);
                  setErrors((x) => ({ ...x, budget: undefined }));
                }}
                {...invalid("budget")}
              />,
            )}
            {field(
              "currency",
              "Budget currency",
              <select
                id="currency"
                value={profile.currency}
                onChange={(e) => set("currency", e.target.value)}
              >
                {[...new Set([...budgetCurrencies, profile.currency])].map(
                  (c) => (
                    <option key={c}>{c}</option>
                  ),
                )}
              </select>,
            )}
            {field(
              "funding",
              "Funding preference",
              <select
                id="funding"
                value={profile.funding}
                onChange={(e) =>
                  set("funding", e.target.value as Profile["funding"])
                }
              >
                <option value="FULL_RIDE">
                  Full ride required: tuition and living costs
                </option>
                <option value="TUITION">Tuition scholarship required</option>
                <option value="PARTIAL">Partial funding acceptable</option>
                <option value="NONE">No scholarship required</option>
              </select>,
              { full: true },
            )}
          </div>
        )}
        {step === 0 && (
          <PersonaPicker
            onPick={(p) => {
              setProfile(p.profile);
              setBudget(String(p.profile.budget));
              setErrors({});
            }}
          />
        )}
        {errors.form && (
          <div role="alert" className="error">
            {errors.form}
          </div>
        )}
        <div className="form-actions">
          <Button
            type="button"
            variant="link"
            disabled={step === 0}
            onClick={() => goTo(step - 1)}
          >
            <ArrowLeft size={15} aria-hidden /> Back
          </Button>
          <div className="actions">
            {step === 1 && (
              <Button type="button" variant="outline" onClick={() => goTo(2)}>
                Skip For Now
              </Button>
            )}
            <Button type="submit">
              {step === 2 ? "Show My Matches" : "Continue"}
            </Button>
          </div>
        </div>
      </form>
      <div className="privacy-note">
        <LockKeyhole size={16} aria-hidden />
        <span>
          Saved only in this browser. We never ask for passports, bank records
          or document uploads.
        </span>
      </div>
      <button
        type="button"
        className="delete-link"
        onClick={() => {
          deleteProfile();
          setProfile(blank);
          setBudget("");
          goTo(0);
          setNotice("Profile deleted from this browser.");
        }}
      >
        <Trash2 size={14} aria-hidden /> Delete my saved profile
      </button>
      <p role="status" className="note">
        {notice}
      </p>
    </div>
  );
}
