"use client";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { Button, IconButton } from "./ui/button";
import type { Profile } from "@/lib/domain";

const scores: [keyof Profile, string, number][] = [
  ["ielts", "IELTS overall", 9],
  ["toefl", "TOEFL iBT", 120],
  ["sat", "SAT", 1600],
];
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
  count,
  onChange,
  onClose,
}: {
  profile: Profile;
  /** Programmes currently shown behind the drawer. */
  count: number;
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
        <div className="row">
          <div>
            <div className="eyebrow">Live adjustments</div>
            <h2 id="drawer-title">Scores and budget</h2>
          </div>
          <IconButton label="Close" onClick={onClose}>
            <X size={18} aria-hidden />
          </IconButton>
        </div>
        <p>
          Change a number and the matches behind this panel re-rank at once.
          Nothing is saved anywhere except this browser.
        </p>
        <label className="field">
          Annual budget
          <input
            ref={first}
            type="number"
            inputMode="decimal"
            min="0"
            step="500"
            value={profile.budget}
            onChange={(e) =>
              set("budget", Math.max(0, Number(e.target.value) || 0))
            }
          />
        </label>
        <label className="field">
          Budget currency
          <select
            value={profile.currency}
            onChange={(e) => set("currency", e.target.value)}
          >
            {[...new Set([profile.currency, ...budgetCurrencies])].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Funding preference
          <select
            value={profile.funding}
            onChange={(e) =>
              set("funding", e.target.value as Profile["funding"])
            }
          >
            <option value="FULL_RIDE">Full ride required</option>
            <option value="TUITION">Tuition scholarship required</option>
            <option value="PARTIAL">Partial funding acceptable</option>
            <option value="NONE">No scholarship required</option>
          </select>
        </label>
        {scores.map(([key, label, max]) => (
          <label className="field" key={key}>
            {label}
            <input
              type="number"
              inputMode="decimal"
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
        <div className="drawer-cta">
          <Button className="w-full" onClick={onClose}>
            Show {count} matches
          </Button>
        </div>
      </aside>
    </>
  );
}
