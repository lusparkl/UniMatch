"use client";
import { useRouter } from "next/navigation";
import { personas, type Persona } from "@/lib/personas";
import { saveProfile } from "./local-store";

/** Sample student cards: one click loads the profile and opens the matches. */
export function PersonaCards() {
  const router = useRouter();
  return (
    <div className="persona-cards">
      {personas.map((p) => (
        <button
          key={p.id}
          type="button"
          className="persona-card"
          onClick={() => {
            saveProfile(p.profile);
            router.push("/results");
          }}
        >
          <span className="persona-head">
            <span className="persona-initial serif" aria-hidden>
              {p.from.charAt(0)}
            </span>
            <span className="pill pill-neutral">{p.tag}</span>
          </span>
          <span>
            <span className="persona-from">From {p.from}</span>
            <span className="persona-name serif">{p.name}</span>
          </span>
          <span className="persona-facts">
            {p.facts.map(([k, v]) => (
              <span key={k}>
                <span>{k}</span>
                <span>{v}</span>
              </span>
            ))}
          </span>
          <span className="persona-cta">See their matches →</span>
        </button>
      ))}
    </div>
  );
}

/** Compact sample students that fill the profile form without leaving it. */
export function PersonaPicker({
  onPick,
}: {
  onPick: (persona: Persona) => void;
}) {
  return (
    <div className="persona-picker">
      <div className="persona-picker-label">Or start from a sample student</div>
      <div className="personas">
        {personas.map((p) => (
          <button
            key={p.id}
            type="button"
            className="persona"
            onClick={() => onPick(p)}
          >
            <strong>{p.name}</strong>
            <span>{p.summary}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
