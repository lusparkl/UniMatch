"use client";
import { useRouter } from "next/navigation";
import { personas } from "@/lib/personas";
import { saveProfile } from "./local-store";

/** One click fills the profile with a sample student and opens the results. */
export function PersonaButtons() {
  const router = useRouter();
  return (
    <div className="personas" role="group" aria-label="Try a sample student">
      <span className="personas-label">Try a sample student</span>
      {personas.map((p) => (
        <button
          key={p.id}
          type="button"
          className="persona"
          onClick={() => {
            saveProfile(p.profile);
            router.push("/results");
          }}
        >
          <strong>{p.name}</strong>
          <span>{p.summary}</span>
        </button>
      ))}
    </div>
  );
}
