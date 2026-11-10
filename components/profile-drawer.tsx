"use client";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "./ui/button";
import type { Profile } from "@/lib/domain";

const scores: [keyof Profile, string, number][] = [
  ["ielts", "IELTS overall", 9],
  ["toefl", "TOEFL iBT", 120],
  ["duolingo", "Duolingo English Test", 160],
  ["pte", "PTE Academic", 90],
  ["sat", "SAT", 1600],
  ["act", "ACT", 36],
  ["grade", "Academic grade", 1000],
];
const intakes = ["2027-Fall", "2027-Spring", "2028-Spring", "2028-Fall"];
export const budgetCurrencies = [
  "USD",
  "EUR",
  "GBP",
  "HKD",
  "KRW",
  "INR",
  "UAH",
];

/** Edit the scores and money that drive the results, and watch them re-rank. Saved in this browser only. */
export function ProfileDrawer({
  profile,
  onChange,
  onClose,
}: {
  profile: Profile;
  onChange: (profile: Profile) => void;
  onClose: () => void;
}) {
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => {
    first.current?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  const set = <K extends keyof Profile>(key: K, value: Profile[K]) =>
    onChange({ ...profile, [key]: value });
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
      >
        <header>
          <h2 id="drawer-title" style={{ fontSize: 22 }}>
            Adjust your profile
          </h2>
          <Button
            variant="outline"
            size="sm"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={16} />
          </Button>
        </header>
        <p className="tiny muted">
          Results update as you type. Changes are saved in this browser.
        </p>
        <div className="form-grid">
          {scores.map(([key, label, max], i) => (
            <label key={key}>
              {label}
              <input
                ref={i === 0 ? first : undefined}
                type="number"
                min="0"
                max={max}
                step="any"
                value={profile[key] === null ? "" : String(profile[key])}
                onChange={(e) =>
                  set(
                    key,
                    (e.target.value === ""
                      ? null
                      : Math.min(max, Number(e.target.value))) as never,
                  )
                }
              />
            </label>
          ))}
          <label>
            Grading scale
            <input
              value={profile.gradingScale}
              placeholder="e.g. IB Diploma points"
              onChange={(e) => set("gradingScale", e.target.value)}
            />
          </label>
          <label>
            Annual budget
            <input
              type="number"
              min="0"
              step="500"
              value={profile.budget}
              onChange={(e) =>
                set("budget", Math.max(0, Number(e.target.value) || 0))
              }
            />
          </label>
          <label>
            Currency
            <select
              value={profile.currency}
              onChange={(e) => set("currency", e.target.value)}
            >
              {[...new Set([profile.currency, ...budgetCurrencies])].map(
                (c) => (
                  <option key={c}>{c}</option>
                ),
              )}
            </select>
          </label>
          <label>
            Funding you need
            <select
              value={profile.funding}
              onChange={(e) =>
                set("funding", e.target.value as Profile["funding"])
              }
            >
              <option value="FULL_RIDE">Full ride</option>
              <option value="TUITION">Full tuition</option>
              <option value="PARTIAL">Partial aid</option>
              <option value="NONE">No aid</option>
            </select>
          </label>
          <label>
            Intake
            <select
              value={profile.intake}
              onChange={(e) => set("intake", e.target.value)}
            >
              {[...new Set([profile.intake, ...intakes])].map((i) => (
                <option key={i} value={i}>
                  {i.replace("-", " ")}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Button onClick={onClose}>Show results</Button>
      </aside>
    </>
  );
}
