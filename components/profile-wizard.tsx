"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, LockKeyhole, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import {
  countries,
  defaultProfile,
  profileSchema,
  type Profile,
} from "@/lib/domain";
export const PROFILE_KEY = "unimatch-profile-v1";
export function readProfile(): Profile | null {
  try {
    const data = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? "null");
    const result = profileSchema.safeParse(data);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
export function ProfileWizard() {
  const [profile, setProfile] = useState<Profile>(defaultProfile),
    [step, setStep] = useState(0),
    [error, setError] = useState("");
  const router = useRouter();
  useEffect(() => {
    const saved = readProfile();
    if (saved) setProfile(saved);
  }, []);
  const set = <K extends keyof Profile>(key: K, value: Profile[K]) =>
    setProfile((p) => ({ ...p, [key]: value }));
  const text = (
    key: keyof Profile,
    label: string,
    placeholder = "",
    required = false,
  ) => (
    <label>
      {label}
      <input
        aria-label={label}
        value={String(profile[key] ?? "")}
        placeholder={placeholder}
        required={required}
        onChange={(e) => set(key, e.target.value)}
      />
    </label>
  );
  const number = (key: keyof Profile, label: string, max = 10000000) => (
    <label>
      {label}
      <input
        aria-label={label}
        type="number"
        min="0"
        max={max}
        step="any"
        value={profile[key] === null ? "" : String(profile[key])}
        onChange={(e) =>
          set(key, e.target.value === "" ? null : Number(e.target.value))
        }
      />
    </label>
  );
  function next() {
    setError("");
    if (
      step === 0 &&
      (!profile.nationality.trim() ||
        !profile.educationCountry.trim() ||
        !profile.fieldOfStudy.trim() ||
        !profile.preferredCountries.length)
    ) {
      setError(
        "Complete your citizenship, education country, field, and at least one destination.",
      );
      return;
    }
    if (step < 2) {
      setStep(step + 1);
      return;
    }
    const result = profileSchema.safeParse(profile);
    if (!result.success) {
      setError(
        result.error.issues
          .map((i) => i.path.join(".") + ": " + i.message)
          .join("; "),
      );
      return;
    }
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(result.data));
      router.push("/results");
    } catch {
      setError(
        "Browser storage is unavailable. Enable local storage to save your profile.",
      );
    }
  }
  return (
    <div className="wizard">
      <div className="eyebrow">Your future starts with you</div>
      <h1>Let’s find your fit.</h1>
      <p className="muted">
        A few details help us turn possibilities into a useful shortlist.
      </p>
      <div className="steps">
        {["Your direction", "Your qualifications", "Your budget"].map(
          (s, i) => (
            <div className={"step " + (i <= step ? "active" : "")} key={s}>
              {i + 1}. {s}
            </div>
          ),
        )}
      </div>
      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          next();
        }}
      >
        <h2 style={{ fontSize: 23 }}>
          {
            [
              "Where do you want to go?",
              "What are you bringing with you?",
              "Make it financially possible.",
            ][step]
          }
        </h2>
        {step === 0 && (
          <div className="form-grid">
            {text(
              "nationality",
              "Nationality / citizenship",
              "e.g. Ukraine",
              true,
            )}
            {text(
              "educationCountry",
              "Country of education",
              "e.g. Ukraine",
              true,
            )}
            <label>
              Intended degree
              <select
                value={profile.degreeLevel}
                onChange={(e) =>
                  set("degreeLevel", e.target.value as Profile["degreeLevel"])
                }
              >
                <option value="BACHELOR">Bachelor’s degree</option>
                <option value="MASTER">Master’s degree</option>
              </select>
            </label>
            {text("fieldOfStudy", "Field of study", "Computer Science", true)}
            <label>
              Desired academic intake
              <select
                value={profile.intake}
                onChange={(e) => set("intake", e.target.value)}
              >
                {[2027, 2028, 2029].flatMap((y) =>
                  ["Fall", "Spring", "Winter", "Summer", "Autumn"].map((t) => (
                    <option key={y + t}>
                      {y}-{t}
                    </option>
                  )),
                )}
              </select>
            </label>
            <fieldset className="full">
              <legend
                className="tiny"
                style={{ marginBottom: 12, fontWeight: 600 }}
              >
                Preferred study destinations
              </legend>
              <div className="checkbox-grid">
                {countries.map((c) => (
                  <label className="checkbox-chip" key={c}>
                    <input
                      type="checkbox"
                      checked={profile.preferredCountries.includes(c)}
                      onChange={(e) =>
                        set(
                          "preferredCountries",
                          e.target.checked
                            ? [...profile.preferredCountries, c]
                            : profile.preferredCountries.filter((x) => x !== c),
                        )
                      }
                    />
                    {c}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        )}
        {step === 1 && (
          <>
            <p className="muted tiny">
              These fields are optional. Missing information stays unknown, and
              grades are compared only on a matching scale.
            </p>
            <div className="form-grid">
              {text(
                "qualification",
                "Current qualification",
                "Exact qualification name",
              )}
              {text(
                "gradingScale",
                "Grading scale",
                "e.g. UK A-level, 100-point",
              )}
              {number("grade", "Academic grade average", 1000)}
              {number("ielts", "IELTS overall", 9)}
              {number("toefl", "TOEFL iBT", 120)}
              {number("sat", "SAT", 1600)}
              {number("act", "ACT", 36)}
              {profile.degreeLevel === "MASTER" && (
                <>
                  {text(
                    "bachelorField",
                    "Previous bachelor’s field",
                    "Computer Science",
                  )}
                  {number("bachelorGpa", "Bachelor’s GPA / average", 1000)}
                  {number("gre", "GRE", 340)}
                  {number("gmat", "GMAT", 805)}
                </>
              )}
              {text("otherCredentials", "Other credentials or language scores")}
            </div>
          </>
        )}
        {step === 2 && (
          <div className="form-grid">
            {number("budget", "Available annual budget")}
            <label>
              Budget currency
              <select
                value={profile.currency}
                onChange={(e) => set("currency", e.target.value)}
              >
                {["USD", "EUR", "HKD", "HUF", "SGD", "GBP", "UAH", "INR"].map(
                  (c) => (
                    <option key={c}>{c}</option>
                  ),
                )}
              </select>
            </label>
            <label className="full">
              Funding preference
              <select
                value={profile.funding}
                onChange={(e) =>
                  set("funding", e.target.value as Profile["funding"])
                }
              >
                <option value="FULL_RIDE">
                  Full ride required — tuition and living costs
                </option>
                <option value="TUITION">Tuition scholarship required</option>
                <option value="PARTIAL">Partial funding acceptable</option>
                <option value="NONE">No scholarship required</option>
              </select>
            </label>
            <div className="notice full">
              <LockKeyhole
                size={16}
                style={{ display: "inline", marginRight: 8 }}
              />{" "}
              Your profile is saved only in this browser. We never ask for
              passports, bank records, or document uploads.
            </div>
          </div>
        )}
        {error && (
          <div role="alert" className="error">
            {error}
          </div>
        )}
        <div className="form-actions">
          <Button
            type="button"
            variant="ghost"
            disabled={step === 0}
            onClick={() => setStep(step - 1)}
          >
            <ArrowLeft size={16} /> Back
          </Button>
          <Button type="submit">
            {step === 2 ? "Show my matches" : "Continue"}
            <ArrowRight size={16} />
          </Button>
        </div>
      </form>
      <button
        className="back"
        style={{ marginTop: 22 }}
        onClick={() => {
          localStorage.removeItem(PROFILE_KEY);
          setProfile(defaultProfile);
          setStep(0);
          setError("Profile deleted from this device.");
        }}
      >
        <Trash2 size={14} /> Delete my saved profile
      </button>
    </div>
  );
}
